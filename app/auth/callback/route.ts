/**
 * PRODE.WAZ — Callback de OAuth (Google).
 *
 * Supabase redirige acá con ?code=... tras el login con Google. Intercambiamos
 * el code por sesión (PKCE: el code_verifier lo dejó el browser client en cookie,
 * el server client lo lee), creamos la fila en `user` si falta anclando la MARCA
 * correcta y mandamos a /app (el prode del club).
 *
 * La MARCA viaja por cookie `waz_oauth_brand` (la setea GoogleAuthButton antes de
 * ir a Google), NO por query del redirectTo — Supabase valida el redirect_to
 * contra su allowlist sobre la URL completa, así que el redirectTo va limpio.
 * Aceptamos también ?brand= como fallback de compatibilidad.
 *
 * Distinto de /auth/confirm, que maneja el OTP de email (verifyOtp).
 *
 * Requiere en Supabase: Auth → Providers → Google habilitado, y el host de cada
 * entorno en Redirect URLs (ej: https://prode-waz.vercel.app/**, el patrón de
 * previews y http://localhost:3000/**).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { ensureUserRowFor } from "@/lib/auth/ensure-user";
import { createClient } from "@/lib/supabase/server";

const SLUG_RE = /^[a-z0-9-]{2,32}$/;

/** Path interno seguro para redirigir. Rechaza open-redirects (//host, /\host). */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/app";
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("waz_oauth_brand")?.value;
  const fromQuery = searchParams.get("brand");
  const brand = [fromCookie, fromQuery].find((s) => s && SLUG_RE.test(s)) ?? undefined;

  // Path de error conserva la marca → el reintento sigue en el club correcto (no
  // rebota al /login genérico, que mostraría branding WAZ y, peor, anclaría a WAZ
  // al primer alta por Google).
  const errorRedirect = brand ? `/${brand}/login?error=oauth` : "/login?error=oauth";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // 1ª vez con Google: crea la fila con brand_id = la marca del link.
      // Después es no-op idempotente (la fila ya existe).
      await ensureUserRowFor(data.user, brand);
      redirect(next);
    }
  }

  redirect(errorRedirect);
}
