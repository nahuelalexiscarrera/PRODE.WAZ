/**
 * PRODE.WAZ — Confirmación de email (Server-Side Auth).
 *
 * El link del mail apunta acá con ?token_hash=...&type=signup. Verificamos el
 * token (verifyOtp, que NO depende del code-verifier → funciona aunque el mail
 * se abra en otro navegador/dispositivo), creamos la fila en `user` si falta y
 * mandamos a /app. Si el token es inválido o venció, vuelve a /login.
 *
 * Requiere en Supabase: Auth → "Confirm email" activado, Site URL configurada y
 * el template "Confirm signup" apuntando a {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
 */

import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrentUserRow } from "@/lib/auth/ensure-user";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");
  // Path interno seguro: rechaza open-redirects (//host, /\host).
  const next =
    nextParam?.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\")
      ? nextParam
      : "/app";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // ensureUserRow solo es necesario en el primer signup (crea la fila en DB).
      // En recovery el user ya existe → lo saltamos para no desperdiciar queries
      // ni riesgo de race conditions en datos ya populados.
      if (type !== "recovery") {
        await ensureCurrentUserRow();
      }
      redirect(next);
    }
  }

  redirect("/login?error=confirm");
}
