/**
 * Ranking · Server Queries
 *
 * Cada ranking es per-marca: filtra por brand_id explícitamente para que
 * super_admins también vean el ranking de SU marca y no la unión global.
 * Las RLS bloquearían cross-brand para member/brand_admin, pero el filtro
 * en el WHERE garantiza correctness sin depender solo de RLS.
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentBrand } from "@/lib/brands/queries";

export type RankingUserRow = {
  id: string;
  name: string;
  initials: string;
  avatar_url: string | null;
  level: string;
  total_points: number;
  joined_at: string;
  position_last_week: number | null;
  computedPosition: number;
};

/** Ranking de los top-N de una marca. Si no se pasa brandId, usa la marca del
 *  usuario autenticado. Devuelve [] si no hay marca resuelta. */
export async function getBrandRanking(
  brandId?: string,
  limit = 100
): Promise<RankingUserRow[]> {
  const supabase = await createClient();
  const resolvedBrandId = brandId ?? (await getCurrentBrand())?.id;
  if (!resolvedBrandId) return [];

  const { data, error } = await supabase
    .from("user")
    .select("id, name, initials, avatar_url, level, total_points, joined_at, position_last_week")
    .eq("brand_id", resolvedBrandId)
    .is("deleted_at", null)
    .order("total_points", { ascending: false })
    .order("joined_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[getBrandRanking] query falló", error.message);
    return [];
  }
  return (data ?? []).map((u, i) => ({ ...u, computedPosition: i + 1 })) as RankingUserRow[];
}

/** Alias de compat con la firma antigua `getGlobalRanking(limit)`. Resuelve la
 *  marca del usuario autenticado y delega. Deprecado: usar getBrandRanking. */
export async function getGlobalRanking(limit = 100): Promise<RankingUserRow[]> {
  return getBrandRanking(undefined, limit);
}

/**
 * Posición del socio DENTRO de su marca, sin cargar las N filas ni usar OFFSET.
 * La posición se deriva con dos COUNT (head) que replican el tie-break
 * del ranking: total_points DESC, y a igualdad de puntos gana el que se sumó
 * antes (joined_at ASC). El filtro brand_id es lo que hace que dos marcas
 * aisladas tengan rankings independientes.
 */
export async function getMyRankEntry(userId: string): Promise<RankingUserRow | null> {
  const supabase = await createClient();

  const { data: me, error: meErr } = await supabase
    .from("user")
    .select(
      "id, name, initials, avatar_url, level, total_points, joined_at, position_last_week, brand_id"
    )
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (meErr || !me) return null;

  const brandId = (me as { brand_id?: string }).brand_id;
  if (!brandId) return null;

  // Socios estrictamente por delante DENTRO de la misma marca.
  const { count: ahead } = await supabase
    .from("user")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .gt("total_points", me.total_points);

  const { count: tied } = await supabase
    .from("user")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .eq("total_points", me.total_points)
    .lt("joined_at", me.joined_at);

  const computedPosition = (ahead ?? 0) + (tied ?? 0) + 1;
  // `me` carga brand_id para resolver el filtro pero no se expone afuera —
  // RankingUserRow no lo incluye. El spread lo arrastra como excess property,
  // inocuo en runtime.
  return { ...(me as unknown as Omit<RankingUserRow, "computedPosition">), computedPosition };
}
