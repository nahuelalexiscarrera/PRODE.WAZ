/**
 * (auth) route group layout
 * Login, Register, Forgot, Reset password. Sin BottomNav.
 *
 * Multi-marca: resuelve la marca desde `?brand=<slug>` (typical: link de
 * invitación) o desde la cookie `o2p_brand` persistente (usuarios que
 * vuelven). Si no hay ninguna pista, cae al default `DEFAULT_BRAND_SLUG`
 * ('waz') para que la página siempre tenga branding aunque sea genérico.
 *
 * El cookie se setea cuando viene un `?brand=` válido para que el siguiente
 * `/login` o `/forgot` siga mostrando el branding correcto sin necesidad de
 * repetir el query param.
 */

import { cookies, headers } from "next/headers";
import { resolveAuthBrand } from "@/lib/brands/queries";
import { themeToCssVars } from "@/lib/brands/theme";
import { BrandProvider } from "@/components/providers/BrandProvider";

export const dynamic = "force-dynamic";

const BRAND_COOKIE = "o2p_brand";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 días

async function readBrandSlug(): Promise<string | null> {
  // Query param ?brand=<slug> tiene prioridad — si viene, persistimos en cookie.
  const h = await headers();
  const url = h.get("x-url") ?? h.get("referer") ?? "";
  try {
    if (url) {
      const u = new URL(url, "http://x");
      const fromQuery = u.searchParams.get("brand");
      if (fromQuery && /^[a-z0-9-]{2,32}$/.test(fromQuery)) {
        // No podemos setear cookie desde un Server Component layout (Next.js no
        // lo permite). Lo deja para que el middleware o el primer route handler
        // post-flow lo persista. Por ahora confiamos en el query param siempre
        // viniendo en el link de invitación.
        return fromQuery;
      }
    }
  } catch {
    /* parseo URL falló — ignorar */
  }

  const c = await cookies();
  const fromCookie = c.get(BRAND_COOKIE)?.value;
  if (fromCookie && /^[a-z0-9-]{2,32}$/.test(fromCookie)) return fromCookie;
  return null;
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const slug = await readBrandSlug();
  const brand = await resolveAuthBrand(slug);
  const themeStyle = themeToCssVars(brand?.theme.tokens);

  return (
    <div className="auth-shell" style={themeStyle}>
      <BrandProvider brand={brand}>{children}</BrandProvider>
    </div>
  );
}

export { COOKIE_MAX_AGE as BRAND_COOKIE_MAX_AGE, BRAND_COOKIE };
