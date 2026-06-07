/**
 * [brandSlug] route group layout
 *
 * Entry point URL-based para marcas: /waz, /o2, /club-alpha, etc.
 * Resuelve la marca desde el segmento dinámico del path (params.brandSlug),
 * aplica el tema visual y expone el contexto via BrandProvider.
 *
 * Si el slug no existe o la marca está inactiva → notFound() (404).
 * Si el slug es reservado, el constraint DB ya lo bloqueó al crear la marca.
 *
 * No requiere sesión — este grupo es la puerta de entrada pública.
 * La auth la manejan los sub-routes (register, login) y el middleware.
 */

import { notFound } from "next/navigation";
import { getBrandBySlug } from "@/lib/brands/queries";
import { themeToCssVars } from "@/lib/brands/theme";
import { BrandProvider } from "@/components/providers/BrandProvider";

// force-dynamic: el slug podría activarse/desactivarse en cualquier momento.
export const dynamic = "force-dynamic";

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;

  // getBrandBySlug valida el formato del slug (regex /^[a-z0-9-]{2,32}$/) y
  // filtra status='active'. Devuelve null para slugs inválidos o inactivos.
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) notFound();

  const themeStyle = themeToCssVars(brand.theme.tokens);

  return (
    <div className="auth-shell" style={themeStyle}>
      <BrandProvider brand={brand}>{children}</BrandProvider>
    </div>
  );
}
