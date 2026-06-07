/**
 * Brands · Theme helpers
 *
 * Convierte el JSON de tokens (almacenado en brand.theme.tokens) a un objeto
 * de CSS custom properties que se aplica como `style={{...}}` en el wrapper
 * server-rendered de los layouts. Eso pinta el branding correcto desde el
 * primer byte de HTML, sin flash.
 *
 * NUNCA modifica el `:root` global de globals.css. Cada layout que llama
 * `themeToCssVars` aplica los overrides solo a su sub-árbol — los tests
 * unitarios y storybook siguen viendo los defaults de O2.
 */

import type { ThemeTokens } from "@/types/domain";

/** Tokens default (matchean `app/styles/globals.css` :root). Si la marca no
 *  define alguna key, el fallback es este. */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  "brand-primary": "#ccff00",
  "brand-primary-hover": "#b8e600",
  "brand-primary-pressed": "#a3cc00",
  "brand-primary-soft": "#dbff33",
  "brand-primary-glow": "rgba(204, 255, 0, 0.35)",
  "brand-primary-bg": "rgba(204, 255, 0, 0.12)",
  "accent-lime": "#ffffff",
  "accent-lime-soft": "rgba(255, 255, 255, 0.18)",
  "shadow-glow-primary": "0 0 24px rgba(204, 255, 0, 0.35)",
  "shadow-glow-accent": "0 0 24px rgba(255, 255, 255, 0.35)",
  "text-inverse": "#0b0b0d",
};

/** Acepta hex (#abc, #abcd, #aabbcc, #aabbccdd), rgb/rgba(), hsl/hsla(),
 *  color() y nombres CSS válidos. Filtra inyecciones como `url(javascript:...)`
 *  o `;color:red`. Los tokens vienen de una DB que solo el super admin escribe,
 *  pero el sanitizer es defensa en profundidad por si algo escapa. */
const SAFE_VALUE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^;{}]*\)|hsla?\([^;{}]*\)|[a-zA-Z]+)$/;

function sanitize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return null;
  // Box-shadow (multi-value con comas y px) requiere chequeo más permisivo.
  if (trimmed.includes("rgba(") && trimmed.match(/^\d+\s+\d+\s+\d+px\s+rgba\(/)) return trimmed;
  if (SAFE_VALUE.test(trimmed)) return trimmed;
  // Box-shadow tipo "0 0 24px rgba(...)" — permitir si no tiene caracteres peligrosos.
  if (/^[0-9a-zA-Z\s,.()#\-%/]+$/.test(trimmed)) return trimmed;
  return null;
}

/** Mapea tokens a CSS vars (prefijo `--`) listos para `style={...}` de React.
 *  Hace merge con defaults y sanitiza cada valor. */
export function themeToCssVars(
  tokens: Partial<ThemeTokens> | null | undefined
): React.CSSProperties {
  const merged = { ...DEFAULT_THEME_TOKENS, ...(tokens ?? {}) };
  const vars: Record<string, string> = {};
  for (const [key, raw] of Object.entries(merged)) {
    const safe = sanitize(raw);
    if (safe) vars[`--${key}`] = safe;
  }
  return vars as React.CSSProperties;
}

/** Variante string para inyectar en `<style>` inline o atributos serializados. */
export function themeToCssVarsString(tokens: Partial<ThemeTokens> | null | undefined): string {
  const vars = themeToCssVars(tokens);
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}
