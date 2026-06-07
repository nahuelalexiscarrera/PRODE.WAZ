/**
 * PRODE.WAZ — Cron: sync-results (football-data.org)
 *
 * GET/POST /api/cron/sync-results · Bearer CRON_SECRET
 *
 * Trae los 104 partidos del Mundial 2026 desde football-data.org y:
 *  - actualiza status/horario de cada partido,
 *  - CREA los cruces de eliminatorias a medida que se definen (fases se
 *    desbloquean solas),
 *  - al finalizar un partido inserta match_result + lo marca 'finished', lo que
 *    dispara fn_settle_match (puntúa predicciones → recalcula ranking).
 *
 * Clave de cruce: match.fd_id (id de football-data.org). Para los partidos de
 * grupos ya seeded, el backfill (scripts) setea fd_id la primera vez.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWcMatches, type FdMatch } from "@/lib/football-api/client";
import { TLA_TO_CODE, stageToPhase, fdStatusToMatch } from "@/lib/football-api/team-map";
import { evaluateMatchSettledForUsers } from "@/lib/achievements/match-settled";
import { broadcastPush } from "@/lib/push/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type DbMatch = {
  id: string;
  fd_id: number | null;
  home_code: string;
  away_code: string;
  status: string;
  phase: string;
};

interface SyncChange {
  fdId: number;
  action: "created" | "set_live" | "set_finished" | "set_postponed" | "linked" | "rescored";
  detail?: string;
}

async function handle(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  let fixtures: FdMatch[];
  try {
    fixtures = await getWcMatches();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const { data: tournament } = await supabase.from("tournament").select("id").limit(1).maybeSingle();
  const tournamentId = tournament?.id as string | undefined;

  const { data: dbMatchesRaw } = await supabase
    .from("match")
    .select("id, fd_id, home_code, away_code, status, phase");
  const dbMatches = (dbMatchesRaw ?? []) as DbMatch[];

  const byFdId = new Map<number, DbMatch>();
  for (const m of dbMatches) if (m.fd_id != null) byFdId.set(m.fd_id, m);

  // Índice por par de equipos + FASE para enganchar partidos que todavía no
  // tienen fd_id (primera corrida). Incluye la fase porque en el formato de 48
  // dos selecciones pueden cruzarse en grupos Y de nuevo en eliminatorias: sin
  // la fase, el cruce de knockout matchearía contra la fila de grupos. Además
  // solo indexamos los NO vinculados, para no re-matchear lo ya enganchado.
  const pairKey = (a: string, b: string, phase: string) =>
    `${[a, b].sort().join("|")}::${phase}`;
  const byPair = new Map<string, DbMatch>();
  for (const m of dbMatches) {
    if (m.fd_id == null) byPair.set(pairKey(m.home_code, m.away_code, m.phase), m);
  }

  const changes: SyncChange[] = [];
  const finishedNotifs: Array<{ homeCode: string; awayCode: string; h: number; a: number }> = [];
  const finishedMatchIds: string[] = [];
  // API2: nada se descarta en silencio. Cada skip/error queda visible en logs y
  // en la respuesta del cron, para detectar TLA sin mapeo, resultados sin score, etc.
  const skipped: Array<{ reason: string; detail: string }> = [];
  const warn = (reason: string, detail: string) => {
    skipped.push({ reason, detail });
    console.warn(`[sync-results] ${reason}: ${detail}`);
  };

  for (const fx of fixtures) {
    const homeTla = fx.homeTeam?.tla;
    const awayTla = fx.awayTeam?.tla;
    if (!homeTla || !awayTla) continue; // equipos aún sin definir (cruce futuro)

    const homeCode = TLA_TO_CODE[homeTla];
    const awayCode = TLA_TO_CODE[awayTla];
    if (!homeCode || !awayCode) {
      warn("tla-sin-mapeo", `${homeTla}/${awayTla} (fd_id ${fx.id}) — falta en TLA_TO_CODE; el partido NO se sincroniza`);
      continue;
    }

    const phase = stageToPhase(fx.stage);
    const status = fdStatusToMatch(fx.status);
    if (!phase || !status) continue;

    // Enganchar el partido local (por fd_id, o por par+fase si aún no se vinculó)
    let db = byFdId.get(fx.id) ?? byPair.get(pairKey(homeCode, awayCode, phase));

    if (!db) {
      // Cruce nuevo (eliminatorias recién definidas) → crear
      if (!tournamentId) {
        warn("sin-torneo", `no hay tournament para crear ${homeCode} vs ${awayCode} (${phase})`);
        continue;
      }
      const { data: inserted } = await supabase
        .from("match")
        .insert({
          tournament_id: tournamentId,
          phase,
          home_code: homeCode,
          away_code: awayCode,
          kickoff_at: fx.utcDate,
          status: status === "finished" ? "scheduled" : status, // si llega ya finished, settle abajo
          fd_id: fx.id,
        })
        .select("id, fd_id, home_code, away_code, status, phase")
        .single();
      if (!inserted) continue;
      db = inserted as DbMatch;
      changes.push({ fdId: fx.id, action: "created", detail: `${homeCode} vs ${awayCode} (${phase})` });
    } else if (db.fd_id == null) {
      // Vincular fd_id + refrescar horario
      await supabase.from("match").update({ fd_id: fx.id, kickoff_at: fx.utcDate }).eq("id", db.id);
      db.fd_id = fx.id;
      changes.push({ fdId: fx.id, action: "linked" });
    }

    // ── En vivo ──
    if (status === "live" && db.status === "scheduled") {
      await supabase.from("match").update({ status: "live" }).eq("id", db.id);
      changes.push({ fdId: fx.id, action: "set_live" });
    }

    // ── Postergado ──
    if (status === "postponed" && db.status === "scheduled") {
      await supabase.from("match").update({ status: "postponed" }).eq("id", db.id);
      changes.push({ fdId: fx.id, action: "set_postponed" });
    }

    // ── Finalizado (primer cierre) o corrección de un resultado ya finalizado ──
    if (status === "finished") {
      const gh = fx.score?.fullTime?.home;
      const ga = fx.score?.fullTime?.away;
      if (gh == null || ga == null) {
        warn("finished-sin-score", `${homeCode} vs ${awayCode} (fd_id ${fx.id}) llegó finished sin fullTime score`);
        continue;
      }

      // Mapear goles al orden home/away de NUESTRA fila (puede estar invertido)
      const dbHome = homeCode === db.home_code ? gh : ga;
      const dbAway = homeCode === db.home_code ? ga : gh;

      if (db.status !== "finished") {
        // Primer cierre: graba resultado y marca finished → dispara fn_settle_match.
        const { error: rErr } = await supabase.from("match_result").upsert(
          { match_id: db.id, home_score: dbHome, away_score: dbAway, finished_at: new Date().toISOString() },
          { onConflict: "match_id" }
        );
        if (rErr) {
          warn("match_result-error", `${db.id}: ${rErr.message}`);
          continue;
        }
        const { error: mErr } = await supabase.from("match").update({ status: "finished" }).eq("id", db.id);
        if (mErr) {
          warn("match-finished-error", `${db.id}: ${mErr.message}`);
          continue;
        }
        changes.push({ fdId: fx.id, action: "set_finished", detail: `${db.home_code} ${dbHome}-${dbAway} ${db.away_code}` });
        finishedNotifs.push({ homeCode: db.home_code, awayCode: db.away_code, h: dbHome, a: dbAway });
        finishedMatchIds.push(db.id);
      } else {
        // API1: ya estaba finished. Si el resultado CAMBIÓ (corrección VAR / dato
        // tardío), regraba el resultado y RE-PUNTÚA: fn_resettle_match revierte
        // los puntos viejos y recalcula sobre el nuevo score (antes quedaba viejo).
        const { data: prev } = await supabase
          .from("match_result")
          .select("home_score, away_score")
          .eq("match_id", db.id)
          .maybeSingle();
        const changedScore =
          prev != null && (prev.home_score !== dbHome || prev.away_score !== dbAway);
        if (changedScore) {
          const { error: rErr } = await supabase.from("match_result").upsert(
            { match_id: db.id, home_score: dbHome, away_score: dbAway, finished_at: new Date().toISOString() },
            { onConflict: "match_id" }
          );
          if (rErr) {
            warn("rescore-error", `${db.id}: ${rErr.message}`);
            continue;
          }
          const { error: reErr } = await supabase.rpc("fn_resettle_match", { p_match_id: db.id });
          if (reErr) {
            warn("resettle-error", `${db.id}: ${reErr.message}`);
            continue;
          }
          changes.push({
            fdId: fx.id,
            action: "rescored",
            detail: `${db.home_code} ${prev.home_score}-${prev.away_score} → ${dbHome}-${dbAway}`,
          });
          finishedMatchIds.push(db.id); // re-evaluar logros con el nuevo resultado
        }
      }
    }
  }

  for (const n of finishedNotifs) {
    await sendMatchResultNotifications(supabase, n.homeCode, n.awayCode, n.h, n.a);
  }
  await sendUpcomingMatchNotifications(supabase);

  if (finishedMatchIds.length > 0) {
    await supabase.rpc("fn_refresh_views");
    // Logros de skill (A01-A05) y posición (P01-P03/P05): el scope match-settled
    // necesita un evaluador en runtime. Para cada socio que predijo un partido
    // que acaba de cerrar, recomputamos su contexto y desbloqueamos lo que aplique.
    const { data: affected } = await supabase
      .from("prediction")
      .select("user_id")
      .in("match_id", finishedMatchIds);
    const userIds = [...new Set((affected ?? []).map((p) => p.user_id as string))];
    if (userIds.length > 0) await evaluateMatchSettledForUsers(userIds);
  }

  return NextResponse.json({
    ok: true,
    processed: fixtures.length,
    changes: changes.length,
    detail: changes,
    skipped: skipped.length,
    skippedDetail: skipped,
  });
}

// ─── Notificaciones ───────────────────────────────────────────────────

async function sendMatchResultNotifications(
  // biome-ignore lint/suspicious/noExplicitAny: helper interno; recibe el admin client de Supabase
  supabase: any,
  homeCode: string,
  awayCode: string,
  homeScore: number,
  awayScore: number
) {
  const { data: users } = await supabase.from("user").select("id").is("deleted_at", null);
  if (!users?.length) return;
  const notifs = users.map((u: { id: string }) => ({
    user_id: u.id,
    type: "match-result",
    title: "Resultado del partido",
    body: `${homeCode.toUpperCase()} ${homeScore} - ${awayScore} ${awayCode.toUpperCase()} · Mirá tus puntos`,
    deep_link: "/app",
  }));
  for (let i = 0; i < notifs.length; i += 100) {
    await supabase.from("notification").insert(notifs.slice(i, i + 100));
  }
  // Push a los suscriptos que tengan 'results' activo (default ON).
  await broadcastPush(
    {
      title: "Resultado del partido",
      body: `${homeCode.toUpperCase()} ${homeScore} - ${awayScore} ${awayCode.toUpperCase()} · Mirá tus puntos`,
      deep_link: "/app",
    },
    "results",
  );
}

async function sendUpcomingMatchNotifications(
  // biome-ignore lint/suspicious/noExplicitAny: helper interno; recibe el admin client de Supabase
  supabase: any
) {
  const now = new Date();
  const in60min = new Date(now.getTime() + 60 * 60 * 1000);
  const in30min = new Date(now.getTime() + 30 * 60 * 1000);

  const { data: upcomingMatches } = await supabase
    .from("match")
    .select("id, home_code, away_code, kickoff_at")
    .eq("status", "scheduled")
    .gte("kickoff_at", in30min.toISOString())
    .lte("kickoff_at", in60min.toISOString());
  if (!upcomingMatches?.length) return;

  for (const match of upcomingMatches) {
    const { data: usersWithPred } = await supabase
      .from("prediction")
      .select("user_id")
      .eq("match_id", match.id);
    const predicted = new Set((usersWithPred ?? []).map((p: { user_id: string }) => p.user_id));
    const { data: allUsers } = await supabase.from("user").select("id").is("deleted_at", null);
    const without = (allUsers ?? []).filter((u: { id: string }) => !predicted.has(u.id));
    if (!without.length) continue;
    const notifs = without.map((u: { id: string }) => ({
      user_id: u.id,
      type: "match-upcoming",
      title: "¡Partido en 1 hora!",
      body: `${match.home_code.toUpperCase()} vs ${match.away_code.toUpperCase()} · Cargá tu predicción`,
      deep_link: "/app/prode",
    }));
    for (let i = 0; i < notifs.length; i += 100) {
      await supabase.from("notification").insert(notifs.slice(i, i + 100));
    }
    // Push solo a los no-predictores con 'matchReminders' activo (default ON).
    await broadcastPush(
      {
        title: "¡Partido en 1 hora!",
        body: `${match.home_code.toUpperCase()} vs ${match.away_code.toUpperCase()} · Cargá tu predicción`,
        deep_link: "/app/prode",
      },
      "matchReminders",
      without.map((u: { id: string }) => u.id),
    );
  }
}

export const GET = handle;
export const POST = handle;
