"use client";

/**
 * BrandProvider — contexto de marca activa para Client Components.
 *
 * El layout (server component) resuelve la marca via getCurrentBrand() y la
 * pasa hidratada acá. Componentes profundos (ScreenHeader, Share buttons,
 * cualquier UI que dependa de logo / nombre / hashtag) hacen `useBrand()`
 * en vez de tener strings hardcoded de "O2".
 *
 * CSS vars del theme: el layout server-side los aplica al div wrapper
 * (`.mobile-container`) para que el contenido principal salga con el tema desde
 * el SSR, sin flash. PERO los overlays que se portalean a `document.body`
 * (BottomSheet, Dialog, Toast) viven FUERA de ese wrapper y, sin tratamiento,
 * caían al `--brand-primary` default de `:root` (verde lima). Por eso acá, en
 * el cliente, replicamos las vars del tema en `<html>` → cascada global que
 * cubre también los portales. Los modales abren post-mount, así que no hay flash.
 */

import { createContext, useContext, useEffect } from "react";
import type { BrandContext } from "@/types/domain";
import { themeToCssVars } from "@/lib/brands/theme";

const Ctx = createContext<BrandContext | null>(null);

export function BrandProvider({
  brand,
  children,
}: {
  brand: BrandContext | null;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const vars = themeToCssVars(brand?.theme.tokens) as Record<string, string>;
    const entries = Object.entries(vars);
    for (const [k, v] of entries) root.style.setProperty(k, v);
    return () => {
      for (const [k] of entries) root.style.removeProperty(k);
    };
  }, [brand]);

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
