-- 20260610_fix_user_self_read.sql
--
-- Fix crítico: la policy "Socios leen users de su marca" bloqueaba al usuario
-- leer su PROPIO row cuando brand_id era NULL (o cuando current_brand_id()
-- devolvía NULL por alguna carrera de inicialización).
--
-- El predicado `brand_id = current_brand_id()` evalúa FALSE cuando cualquiera
-- de los dos lados es NULL (semántica SQL). Esto causaba que getMyProfile()
-- fallara → redirect /login → middleware rebotaba a /app (parecía "ir a home").
--
-- Solución: agregar `id = auth.uid()` como caso incondicional — un usuario
-- siempre puede leer su propio row, sin importar el estado de brand_id.

DROP POLICY IF EXISTS "Socios leen users de su marca" ON "user";
CREATE POLICY "Socios leen users de su marca"
  ON "user" FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND deleted_at IS NULL
    AND (
      id = auth.uid()                        -- siempre puede leer su propio row
      OR brand_id = public.current_brand_id()
      OR public.is_super_admin()
    )
  );
