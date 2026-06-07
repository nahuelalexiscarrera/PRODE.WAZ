/**
 * [brandSlug]/login/page.tsx
 *
 * Página de login con brand pre-cargada desde la URL.
 * El contexto de marca viene del layout padre ([brandSlug]/layout.tsx)
 * via BrandProvider → useBrand() dentro de LoginPage lo consume para
 * mostrar el wordmark, el badge y el hashtag de la marca correcta.
 *
 * Auth flow: idéntico a (auth)/login. Sin duplicación.
 */

// Re-exportar el componente de login existente.
// El BrandProvider del layout padre provee el contexto de marca.
export { default } from "@/app/(auth)/login/page";
