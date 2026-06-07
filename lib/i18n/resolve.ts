/**
 * i18n · Brand placeholder resolver.
 *
 * Las strings en `es-AR.json` que dependen de la marca activa usan placeholders
 * `{brandName}`, `{hashtagSuffix}`, `{subBrand}`. Este helper los sustituye con
 * los valores de la marca resuelta en runtime (server o client). Es síncrono y
 * trivial — sin dependencias de React — para que se pueda usar tanto en server
 * components como en Edge handlers / share templates.
 *
 * Ejemplo:
 *   resolveCopy("Hacete socio {brandName} Prode", { name: "FitClub", ... })
 *   → "Hacete socio FitClub Prode"
 */

import type { BrandContext } from "@/types/domain";

type BrandSubset = Pick<BrandContext, "name" | "hashtagSuffix" | "subBrand">;

// Fallback cuando no hay marca resuelta. Alinea con DEFAULT_BRAND_SLUG ("waz"),
// la marca-plataforma por defecto.
const DEFAULT_BRAND_SUBSET: BrandSubset = {
  name: "WAZ",
  hashtagSuffix: "WAZ",
  subBrand: "Comunidad",
};

/** Reemplaza placeholders `{brandName}`, `{hashtagSuffix}`, `{subBrand}` y
 *  cualquier `{levelName}` extra que el caller quiera pasar. */
export function resolveCopy(
  template: string,
  brand: BrandSubset | BrandContext | null | undefined,
  extras?: Record<string, string>
): string {
  const b = brand ?? DEFAULT_BRAND_SUBSET;
  const replacements: Record<string, string> = {
    brandName: b.name,
    hashtagSuffix: b.hashtagSuffix,
    subBrand: b.subBrand ?? "",
    ...(extras ?? {}),
  };
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (full, key: string) => {
    const v = replacements[key];
    return v ?? full;
  });
}
