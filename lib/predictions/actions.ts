"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isPredictionLocked } from "@/lib/predictions/constants";

const UpsertSchema = z.object({
  matchId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

export async function upsertPrediction(input: unknown) {
  const parsed = UpsertSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos" as const };

  const { matchId, homeScore, awayScore } = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" as const };

  const { data: match, error: matchErr } = await supabase
    .from("match")
    .select("kickoff_at, status")
    .eq("id", matchId)
    .single();
  if (matchErr || !match) return { error: "Partido no encontrado" as const };

  // Solo se predice un partido programado y antes del cierre (5 min antes del
  // kickoff — regla en lib/predictions/constants). Si ya está en juego (live),
  // terminado o postergado, está cerrado. (Antes el `&& status !== "live"`
  // dejaba editar partidos EN JUEGO — bug de integridad.)
  const isOpen = match.status === "scheduled" && !isPredictionLocked(match.kickoff_at);
  if (!isOpen) {
    return { error: "El partido ya está cerrado" as const };
  }

  // Multi-marca: prediction.brand_id es NOT NULL. Lo derivamos de user.brand_id
  // server-side para que el usuario no pueda inyectar otra marca via cliente.
  const { data: userRow } = await supabase
    .from("user")
    .select("brand_id")
    .eq("id", user.id)
    .maybeSingle();
  const brandId = (userRow as { brand_id?: string } | null)?.brand_id;
  if (!brandId) return { error: "Tu cuenta no tiene marca asignada" as const };

  const { error } = await supabase.from("prediction").upsert(
    {
      user_id: user.id,
      brand_id: brandId,
      match_id: matchId,
      home_score: homeScore,
      away_score: awayScore,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,match_id" }
  );

  if (error) return { error: "Error al guardar" as const };
  return { success: true };
}

// ─── Predicción especial (campeón / subcampeón / mejor de grupos / revelación) ──

const SpecialSchema = z.object({
  championCode: z.string().trim().min(2),
  runnerUpCode: z.string().trim().min(2),
  groupStageBestCode: z.string().trim().min(2),
  revelationCode: z.string().trim().min(2),
});

export async function upsertSpecialPrediction(input: unknown) {
  const parsed = SpecialSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos" as const };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" as const };

  // Cierre: la predicción especial se bloquea cuando arranca el torneo (1er partido).
  const { data: firstMatch } = await supabase
    .from("match")
    .select("kickoff_at")
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstMatch && Date.now() >= new Date(firstMatch.kickoff_at).getTime()) {
    return { error: "El torneo ya arrancó: la predicción especial está cerrada." as const };
  }

  const { data: tournament } = await supabase
    .from("tournament")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!tournament) return { error: "Torneo no encontrado" as const };

  const { data: userRow } = await supabase
    .from("user")
    .select("brand_id")
    .eq("id", user.id)
    .maybeSingle();
  const brandId = (userRow as { brand_id?: string } | null)?.brand_id;
  if (!brandId) return { error: "Tu cuenta no tiene marca asignada" as const };

  const { error } = await supabase.from("special_prediction").upsert(
    {
      user_id: user.id,
      brand_id: brandId,
      tournament_id: tournament.id as string,
      champion_code: parsed.data.championCode,
      runner_up_code: parsed.data.runnerUpCode,
      group_stage_best_code: parsed.data.groupStageBestCode,
      revelation_code: parsed.data.revelationCode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: "No se pudo guardar la predicción especial." as const };
  return { success: true };
}
