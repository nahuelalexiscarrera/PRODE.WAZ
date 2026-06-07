"use client";

/**
 * BrandProvider — contexto de marca activa para Client Components.
 *
 * El layout (server component) resuelve la marca via getCurrentBrand() y la
 * pasa hidratada acá. Componentes profundos (ScreenHeader, Share buttons,
 * cualquier UI que dependa de logo / nombre / hashtag) hacen `useBrand()`
 * en vez de tener strings hardcoded de "O2".
 *
 * Importante: los CSS vars del theme NO se inyectan acá. Los inyecta el layout
 * server-side aplicando `style={themeToCssVars(brand.theme.tokens)}` al div
 * wrapper. Acá solo viaja la metadata (logo URL, nombre, hashtag) que la UI
 * necesita en JSX/atributos.
 */

import { createContext, useContext } from "react";
import type { BrandContext } from "@/types/domain";

const Ctx = createContext<BrandContext | null>(null);

export function BrandProvider({
  brand,
  children,
}: {
  brand: BrandContext | null;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={brand}>{children}</Ctx.Provider>;
}

/** Hook canónico. Devuelve null si todavía no se resolvió (loading, página
 *  pública sin slug, error). Los componentes deben tolerar null y fallar a
 *  defaults visuales razonables. */
export function useBrand(): BrandContext | null {
  return useContext(Ctx);
}

/** Wrapper que fuerza la presencia de marca. Tira si null — solo usar desde
 *  componentes que están guaranteed a vivir dentro del (app) group autenticado,
 *  donde el layout siempre resuelve una marca. */
export function useBrandRequired(): BrandContext {
  const b = useContext(Ctx);
  if (!b) {
    throw new Error(
      "useBrandRequired(): no hay BrandContext. ¿Olvidaste envolver con <BrandProvider> en el layout?"
    );
  }
  return b;
}
