/**
 * PRODE.WAZ — Callback de OAuth (Google).
 *
 * Supabase redirige acá tras el login con Google con ?code=...&brand=<slug>&next=...
 * Intercambiamos el code por sesión (PKCE: el code_verifier lo dejó el browser
 * client en cookie, el server client lo lee), creamos la fila en `user` si falta
 * anclando la MARCA correcta (el slug viaja por el redirect, no por user_metadata
 * — Google llena el metadata con su propio perfil) y mandamos a /app.
 *
 * Distinto de /auth/confirm, que maneja el OTP de email (verifyOtp). Acá es code
 * exchange de OAuth.
 *
 * Requiere en Supabase: Auth → Providers → Google habilitado, y esta URL
 * (${NEXT_PUBLIC_APP_URL}/auth/callback) en el allowlist de Redirect URLs.
 */

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRowFor } from "@/lib/auth/ensure-user";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const brand = searchParams.get("brand"); // slug para anclar la marca en alta OAuth
  const nextParam = searchParams.get("next");
  const next = nextParam?.startsWith("/") ? nextParam : "/app";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // 1ª vez con Google: crea la fila con brand_id = la marca del link.
      // Después es no-op idempotente (la fila ya existe).
      await ensureUserRowFor(data.user, brand ?? undefined);
      redirect(next);
    }
  }

  redirect("/login?error=oauth");
}
