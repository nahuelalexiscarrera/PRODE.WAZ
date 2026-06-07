/**
 * Super Admin · Server Queries
 *
 * Vistas GLOBALES de la plataforma: todas las marcas, stats agregadas,
 * rankings y admins por marca. Usa el cliente service-role (createAdminClient)
 * porque el super admin transciende las RLS per-marca.
 *
 * SEGURIDAD: estas funciones NO chequean el rol — son service-role y devuelven
 * data de todas las marcas. SOLO llamarlas desde páginas ya gateadas por el
 * layout de /app/super-admin (que verifica isSuperAdmin()). Nunca exponerlas en
 * rutas no gateadas.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { ThemeTokens } from "@/types/domain";

// ─── Global stats ────────────────────────────────────────────────────

export type GlobalStats = {
  brands: number;
  brandsActive: number;
  socios: number;
  sociosNuevos7d: number;
  predicciones: number;
  posts: number;
};

export async function getGlobalStats(): Promise<GlobalStats> {
  const admin = createAdminClient();
  const d7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const head = { count: "exact" as const, head: true };

  const [brands, brandsActive, socios, sociosNuevos7d, predicciones, posts] = await Promise.all([
    admin.from("brand").select("*", head),
    admin.from("brand").select("*", head).eq("status", "active"),
    admin.from("user").select("*", head).is("deleted_at", null),
    admin.from("user").select("*", head).is("deleted_at", null).gte("joined_at", d7),
    admin.from("prediction").select("*", head),
    admin.from("post").select("*", head).is("deleted_at", null),
  ]);

  return {
    brands: brands.count ?? 0,
    brandsActive: brandsActive.count ?? 0,
    socios: socios.count ?? 0,
    sociosNuevos7d: sociosNuevos7d.count ?? 0,
    predicciones: predicciones.count ?? 0,
    posts: posts.count ?? 0,
  };
}

// ─── Brands list (con conteo de socios) ──────────────────────────────

export type BrandWithStats = {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  subBrand: string | null;
  hashtagSuffix: string;
  logoUrl: string | null;
  themeSlug: string;
  themeName: string;
  themePrimary: string;
  status: "active" | "inactive";
  createdAt: string;
  memberCount: number;
  /** Primer admin asignado a la marca (brand_admin o super_admin). Null si ninguno. */
  adminPrincipal: { name: string; email: string } | null;
};

export async function listBrandsWithStats(): Promise<BrandWithStats[]> {
  const admin = createAdminClient();

  const { data: brands } = await admin
    .from("brand")
    .select(
      "id, slug, name, short_name, sub_brand, hashtag_suffix, logo_url, theme_slug, status, created_at, theme:theme!theme_slug(name, tokens)"
    )
    .order("created_at", { ascending: true });

  if (!brands) return [];

  // Conteo de socios + primer admin por marca — en paralelo por eficiencia.
  const [counts, adminRows] = await Promise.all([
    Promise.all(
      brands.map((b) =>
        admin
          .from("user")
          .select("*", { count: "exact", head: true })
          .eq("brand_id", b.id as string)
          .is("deleted_at", null)
      )
    ),
    Promise.all(
      brands.map((b) =>
        admin
          .from("brand_admin")
          .select("user:user!user_id(name, email)")
          .eq("brand_id", b.id as string)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      )
    ),
  ]);

  return brands.map((b, i) => {
    const theme = b.theme as { name?: string; tokens?: ThemeTokens } | null;
    const adminRow = adminRows[i];
    const adminUser = adminRow?.data?.user as { name?: string; email?: string } | null;
    return {
      id: b.id as string,
      slug: b.slug as string,
      name: b.name as string,
      shortName: (b.short_name as string | null) ?? null,
      subBrand: (b.sub_brand as string | null) ?? null,
      hashtagSuffix: b.hashtag_suffix as string,
      logoUrl: (b.logo_url as string | null) ?? null,
      themeSlug: b.theme_slug as string,
      themeName: theme?.name ?? (b.theme_slug as string),
      themePrimary: theme?.tokens?.["brand-primary"] ?? "#ccff00",
      status: b.status as "active" | "inactive",
      createdAt: b.created_at as string,
      memberCount: counts[i]?.count ?? 0,
      adminPrincipal:
        adminUser?.name && adminUser.email
          ? { name: adminUser.name, email: adminUser.email }
          : null,
    };
  });
}

// ─── Brand detail ────────────────────────────────────────────────────

export type BrandDetail = {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  subBrand: string | null;
  hashtagSuffix: string;
  logoUrl: string | null;
  themeSlug: string;
  status: "active" | "inactive";
  createdAt: string;
};

export async function getBrandDetail(brandId: string): Promise<BrandDetail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brand")
    .select(
      "id, slug, name, short_name, sub_brand, hashtag_suffix, logo_url, theme_slug, status, created_at"
    )
    .eq("id", brandId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    shortName: (data.short_name as string | null) ?? null,
    subBrand: (data.sub_brand as string | null) ?? null,
    hashtagSuffix: data.hashtag_suffix as string,
    logoUrl: (data.logo_url as string | null) ?? null,
    themeSlug: data.theme_slug as string,
    status: data.status as "active" | "inactive",
    createdAt: data.created_at as string,
  };
}

// ─── Themes (para el picker) ─────────────────────────────────────────

export type ThemeOption = {
  slug: string;
  name: string;
  tokens: ThemeTokens;
};

export async function listThemes(): Promise<ThemeOption[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("theme").select("slug, name, tokens").order("name");
  return (data ?? []).map((t) => ({
    slug: t.slug as string,
    name: t.name as string,
    tokens: t.tokens as ThemeTokens,
  }));
}

// ─── Brand admins + invites ──────────────────────────────────────────

export type BrandAdminEntry = {
  userId: string;
  name: string;
  initials: string;
  email: string;
  avatarUrl: string | null;
  role: "member" | "brand_admin" | "super_admin";
  createdAt: string;
};

export async function getBrandAdmins(brandId: string): Promise<BrandAdminEntry[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("brand_admin")
    .select("created_at, user:user!user_id(id, name, initials, email, avatar_url, role)")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });

  return (data ?? [])
    .map((r) => {
      const u = r.user as {
        id?: string;
        name?: string;
        initials?: string;
        email?: string;
        avatar_url?: string | null;
        role?: string;
      } | null;
      if (!u?.id) return null;
      return {
        userId: u.id,
        name: u.name ?? "—",
        initials: u.initials ?? (u.name ?? "—").slice(0, 2).toUpperCase(),
        email: u.email ?? "",
        avatarUrl: u.avatar_url ?? null,
        role: (u.role as BrandAdminEntry["role"]) ?? "member",
        createdAt: r.created_at as string,
      };
    })
    .filter((x): x is BrandAdminEntry => x !== null);
}

export type BrandInviteEntry = {
  id: string;
  email: string;
  createdAt: string;
};

export async function getBrandAdminInvites(brandId: string): Promise<BrandInviteEntry[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("brand_admin_invite")
    .select("id, email, created_at")
    .eq("brand_id", brandId)
    .is("consumed_at", null)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    email: r.email as string,
    createdAt: r.created_at as string,
  }));
}

// ─── Per-brand metrics + ranking ─────────────────────────────────────

export type BrandMetrics = {
  socios: number;
  predicciones: number;
  posts: number;
};

export async function getBrandMetrics(brandId: string): Promise<BrandMetrics> {
  const admin = createAdminClient();
  const head = { count: "exact" as const, head: true };
  const [socios, predicciones, posts] = await Promise.all([
    admin.from("user").select("*", head).eq("brand_id", brandId).is("deleted_at", null),
    admin.from("prediction").select("*", head).eq("brand_id", brandId),
    admin.from("post").select("*", head).eq("brand_id", brandId).is("deleted_at", null),
  ]);
  return {
    socios: socios.count ?? 0,
    predicciones: predicciones.count ?? 0,
    posts: posts.count ?? 0,
  };
}

export type BrandRankingRow = {
  position: number;
  userId: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  level: string;
  points: number;
};

export async function getBrandRankingTop(brandId: string, limit = 10): Promise<BrandRankingRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fn_ranking_for_brand", {
    p_brand_id: brandId,
    p_limit: limit,
  });
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    position: (r.position as number) ?? 0,
    userId: r.user_id as string,
    name: (r.user_name as string) ?? "—",
    initials: (r.initials as string) ?? "",
    avatarUrl: (r.avatar_url as string | null) ?? null,
    level: String(r.level ?? "1"),
    points: (r.points as number) ?? 0,
  }));
}
