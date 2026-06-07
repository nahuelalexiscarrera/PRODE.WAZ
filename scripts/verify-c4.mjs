// Verifica el lock de special_prediction (C4): bloquea tras inicio, permite antes.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l && !l.trim().startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = [];
const ts = Date.now();
const created = { users: [], tournaments: [], players: [] };

async function mkTournament(slug, firstKickISO) {
  const { data: t } = await admin.from("tournament").insert({
    slug, display_name: slug, short_name: slug, start_date: "2026-01-01", end_date: "2026-12-31",
    phase_config: { groupPhase: { groups: 1 } }, active: false,
  }).select("id").single();
  created.tournaments.push(t.id);
  await admin.from("match").insert({ tournament_id: t.id, phase: "groups", group_id: null, home_code: "ar", away_code: "br", kickoff_at: firstKickISO, status: "scheduled" });
  return t.id;
}
async function mkUserWithSpecial(brandId, tournamentId, playerId) {
  const pw = "C4!" + ts + Math.random().toString(36).slice(2, 6);
  const email = `c4-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data: au } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  created.users.push(au.user.id);
  await admin.from("user").insert({ id: au.user.id, email, name: "C4", initials: "C4", brand_id: brandId });
  const { error: spErr } = await admin.from("special_prediction").insert({
    user_id: au.user.id, tournament_id: tournamentId, brand_id: brandId,
    champion_code: "ar", runner_up_code: "br", group_stage_best_code: "jp", revelation_code: "mx",
    top_scorer_player_id: playerId,
  });
  if (spErr) throw new Error("insert special_prediction: " + spErr.message);
  const u = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await u.auth.signInWithPassword({ email, password: pw });
  return { client: u, id: au.user.id };
}

(async () => {
  const { data: brands } = await admin.from("brand").select("id,slug");
  const waz = brands.find((b) => b.slug === "waz").id;
  // dummy player (top_scorer_player_id puede ser NOT NULL)
  const { data: pl } = await admin.from("player").insert({ name: "Dummy", full_name: "Dummy Player", team_code: "ar" }).select("id").single();
  created.players.push(pl.id);

  // PAST: primer partido hace 1h → debe BLOQUEAR
  const tPast = await mkTournament(`c4-past-${ts}`, new Date(Date.now() - 3600e3).toISOString());
  const past = await mkUserWithSpecial(waz, tPast, pl.id);
  { const { error } = await past.client.from("special_prediction").update({ champion_code: "qa" }).eq("user_id", past.id);
    const { data } = await admin.from("special_prediction").select("champion_code").eq("user_id", past.id).maybeSingle();
    const blocked = !!error && data.champion_code === "ar";
    out.push(`${blocked ? "🟢 OK" : "🔴 ROTO"}  [C4-BLOCK] editar special tras inicio del torneo → ${error ? "rechazado: " + error.message.slice(0, 60) : "ACEPTADO (champion=" + data.champion_code + ")"}`); }

  // FUTURE: primer partido en 2 días → debe PERMITIR
  const tFut = await mkTournament(`c4-fut-${ts}`, new Date(Date.now() + 2 * 86400e3).toISOString());
  const fut = await mkUserWithSpecial(waz, tFut, pl.id);
  { const { error } = await fut.client.from("special_prediction").update({ champion_code: "qa" }).eq("user_id", fut.id);
    const { data } = await admin.from("special_prediction").select("champion_code").eq("user_id", fut.id).maybeSingle();
    const allowed = !error && data.champion_code === "qa";
    out.push(`${allowed ? "🟢 OK" : "🔴 ROTO"}  [C4-ALLOW] editar special antes del inicio → ${error ? "rechazado: " + error.message.slice(0, 60) : "aceptado (champion=" + data.champion_code + ")"}`); }
})().catch((e) => console.error("FATAL:", e.message)).finally(async () => {
  for (const id of created.users) { try { await admin.auth.admin.deleteUser(id); } catch {} }
  for (const id of created.tournaments) { try { await admin.from("tournament").delete().eq("id", id); } catch (e) { console.error("del tournament", e.message); } }
  for (const id of created.players) { try { await admin.from("player").delete().eq("id", id); } catch {} }
  console.log("\n======= VERIFICACIÓN C4 =======");
  out.forEach((l) => console.log(l));
  console.log("cleanup: usuarios/torneos/players de prueba borrados");
});
