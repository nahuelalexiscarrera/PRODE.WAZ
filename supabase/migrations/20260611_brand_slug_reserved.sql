-- 20260611_brand_slug_reserved.sql
--
-- Protección de slugs de marca que colisionarían con rutas del sistema.
-- Con la migración de URL-based branding (/[brandSlug]) Next.js da prioridad
-- a las rutas exactas sobre el segmento dinámico, pero agregar una restricción
-- en la DB es la defensa correcta: si alguien intenta crear brand slug='login'
-- el INSERT falla con un mensaje claro antes de llegar a la capa de routing.
--
-- Idempotente: IF NOT EXISTS + OR REPLACE no aplica a constraints, pero el
-- nombre único garantiza que correrlo dos veces en el mismo DB no falla.

ALTER TABLE brand
  DROP CONSTRAINT IF EXISTS brand_slug_not_reserved;

ALTER TABLE brand
  ADD CONSTRAINT brand_slug_not_reserved CHECK (
    slug NOT IN (
      -- Rutas exactas del sistema (Next.js App Router)
      'app', 'api', 'auth', 'login', 'register',
      'forgot', 'reset', 'splash',
      -- Recursos estáticos y convenciones web
      'health', 'robots', 'sitemap', 'manifest',
      'favicon', 'about', 'terms', 'privacy', 'status'
    )
  );

COMMENT ON CONSTRAINT brand_slug_not_reserved ON brand IS
  'Slugs reservados por el router de Next.js o convenciones web.
   Ver Sprint 1 (20260611): URL-based branding /[brandSlug].';
