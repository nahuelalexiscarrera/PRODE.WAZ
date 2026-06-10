/**
 * [brandSlug]/forgot/page.tsx
 *
 * Recuperación de contraseña con brand pre-cargada desde la URL.
 * El contexto de marca viene del layout padre ([brandSlug]/layout.tsx) via
 * BrandProvider → ForgotPage lo consume para mantener el branding correcto y
 * que el link "Volver" regrese a /<slug>/login.
 *
 * Auth flow: idéntico a (auth)/forgot. Sin duplicación.
 */

// Re-exportar el componente de forgot existente.
// El BrandProvider del layout padre provee el contexto de marca.
export { default } from "@/app/(auth)/forgot/page";
