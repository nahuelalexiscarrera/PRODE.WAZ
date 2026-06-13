"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBrandAdminOf } from "@/lib/brands/queries";
import { processAchievements } from "@/lib/achievements/actions";
import {
  checkPostRateLimit,
  checkCommentRateLimit,
  checkReactionRateLimit,
} from "@/lib/social/rate-limit";
import type { TriggerContext } from "@/lib/achievements/triggers";
import type { UnlockedAchievement } from "@/components/features/AchievementModal";

// ─── Schemas ──────────────────────────────────────────────────────────

// Ahora cualquier socio puede adjuntar imagen (antes solo admin). Para que no se
// puedan postear URLs externas arbitrarias (hotlinking, tracking, contenido de
// fuera), la imagen DEBE venir del bucket público post-images de NUESTRO Storage.
// La tarjeta del prode (/api/share, ruta relativa) la inserta shareToWall aparte,
// sin pasar por este schema.
const POST_IMAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/post-images/`;

const postSchema = z.object({
  body: z.string().min(1).max(280),
  embedType: z.enum(["prediction", "match"]).optional(),
  embedRefId: z.string().uuid().optional(),
  imageUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith(POST_IMAGE_PREFIX), { message: "Origen de imagen no permitido" })
    .optional(),
  imageWidth: z.number().int().positive().max(8000).optional(),
  imageHeight: z.number().int().positive().max(8000).optional(),
});

const reactionSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.string().uuid(),
});

const commentSchema = z.object({
  postId: z.string().uuid(),
  body: z.string().min(1).max(280),
});

export type CreatePostInput = z.infer<typeof postSchema>;
export type ToggleReactionInput = z.infer<typeof reactionSchema>;
export type CreateCommentInput = z.infer<typeof commentSchema>;

// ─── Row types (shape returned by Supabase selects) ───────────────────

export type PostRow = {
  id: string;
  user_id: string;
  body: string | null;
  embed_type: string | null;
  embed_ref_id: string | null;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  reaction_count: number;
  comment_count: number;
  created_at: string;
};

export type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string | null;
  reaction_count: number;
  created_at: string;
};

// ─── Auth helper ──────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return { supabase, user };
}

// ─── Social stats for achievement evaluation ──────────────────────────

type SocialStats = {
  postsCount: number;
  bestPostReactions: number;
  distinctPostsCommented: number;
  externalSharesCount: number;
  activatedFriendsCount: number;
};

async function fetchSocialStats(userId: string): Promise<SocialStats> {
  const supabase = await createClient();
  // share_intent tiene RLS sin policy y referred_by puede no existir todavía →
  // se leen con service role para no chocar con RLS / columnas faltantes.
  const admin = createAdminClient();

  const [postsRes, commentsRes, sharesRes, referralsRes] = await Promise.all([
    supabase.from("post").select("reaction_count").eq("user_id", userId).is("deleted_at", null),
    supabase.from("comment").select("post_id").eq("user_id", userId).is("deleted_at", null),
    admin.from("share_intent").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin
      .from("user")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", userId)
      .is("deleted_at", null),
  ]);

  const posts = postsRes.data ?? [];
  const comments = commentsRes.data ?? [];

  return {
    postsCount: posts.length,
    bestPostReactions: posts.reduce((max, p) => Math.max(max, p.reaction_count ?? 0), 0),
    distinctPostsCommented: new Set(comments.map((c) => c.post_id)).size,
    externalSharesCount: sharesRes.count ?? 0,
    // referralsRes falla si la columna referred_by no existe (antes de la migración) → 0
    activatedFriendsCount: referralsRes.error ? 0 : (referralsRes.count ?? 0),
  };
}

function buildSocialCtx(userId: string, stats: SocialStats): TriggerContext {
  return {
    userId,
    exactStreak: 0,
    streakDays: 0,
    tournamentCompletionPercent: 0,
    loadedGroupFirstDay: false,
    groups: [],
    knockoutRounds: [],
    upsets: { upsetsCorrect: 0 },
    position: 0,
    weeklyPositionDelta: 0,
    postsCount: stats.postsCount,
    bestPostReactions: stats.bestPostReactions,
    commentsMadeOnDistinctPostsCount: stats.distinctPostsCommented,
    externalSharesCount: stats.externalSharesCount,
    activatedFriendsCount: stats.activatedFriendsCount,
    predictedChampionCode: null,
    actualChampionCode: null,
    tournamentEnded: false,
    tournamentWinnerUserId: null,
  };
}

/** Evalúa los logros sociales (post/comentario/share/referido) del usuario. */
export async function evalSocialAchievements(userId: string): Promise<UnlockedAchievement[]> {
  try {
    const stats = await fetchSocialStats(userId);
    const ctx = buildSocialCtx(userId, stats);
    return await processAchievements("social", ctx);
  } catch {
    // Achievement errors must never break the main action
    return [];
  }
}

// ─── Actions ──────────────────────────────────────────────────────────

export async function createPost(
  input: CreatePostInput
): Promise<{ post: PostRow; unlockedAchievements: UnlockedAchievement[] }> {
  const parsed = postSchema.parse(input);
  const { supabase, user } = await requireUser();

  await checkPostRateLimit(supabase, user.id);

  // post.brand_id NOT NULL — lo derivamos del autor para aislar el muro por marca.
  const { data: userRow } = await supabase
    .from("user")
    .select("brand_id")
    .eq("id", user.id)
    .maybeSingle();
  const brandId = (userRow as { brand_id?: string } | null)?.brand_id;
  if (!brandId) throw new Error("MISSING_BRAND");

  const { data, error } = await supabase
    .from("post")
    .insert({
      user_id: user.id,
      brand_id: brandId,
      body: parsed.body,
      embed_type: parsed.embedType ?? null,
      embed_ref_id: parsed.embedRefId ?? null,
      image_url: parsed.imageUrl ?? null,
      image_width: parsed.imageWidth ?? null,
      image_height: parsed.imageHeight ?? null,
    })
    .select(
      "id, user_id, body, embed_type, embed_ref_id, image_url, image_width, image_height, reaction_count, comment_count, created_at"
    )
    .single();

  if (error) throw error;
  revalidateTag("feed-recientes");

  const unlockedAchievements = await evalSocialAchievements(user.id);
  return { post: data as PostRow, unlockedAchievements };
}

export async function toggleReaction(input: ToggleReactionInput) {
  const parsed = reactionSchema.parse(input);
  const { supabase, user } = await requireUser();

  await checkReactionRateLimit(supabase, user.id);

  const { data: existing } = await supabase
    .from("reaction")
    .select("user_id")
    .match({ target_type: parsed.targetType, target_id: parsed.targetId, user_id: user.id })
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("reaction").delete().match({
      target_type: parsed.targetType,
      target_id: parsed.targetId,
      user_id: user.id,
    });
    if (error) throw error;
    revalidateTag("feed-recientes");
    return { reacted: false };
  }

  const { error } = await supabase.from("reaction").insert({
    target_type: parsed.targetType,
    target_id: parsed.targetId,
    user_id: user.id,
  });
  if (error) throw error;
  revalidateTag("feed-recientes");
  return { reacted: true };
}

export async function createComment(
  input: CreateCommentInput
): Promise<{ comment: CommentRow; unlockedAchievements: UnlockedAchievement[] }> {
  const parsed = commentSchema.parse(input);
  const { supabase, user } = await requireUser();

  await checkCommentRateLimit(supabase, user.id);

  // Defensa en profundidad (además de la RLS): el post objetivo debe ser de la
  // marca del autor. Evita comentar cross-brand enumerando post_ids ajenos.
  const { data: postRow } = await supabase
    .from("post")
    .select("id")
    .eq("id", parsed.postId)
    .maybeSingle();
  if (!postRow) throw new Error("POST_NOT_FOUND");

  const { data, error } = await supabase
    .from("comment")
    .insert({ post_id: parsed.postId, user_id: user.id, body: parsed.body })
    .select("id, post_id, user_id, body, reaction_count, created_at")
    .single();

  if (error) throw error;
  // El trigger de DB ya incrementó post.comment_count; refrescamos el feed
  // para que el contador no quede stale al volver al muro.
  revalidateTag("feed-recientes");

  const unlockedAchievements = await evalSocialAchievements(user.id);
  return { comment: data as CommentRow, unlockedAchievements };
}

// NOTA — por qué el soft-delete usa el cliente admin (service role):
// las policies de SELECT de post/comment son `deleted_at IS NULL`. Al setear
// deleted_at, la fila resultante deja de pasar SELECT y Postgres rechaza el
// UPDATE con 42501 ("new row violates row-level security policy"). Entonces
// autorizamos EXPLÍCITAMENTE en el server action (dueño, super_admin, o
// brand_admin DE LA MARCA del post) y hacemos el UPDATE con el service role.
// isBrandAdminOf(brandId) devuelve true para super_admin (global) y para el
// brand_admin de esa marca — así un brand_admin solo modera SU marca.

export async function deletePost(postId: string) {
  const { supabase, user } = await requireUser();
  const { data: row } = await supabase
    .from("post")
    .select("user_id, brand_id")
    .eq("id", postId)
    .maybeSingle();
  if (!row) throw new Error("NOT_FOUND");
  const brandId = (row as { brand_id?: string }).brand_id;
  const allowed =
    row.user_id === user.id || (!!brandId && (await isBrandAdminOf(brandId)));
  if (!allowed) throw new Error("FORBIDDEN");

  const { error } = await createAdminClient()
    .from("post")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) throw error;
  revalidateTag("feed-recientes");
}

export async function deleteComment(commentId: string) {
  const { supabase, user } = await requireUser();
  // El comment no lleva brand_id; lo resolvemos vía el post al que pertenece.
  const { data: row } = await supabase
    .from("comment")
    .select("user_id, post:post!post_id ( brand_id )")
    .eq("id", commentId)
    .maybeSingle();
  if (!row) throw new Error("NOT_FOUND");
  const brandId = (row as { post?: { brand_id?: string } | null }).post?.brand_id;
  const allowed =
    row.user_id === user.id || (!!brandId && (await isBrandAdminOf(brandId)));
  if (!allowed) throw new Error("FORBIDDEN");

  const { error } = await createAdminClient()
    .from("comment")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) throw error;
  revalidateTag("feed-recientes");
}
