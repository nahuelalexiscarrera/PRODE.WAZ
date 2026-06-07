/**
 * (app) route group layout
 * Wraps Home, Prode, Ranking, Muro, Perfil con BottomNav y branding por marca.
 *
 * Server component: resuelve la marca del usuario autenticado (vía
 * `getCurrentBrand()` que lee user.brand_id → join con theme), inyecta los
 * tokens del theme como CSS vars en el wrapper, y propaga la metadata de
 * marca a los client components via <BrandProvider>.
 *
 * El theming se aplica SIN flash porque los CSS vars vienen ya en el HTML
 * server-rendered. No hay hydration mismatch — el `style={cssVars}` es
 * determinístico para el mismo user/brand.
 */

import { BottomNav } from "@/components/features/BottomNav";
import { BrandProvider } from "@/components/providers/BrandProvider";
import { getCurrentBrand } from "@/lib/brands/queries";
import { themeToCssVars } from "@/lib/brands/theme";
import { ensureCurrentUserRow } from "@/lib/auth/ensure-user";

// Todo el grupo (app) es contenido por-socio detrás de auth: NUNCA debe
// prerenderizarse en build (lo que ataba el build al env de Supabase y rompía
// /app/perfil/logros). force-dynamic = se renderiza por request, en runtime.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Self-heal: garantiza la fila public.user para sesiones huérfanas (ej. tras un
  // reset de DB) o registros donde el insert no corrió. Idempotente y fail-safe.
  // DEBE ir antes de getCurrentBrand (que necesita user.brand_id para resolver).
  await ensureCurrentUserRow();

  const brand = await getCurrentBrand();
  const themeStyle = themeToCssVars(brand?.theme.tokens);

  return (
    <div className="mobile-container" style={themeStyle}>
      <BrandProvider brand={brand}>
        <main>{children}</main>
        <BottomNav />
      </BrandProvider>
    </div>
  );
}
