/**
 * [brandSlug]/page.tsx — Entry point de marca
 *
 * Redirige al destino correcto según el estado de auth:
 * - Usuario ya logueado  → /app  (ya tiene sesión activa)
 * - Usuario no logueado  → /[brandSlug]/register  (onboarding con brand pre-cargada)
 *
 * El layout padre ([brandSlug]/layout.tsx) ya validó que el slug existe y está
 * activo. Este componente nunca llega a renderizarse con un slug inválido.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BrandEntryPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sesión activa → el usuario ya pertenece a su marca, lo mandamos a la app.
  if (user) redirect("/app");

  // Sin sesión → onboarding con brand pre-cargada desde la URL.
  redirect(`/${brandSlug}/register`);
}
