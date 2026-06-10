/**
 * PRODE.WAZ — Alineación one-time del fixture con football-data.org.
 *
 * Uso:  node scripts/align-fixture.mjs --dry-run   (reporte, sin tocar nada)
 *       node scripts/align-fixture.mjs              (aplica)
 *
 * Qué hace (idempotente):
 *  1. Upsert de los 48 clasificados REALES (nombres es-AR, grupo derivado de la API).
 *  2. Borra partidos que no existen en el fixture real: filas sin fd_id cuyo
 *     par(equipos)+fase no está en la API (placeholders del seed viejo, cruces
 *     sintéticos, el final tbd-1/tbd-2). Las predicciones caen en cascada.
 *  3. Borra equipos placeholder que no clasificaron (it, dk, pl, gb, ng, cl, pe,
 *     ve, cr, ws, jm, ck, om, ke, tbd-*) — salvo que alguna predicción especial
 *     los referencie: en ese caso solo les saca el grupo y lo reporta.
 *  4. Imprime verificación: 48 teams, 12 grupos × 4, partidos por fase.
 *
 * Después de correrlo, disparar el sync para crear los 104 partidos reales:
 *   POST https://<host>/api/cron/sync-results  (Authorization: Bearer CRON_SECRET)
 *   o el botón "Sincronizar fixture" en /app/admin/partidos.
 *
 * Lee credenciales de .env.local (URL + SERVICE_ROLE_KEY + FOOTBALL_DATA_TOKEN).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Load .env.local ──────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, "../.env.local");

function parseEnv(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const idx = l.indexOf("=");
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
    );
  } catch {
    throw new Error(`No se encontró .env.local en ${filePath}`);
  }
}

const env = parseEnv(envPath);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const FD_TOKEN = env.FOOTBALL_DATA_TOKEN;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !FD_TOKEN) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o FOOTBALL_DATA_TOKEN en .env.local"
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Mapeos (copia de lib/football-api/team-map.ts — .mjs no importa TS) ──

const TLA_TO_CODE = {
  ALG: "dz",
  ARG: "ar",
  AUS: "au",
  AUT: "at",
  BEL: "be",
  BIH: "ba",
  BRA: "br",
  CAN: "ca",
  CIV: "ci",
  COD: "cd",
  COL: "co",
  CPV: "cv",
  CRO: "hr",
  CUW: "cw",
  CZE: "cz",
  ECU: "ec",
  EGY: "eg",
  ENG: "gb-eng",
  ESP: "es",
  FRA: "fr",
  GER: "de",
  GHA: "gh",
  HAI: "ht",
  IRN: "ir",
  IRQ: "iq",
  JOR: "jo",
  JPN: "jp",
  KOR: "kr",
  KSA: "sa",
  MAR: "ma",
  MEX: "mx",
  NED: "nl",
  NOR: "no",
  NZL: "nz",
  PAN: "pa",
  PAR: "py",
  POR: "pt",
  QAT: "qa",
  RSA: "za",
  SCO: "gb-sct",
  SEN: "sn",
  SUI: "ch",
  SWE: "se",
  TUN: "tn",
  TUR: "tr",
  URY: "uy",
  USA: "us",
  UZB: "uz",
};

const STAGE_TO_PHASE = {
  GROUP_STAGE: "groups",
  LAST_32: "round-of-32",
  LAST_16: "round-of-16",
  QUARTER_FINALS: "quarter",
  SEMI_FINALS: "semi",
  THIRD_PLACE: "semi",
  FINAL: "final",
};

// Nombres es-AR (fuente: scripts/seed.mjs). El grupo se deriva de la API.
const TEAM_NAMES = {
  mx: "México",
  za: "Sudáfrica",
  kr: "Corea del Sur",
  cz: "Rep. Checa",
  ca: "Canadá",
  ba: "Bosnia",
  qa: "Qatar",
  ch: "Suiza",
  br: "Brasil",
  ma: "Marruecos",
  ht: "Haití",
  "gb-sct": "Escocia",
  us: "Estados Unidos",
  py: "Paraguay",
  au: "Australia",
  tr: "Turquía",
  de: "Alemania",
  cw: "Curazao",
  ci: "Costa de Marfil",
  ec: "Ecuador",
  nl: "Países Bajos",
  jp: "Japón",
  se: "Suecia",
  tn: "Túnez",
  be: "Bélgica",
  eg: "Egipto",
  ir: "Irán",
  nz: "Nueva Zelanda",
  es: "España",
  cv: "Cabo Verde",
  sa: "Arabia Saudita",
  uy: "Uruguay",
  fr: "Francia",
  sn: "Senegal",
  iq: "Irak",
  no: "Noruega",
  ar: "Argentina",
  dz: "Argelia",
  at: "Austria",
  jo: "Jordania",
  pt: "Portugal",
  cd: "RD Congo",
  uz: "Uzbekistán",
  co: "Colombia",
  "gb-eng": "Inglaterra",
  hr: "Croacia",
  gh: "Ghana",
  pa: "Panamá",
};

const pairKey = (a, b, phase) => `${[a, b].sort().join("|")}::${phase}`;

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Alineación del fixture${DRY_RUN ? " — DRY RUN (no escribe nada)" : ""}\n`);

  // 1) Fixture real
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches?season=2026", {
    headers: { "X-Auth-Token": FD_TOKEN },
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}`);
  const { matches: fixtures = [] } = await res.json();
  console.log(`API: ${fixtures.length} partidos`);

  // Grupo real por equipo (de los partidos de fase de grupos) + pares válidos
  const groupByCode = new Map();
  const validPairs = new Set();
  for (const fx of fixtures) {
    const homeTla = fx.homeTeam?.tla;
    const awayTla = fx.awayTeam?.tla;
    if (!homeTla || !awayTla) continue;
    const home = TLA_TO_CODE[homeTla];
    const away = TLA_TO_CODE[awayTla];
    const phase = STAGE_TO_PHASE[fx.stage];
    if (!home || !away || !phase) continue;
    validPairs.add(pairKey(home, away, phase));
    if (phase === "groups" && fx.group?.startsWith("GROUP_")) {
      const g = fx.group.slice(6);
      groupByCode.set(home, g);
      groupByCode.set(away, g);
    }
  }
  const realCodes = new Set(groupByCode.keys());
  console.log(`API: ${realCodes.size} equipos reales, ${validPairs.size} cruces definidos\n`);

  // 2) Upsert de los 48 reales
  const teamRows = [...realCodes].map((code) => ({
    code,
    name: TEAM_NAMES[code] ?? code.toUpperCase(),
    group_id: groupByCode.get(code) ?? null,
  }));
  if (DRY_RUN) {
    console.log(`[dry-run] upsert de ${teamRows.length} equipos reales`);
  } else {
    const { error } = await supabase.from("team").upsert(teamRows, { onConflict: "code" });
    if (error) throw new Error(`upsert teams: ${error.message}`);
    console.log(`✓ upsert de ${teamRows.length} equipos reales`);
  }

  // 3) Partidos que no existen en el fixture real
  const { data: dbMatches, error: mErr } = await supabase
    .from("match")
    .select("id, fd_id, phase, group_id, home_code, away_code, kickoff_at, status");
  if (mErr) throw new Error(`select match: ${mErr.message}`);

  const toDelete = (dbMatches ?? []).filter((m) => {
    if (!realCodes.has(m.home_code) || !realCodes.has(m.away_code)) return true; // tbd-*, equipos no clasificados
    if (m.fd_id != null) return false; // ya linkeado al fixture real
    return !validPairs.has(pairKey(m.home_code, m.away_code, m.phase));
  });

  if (toDelete.length === 0) {
    console.log("✓ sin partidos placeholder para borrar");
  } else {
    console.log(`Partidos a borrar (${toDelete.length}):`);
    for (const m of toDelete) {
      const { count } = await supabase
        .from("prediction")
        .select("*", { count: "exact", head: true })
        .eq("match_id", m.id);
      console.log(
        `  - ${m.home_code} vs ${m.away_code} (${m.phase}${m.group_id ? ` ${m.group_id}` : ""}) ` +
          `${m.kickoff_at} · ${count ?? 0} predicciones en cascada`
      );
    }
    if (!DRY_RUN) {
      const ids = toDelete.map((m) => m.id);
      const { error } = await supabase.from("match").delete().in("id", ids);
      if (error) throw new Error(`delete matches: ${error.message}`);
      console.log(`✓ ${toDelete.length} partidos placeholder borrados`);
    }
  }

  // 4) Equipos placeholder no clasificados
  const { data: allTeams, error: tErr } = await supabase
    .from("team")
    .select("code, name, group_id");
  if (tErr) throw new Error(`select team: ${tErr.message}`);
  const phantomTeams = (allTeams ?? []).filter((t) => !realCodes.has(t.code));

  for (const t of phantomTeams) {
    // ¿Alguna predicción especial lo referencia? (FK sin cascada)
    const { data: refs } = await supabase
      .from("special_prediction")
      .select("user_id")
      .or(
        `champion_code.eq.${t.code},runner_up_code.eq.${t.code},group_stage_best_code.eq.${t.code},revelation_code.eq.${t.code}`
      )
      .limit(1);
    const referenced = (refs ?? []).length > 0;

    if (referenced) {
      console.log(
        `  ~ ${t.code} (${t.name}): referenciado por predicción especial → solo se le saca el grupo`
      );
      if (!DRY_RUN) {
        await supabase.from("team").update({ group_id: null }).eq("code", t.code);
      }
    } else {
      console.log(`  - ${t.code} (${t.name}): no clasificó → borrar`);
      if (!DRY_RUN) {
        const { error } = await supabase.from("team").delete().eq("code", t.code);
        if (error) console.log(`    ! no se pudo borrar: ${error.message}`);
      }
    }
  }
  if (phantomTeams.length === 0) console.log("✓ sin equipos placeholder");

  // 5) Verificación final
  console.log("\n─── Verificación ───");
  const { data: teams } = await supabase.from("team").select("code, group_id");
  const byGroup = new Map();
  for (const t of teams ?? []) {
    if (!t.group_id) continue;
    byGroup.set(t.group_id, (byGroup.get(t.group_id) ?? 0) + 1);
  }
  console.log(
    `Equipos: ${(teams ?? []).length} (con grupo: ${[...byGroup.values()].reduce((a, b) => a + b, 0)})`
  );
  for (const g of [..."ABCDEFGHIJKL"]) {
    const n = byGroup.get(g) ?? 0;
    if (n !== 4) console.log(`  ! Grupo ${g}: ${n} equipos (esperado 4)`);
  }

  const { data: remaining } = await supabase.from("match").select("phase, group_id, fd_id");
  const byPhase = new Map();
  let groupsSinGroupId = 0;
  let sinFdId = 0;
  for (const m of remaining ?? []) {
    byPhase.set(m.phase, (byPhase.get(m.phase) ?? 0) + 1);
    if (m.phase === "groups" && !m.group_id) groupsSinGroupId++;
    if (m.fd_id == null) sinFdId++;
  }
  console.log(`Partidos: ${(remaining ?? []).length}`, Object.fromEntries(byPhase));
  if (groupsSinGroupId)
    console.log(`  ! ${groupsSinGroupId} partidos de grupos SIN group_id (el sync los completa)`);
  if (sinFdId) console.log(`  · ${sinFdId} partidos sin fd_id (el sync los linkea por par+fase)`);

  console.log(
    DRY_RUN
      ? "\nDry run terminado. Correr sin --dry-run para aplicar."
      : "\nListo. Ahora disparar el sync (botón en /app/admin/partidos o POST al cron) para crear/linkear los 104 partidos reales."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
