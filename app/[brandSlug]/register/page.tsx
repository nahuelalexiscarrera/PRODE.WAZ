/**
 * [brandSlug]/register/page.tsx — Server wrapper del formulario de registro
 *
 * Dos responsabilidades del server component:
 *  1. Si el usuario ya tiene sesión activa → redirige a /app (ya está logueado).
 *  2. Renderiza RegisterPage (client component) con la marca del URL ya en
 *     BrandProvider, de modo que useBrand() y useBrandSlug() la consumen.
 *
 * Diseño, validación y auth flow: idénticos a (auth)/register/page.tsx.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RegisterPage from "@/app/(auth)/register/page";

export const dynamic = "force-dynamic";

export default async function BrandRegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sesión activa → ya registrado, no tiene sentido volver a registrarse.
  if (user) redirect("/app");

  return <RegisterPage />;
}
