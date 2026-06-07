/**
 * GET /api/share/[template]/[userId]?format=story|square&contextId=<uuid>
 *
 * Generates a share PNG using @vercel/og (Satori).
 * Fonts: place Anton-Regular.ttf + Inter-Bold.ttf in /public/fonts/ for production.
 * Fallback: Satori uses system monospace if fonts are not available.
 */

import { fetchShareData } from "@/lib/share/dataFetchers";
import { renderTemplate } from "@/lib/share/render";
import {
  type BrandShareContext,
  DEFAULT_SHARE_BRAND,
  type ShareFormat,
  type ShareTemplateId,
} from "@/lib/share/templates";
import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

/** Convierte un hex (#rrggbb o #rgb) a "r,g,b" para usar inline en rgba(). */
function hexToRgb(hex: string): string | null {
  const m6 = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (m6?.[1]) {
    const hexStr = m6[1];
    const r = Number.parseInt(hexStr.slice(0, 2), 16);
    const g = Number.parseInt(hexStr.slice(2, 4), 16);
    const b = Number.parseInt(hexStr.slice(4, 6), 16);
    return `${r},${g},${b}`;
  }
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex.trim());
  if (m3?.[1] && m3[2] && m3[3]) {
    const r = Number.parseInt(m3[1] + m3[1], 16);
    const g = Number.parseInt(m3[2] + m3[2], 16);
    const b = Number.parseInt(m3[3] + m3[3], 16);
    return `${r},${g},${b}`;
  }
  return null;
}

/** Fetcha la marca del user (vía API HTTP a un endpoint Node) en edge runtime.
 *  El edge runtime no puede usar el server client de supabase-ssr (cookies); en
 *  vez de eso golpeamos un endpoint interno que devuelve la marca. Para evitar
 *  agregar otro endpoint en esta migración, hacemos la query directa con el
 *  REST API público de Supabase y la service_role key. */
async function fetchBrandForUser(userId: string, origin: string): Promise<BrandShareContext> {
  // Variables públicas en edge — leemos del environment.
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return DEFAULT_SHARE_BRAND;

  try {
    // PostgREST: SELECT brand_id FROM "user" WHERE id = userId
    const userRes = await fetch(`${SUPABASE_URL}/rest/v1/user?id=eq.${userId}&select=brand_id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const userRows = (await userRes.json()) as Array<{ brand_id?: string }> | null;
    const brandId = userRows?.[0]?.brand_id;
    if (!brandId) return DEFAULT_SHARE_BRAND;

    // SELECT brand + theme JOIN
    const brandRes = await fetch(
      `${SUPABASE_URL}/rest/v1/brand?id=eq.${brandId}&select=name,hashtag_suffix,logo_url,theme:theme!theme_slug(tokens)`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const brandRows = (await brandRes.json()) as Array<{
      name?: string;
      hashtag_suffix?: string;
      logo_url?: string | null;
      theme?: { tokens?: Record<string, string> } | null;
    }> | null;
    const b = brandRows?.[0];
    if (!b) return DEFAULT_SHARE_BRAND;

    const tokens = b.theme?.tokens ?? {};
    const primary = tokens["brand-primary"] ?? DEFAULT_SHARE_BRAND.primary;
    const accent = tokens["accent-lime"] ?? DEFAULT_SHARE_BRAND.accent;
    const logoUrl = b.logo_url || DEFAULT_SHARE_BRAND.logoUrl;
    const absoluteLogoUrl = logoUrl.startsWith("http") ? logoUrl : `${origin}${logoUrl}`;

    return {
      primary,
      primaryRGB: hexToRgb(primary) ?? DEFAULT_SHARE_BRAND.primaryRGB,
      accent,
      accentRGB: hexToRgb(accent) ?? DEFAULT_SHARE_BRAND.accentRGB,
      name: b.name ?? DEFAULT_SHARE_BRAND.name,
      hashtagSuffix: b.hashtag_suffix ?? DEFAULT_SHARE_BRAND.hashtagSuffix,
      logoUrl: absoluteLogoUrl,
    };
  } catch {
    return DEFAULT_SHARE_BRAND;
  }
}

const VALID_TEMPLATES = new Set(["summary", "position", "match", "achievement"]);

async function tryFetchFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ template: string; userId: string }> }
) {
  const { template, userId } = await params;
  const { searchParams } = request.nextUrl;
  const format: ShareFormat = searchParams.get("format") === "square" ? "square" : "story";
  const contextId = searchParams.get("contextId") ?? undefined;

  if (!VALID_TEMPLATES.has(template)) {
    return new Response("Invalid template", { status: 400 });
  }

  const dims = format === "story" ? { width: 1080, height: 1920 } : { width: 1080, height: 1080 };

  // Fetch fonts, share data y brand context en paralelo.
  // Fonts loaded from /public/fonts/ (must be placed there for production).
  const origin = new URL("/", request.url).origin;
  const [antonData, interData, shareData, brand] = await Promise.all([
    tryFetchFont(`${origin}/fonts/Anton-Regular.ttf`),
    tryFetchFont(`${origin}/fonts/Inter-Bold.ttf`),
    fetchShareData(template as ShareTemplateId, userId, contextId),
    fetchBrandForUser(userId, origin),
  ]);

  if (!shareData) {
    return new Response("Data not found", { status: 404 });
  }

  const fonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"] = [];
  if (antonData) fonts.push({ name: "Anton", data: antonData, style: "normal", weight: 400 });
  if (interData) fonts.push({ name: "Inter", data: interData, style: "normal", weight: 700 });

  const jsx = renderTemplate(shareData, format, origin, brand);

  return new ImageResponse(jsx, {
    ...dims,
    fonts,
    headers: {
      // Caché corta: el share es un snapshot per-usuario (posición/puntos/tema
      // cambian seguido). Antes (s-maxage 1h) un cambio de tema/puntos no se
      // reflejaba hasta vencer la caché. Ahora refresca en ~1 min; el ?v=<tema>
      // del ShareButton además lo hace inmediato al cambiar el tema.
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      "Cache-Tag": `user-${userId}`,
    },
  });
}
