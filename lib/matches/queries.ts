/**
 * PRODE.WAZ — Matches · Server Queries
 */

import { createClient } from "@/lib/supabase/server";
import type { Phase } from "@/types/domain";

const MATCH_FIELDS = `
  id, phase, group_id, home_code, away_code,
  kickoff_at, venue_city, status, is_bonus_match,
  live_home_score, live_away_score, live_updated_at,
  home_team:team!home_code ( code, name ),
  away_team:team!away_code ( code, name ),
  result:match_result ( home_score, away_score, finished_at )
` as const;

export async function getMatchesByGroup(groupId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match")
    .select(MATCH_FIELDS)
    .eq("group_id", groupId.toUpperCase())
    .order("kickoff_at", { ascending: true });
  if (error) {
    console.error("[getMatchesByGroup] query falló", error.message);
    return [];
  }
  return data ?? [];
}

export type MatchWithTeams = Awaited<ReturnType<typeof getMatchesByGroup>>[number];

/** Próximo partido SCHEDULED (no live: los partidos en curso van por
 *  getLiveMatches y se muestran en su propia sección "En vivo"). */
export async function getNextMatch() {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("match")
    .select(MATCH_FIELDS)
    .eq("status", "scheduled")
    .gte("kickoff_at", now)
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[getNextMatch] scheduled query falló", error.message);
    return null;
  }
  return data;
}

export type NextMatchRow = Awaited<ReturnType<typeof getNextMatch>>;

/** Partidos EN VIVO (status='live'), con su marcador parcial (live_*).
 *  Pueden ser varios simultáneos en el Mundial. Ordenados por kickoff. */
export async function getLiveMatches() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match")
    .select(MATCH_FIELDS)
    .eq("status", "live")
    .order("kickoff_at", { ascending: true });
  if (error) {
    console.error("[getLiveMatches] query falló", error.message);
    return [];
  }
  return data ?? [];
}

export type LiveMatchRow = Awaited<ReturnType<typeof getLiveMatches>>[number];

export async function getKnockoutMatches() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match")
    .select(MATCH_FIELDS)
    .in("phase", ["round-of-32", "round-of-16", "quarter", "semi", "final"])
    .order("kickoff_at", { ascending: true });
  if (error) {
    console.error("[getKnockoutMatches] query falló", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Devuelve la fase actual del torneo activo.
 * Usa el partido más avanzado (live o finished). Fallback: "groups".
 */
export async function getCurrentPhase(): Promise<Phase> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("match")
    .select("phase")
    .in("status", ["live", "finished"])
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.phase) return data.phase as Phase;
  return "groups";
}
