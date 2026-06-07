/**
 * Brands · Server Queries
 *
 * Paralela a `lib/users/queries.ts`. Resuelve la marca activa del usuario
 * autenticado, marcas por slug (para el flow de registro pre-login), y guards
 * de rol (super_admin, brand_admin).
 *
 * Reusa el patrón fail-safe de `getIsAdmin()`: cualquier error → null/false.
 * Nunca tira excepciones que rompan el render del layout (los layouts las
 * llaman como primera operación; si fallaran, toda la app dejaría de pintar).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Brand, BrandContext, Theme, ThemeTokens } from "@/types/domain";
import { cache } from "react";

const DEFAULT_BRAND_SLUG = "waz";

const BRAND_WITH_THEME_COLS = `
  id, slug, name, short_name, sub_brand, hashtag_suffix, logo_url,
  theme_slug, status, created_at,
  theme:theme!theme_slug ( slug, name, tokens )
` as const;

type BrandRowWithTheme = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  sub_brand: string | null;
  hashtag_suffix: string;
  logo_url: string | null;
  theme_slug: string;
  status: "active" | "inactive";
  created_at: string;
  theme: { slug: string; name: string; tokens: ThemeTokens } | null;
};

function rowToBrandContext(row: BrandRowWithTheme): BrandContext {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.short_name ?? row.name,
    subBrand: row.sub_brand,
    hashtagSuffix: row.hashtag_suffix,
    logoUrl: row.logo_url ?? null,
    theme: row.theme
      ? { slug: row.theme.slug, name: row.theme.name, tokens: row.theme.tokens }
      : { slug: row.theme_slug, name: row.theme_slug, tokens: {} as ThemeTokens },
  };
}

/** Marca del usuario autenticado, con su theme joineado.
 *  Cached per-request via React.cache para evitar N queries del mismo layout/page. */
export const getCurrentBrand = cache(async (): Promise<BrandContext | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: userRow, error: userErr } = await supabase
      .from("user")
      .select("brand_id")
      .eq("id", user.id)
      .maybeSingle();
    if (userErr || !userRow?.brand_id) return null;

    const { data, error } = await supabase
      .from("brand")
      .select(BRAND_WITH_THEME_COLS)
      .eq("id", userRow.brand_id)
      .maybeSingle();
    if (error || !data) return null;

    return rowToBrandContext(data as unknown as BrandRowWithTheme);
  } catch {
    return null;
  }
});

/** Marca por slug — usado por las auth pages (login/register) para hidratar
 *  branding antes de que haya sesión. Permite ?brand=<slug>.
 *  Usa el server client (RLS deja leer brands activas a anónimos). */
export const getBrandBySlug = cache(async (slug: string): Promise<BrandContext | null> => {
  if (!slug || !/^[a-z0-9-]{2,32}$/.test(slug)) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("brand")
      .select(BRAND_WITH_THEME_COLS)
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return null;
    return rowToBrandContext(data as unknown as BrandRowWithTheme);
  } catch {
    return null;
  }
});

/** Marca default (O2) — fallback cuando el usuario está pre-auth y no hay
 *  query param ni cookie. Garantiza que las páginas públicas siempre tengan
 *  un branding para pintar. */
export const getDefaultBrand = cache(async (): Promise<BrandContext | null> => {
  return getBrandBySlug(DEFAULT_BRAND_SLUG);
});

/** Resolución compuesta para auth pages: query param > cookie > default.
 *  El cookie no se lee acá (no hay headers en esta capa); el caller pasa el
 *  slug que prefiera. */
export async function resolveAuthBrand(preferredSlug: string | null): Promise<BrandContext | null> {
  if (preferredSlug) {
    const byPref = await getBrandBySlug(preferredSlug);
    if (byPref) return byPref;
  }
  return getDefaultBrand();
}

/** Lista de marcas activas — usado por el super admin UI (próximo turno) y
 *  por los crons que iteran por marca. Sin cache porque cambia poco pero
 *  cuando cambia debemos verlo. */
export async function listActiveBrands(): Promise<Brand[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brand")
    .select(
      "id, slug, name, short_name, sub_brand, hashtag_suffix, logo_url, theme_slug, status, created_at"
    )
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    shortName: (r.short_name as string | null) ?? null,
    subBrand: (r.sub_brand as string | null) ?? null,
    hashtagSuffix: r.hashtag_suffix as string,
    logoUrl: (r.logo_url as string | null) ?? null,
    themeSlug: r.theme_slug as string,
    status: r.status as Brand["status"],
    createdAt: r.created_at as string,
  }));
}

/** Marca de un user arbitrario (para el endpoint de share, que busca por userId
 *  sin necesariamente haber sesión propia). Usa admin client por simplicidad
 *  porque las RLS impedirían leer users de otra marca. */
export async function getBrandForUserId(userId: string): Promise<BrandContext | null> {
  if (!userId) return null;
  try {
    const admin = createAdminClient();
    const { data: u, error: uErr } = await admin
      .from("user")
      .select("brand_id")
      .eq("id", userId)
      .maybeSingle();
    if (uErr || !u?.brand_id) return null;

    const { data, error } = await admin
      .from("brand")
      .select(BRAND_WITH_THEME_COLS)
      .eq("id", u.brand_id)
      .maybeSingle();
    if (error || !data) return null;
    return rowToBrandContext(data as unknown as BrandRowWithTheme);
  } catch {
    return null;
  }
}

/** Rol del usuario actual. null si no hay sesión. */
export async function getCurrentRole(): Promise<"member" | "brand_admin" | "super_admin" | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("user").select("role").eq("id", user.id).maybeSingle();
    const role = (data as { role?: string } | null)?.role;
    if (role === "super_admin" || role === "brand_admin" || role === "member") return role;
    return null;
  } catch {
    return null;
  }
}

export async function isSuperAdmin(): Promise<boolean> {
  return (await getCurrentRole()) === "super_admin";
}

/** Guard server-side. Tira si no es super admin. Usar en server actions
 *  sensibles (crear marca, asignar admin, etc.). */
export async function assertSuperAdmin(): Promise<void> {
  if (!(await isSuperAdmin())) {
    throw new Error("Forbidden: super admin required");
  }
}

/** ¿El usuario actual administra la marca indicada (o es super admin)? */
export async function isBrandAdminOf(brandId: string): Promise<boolean> {
  try {
    if (await isSuperAdmin()) return true;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { count } = await supabase
      .from("brand_admin")
      .select("brand_id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .eq("user_id", user.id);
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function assertBrandAdminOf(brandId: string): Promise<void> {
  if (!(await isBrandAdminOf(brandId))) {
    throw new Error("Forbidden: brand admin required");
  }
}

export { DEFAULT_BRAND_SLUG };
