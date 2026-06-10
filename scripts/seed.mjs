/**
 * PRODE.WAZ — Seed Script
 * Inserta los datos del Mundial 2026 en la DB de Supabase.
 *
 * Uso: node scripts/seed.mjs
 *
 * Lee credenciales de .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 * Usa la service role key para saltear RLS en tablas de referencia.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";

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
const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SERVICE_ROLE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Tournament ───────────────────────────────────────────────────────

const TOURNAMENT_ID = "00000000-0000-0000-0000-000000002026";

async function seedTournament() {
  const { error } = await supabase.from("tournament").upsert(
    {
      id: TOURNAMENT_ID,
      slug: "mundial-2026",
      display_name: "Copa del Mundo FIFA 2026",
      short_name: "Mundial 2026",
      start_date: "2026-06-11",
      end_date: "2026-07-19",
      phase_config: {
        phases: ["groups", "round-of-32", "round-of-16", "quarter", "semi", "final"],
        multipliers: { groups: 1, "round-of-32": 2, "round-of-16": 2, quarter: 3, semi: 4, final: 5 },
      },
      active: true,
    },
    { onConflict: "slug" }
  );
  if (error) throw error;
  console.log("✓ tournament");
}

// ─── Groups ───────────────────────────────────────────────────────────

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

async function seedGroups() {
  const rows = GROUPS.map((letter) => ({
    id: letter,
    tournament_id: TOURNAMENT_ID,
    letter,
  }));
  const { error } = await supabase.from("groups").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  console.log(`✓ groups (${rows.length})`);
}

// ─── Teams ────────────────────────────────────────────────────────────

// Mundial 2026 — sorteo final (5 dic 2025) con repechajes resueltos (mar 2026).
// code = ISO del archivo de bandera en /public/flags. Orden = posición de sorteo.
const TEAMS = [
  // Grupo A
  { code: "mx",     name: "México",          group_id: "A" },
  { code: "za",     name: "Sudáfrica",       group_id: "A" },
  { code: "kr",     name: "Corea del Sur",   group_id: "A" },
  { code: "cz",     name: "Rep. Checa",      group_id: "A" },
  // Grupo B
  { code: "ca",     name: "Canadá",          group_id: "B" },
  { code: "ba",     name: "Bosnia",          group_id: "B" },
  { code: "qa",     name: "Qatar",           group_id: "B" },
  { code: "ch",     name: "Suiza",           group_id: "B" },
  // Grupo C
  { code: "br",     name: "Brasil",          group_id: "C" },
  { code: "ma",     name: "Marruecos",       group_id: "C" },
  { code: "ht",     name: "Haití",           group_id: "C" },
  { code: "gb-sct", name: "Escocia",         group_id: "C" },
  // Grupo D
  { code: "us",     name: "Estados Unidos",  group_id: "D" },
  { code: "py",     name: "Paraguay",        group_id: "D" },
  { code: "au",     name: "Australia",       group_id: "D" },
  { code: "tr",     name: "Turquía",         group_id: "D" },
  // Grupo E
  { code: "de",     name: "Alemania",        group_id: "E" },
  { code: "cw",     name: "Curazao",         group_id: "E" },
  { code: "ci",     name: "Costa de Marfil", group_id: "E" },
  { code: "ec",     name: "Ecuador",         group_id: "E" },
  // Grupo F
  { code: "nl",     name: "Países Bajos",    group_id: "F" },
  { code: "jp",     name: "Japón",           group_id: "F" },
  { code: "se",     name: "Suecia",          group_id: "F" },
  { code: "tn",     name: "Túnez",           group_id: "F" },
  // Grupo G
  { code: "be",     name: "Bélgica",         group_id: "G" },
  { code: "eg",     name: "Egipto",          group_id: "G" },
  { code: "ir",     name: "Irán",            group_id: "G" },
  { code: "nz",     name: "Nueva Zelanda",   group_id: "G" },
  // Grupo H
  { code: "es",     name: "España",          group_id: "H" },
  { code: "cv",     name: "Cabo Verde",      group_id: "H" },
  { code: "sa",     name: "Arabia Saudita",  group_id: "H" },
  { code: "uy",     name: "Uruguay",         group_id: "H" },
  // Grupo I
  { code: "fr",     name: "Francia",         group_id: "I" },
  { code: "sn",     name: "Senegal",         group_id: "I" },
  { code: "iq",     name: "Irak",            group_id: "I" },
  { code: "no",     name: "Noruega",         group_id: "I" },
  // Grupo J
  { code: "ar",     name: "Argentina",       group_id: "J" },
  { code: "dz",     name: "Argelia",         group_id: "J" },
  { code: "at",     name: "Austria",         group_id: "J" },
  { code: "jo",     name: "Jordania",        group_id: "J" },
  // Grupo K
  { code: "pt",     name: "Portugal",        group_id: "K" },
  { code: "cd",     name: "RD Congo",        group_id: "K" },
  { code: "uz",     name: "Uzbekistán",      group_id: "K" },
  { code: "co",     name: "Colombia",        group_id: "K" },
  // Grupo L
  { code: "gb-eng", name: "Inglaterra",      group_id: "L" },
  { code: "hr",     name: "Croacia",         group_id: "L" },
  { code: "gh",     name: "Ghana",           group_id: "L" },
  { code: "pa",     name: "Panamá",          group_id: "L" },
];

async function seedTeams() {
  const { error } = await supabase
    .from("team")
    .upsert(TEAMS, { onConflict: "code" });
  if (error) throw error;
  console.log(`✓ teams (${TEAMS.length})`);
}

// ─── Matches ──────────────────────────────────────────────────────────
//
// NO se seedean partidos a mano: el fixture real (104 partidos, con fd_id,
// group_id y horarios oficiales) lo crea y mantiene el sync de
// football-data.org — cron /api/cron/sync-results (Bearer CRON_SECRET) o el
// botón "Sincronizar fixture" en /app/admin/partidos. Un pairing inventado
// genera filas fantasma que el sync no puede linkear (limpieza:
// scripts/align-fixture.mjs).

// ─── Achievement catalog ─────────────────────────────────────────────
//
// Source of truth: lib/achievements/catalog.ts (TS).
// Mirror legible para seed: data/mocks/achievements.json.
// Si cambia el catálogo, actualizar ambos en paralelo (regla CLAUDE.md §4).

async function seedAchievements() {
  const file = join(__dir, "../data/mocks/achievements.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const items = raw.catalog ?? [];

  if (items.length === 0) {
    throw new Error("data/mocks/achievements.json vacío o malformado");
  }

  const rows = items.map((a) => ({
    id: a.id,
    category: a.category,
    name: a.name,
    description: a.description,
    icon_ref: a.iconRef,
    points_bonus: a.pointsBonus,
    trigger_key: a.triggerKey,
  }));

  const { error } = await supabase
    .from("achievement_catalog")
    .upsert(rows, { onConflict: "id" });
  if (error) throw error;
  console.log(`✓ achievement_catalog (${rows.length} logros)`);
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("Iniciando seed de PRODE.WAZ — Mundial 2026...\n");
  try {
    await seedTournament();
    await seedGroups();
    await seedTeams();
    await seedAchievements();
    console.log("\nSeed completado.");
    console.log("Partidos: correr el sync de football-data.org (botón en /app/admin/partidos");
    console.log("o POST /api/cron/sync-results con Bearer CRON_SECRET) para crear el fixture.");
  } catch (err) {
    console.error("\nError en seed:", err.message ?? err);
    process.exit(1);
  }
}

main();
