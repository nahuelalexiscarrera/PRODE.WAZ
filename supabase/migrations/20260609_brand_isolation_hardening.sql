-- 20260609_brand_isolation_hardening.sql
--
-- Hardening de aislamiento multi-marca surgido de la review adversarial del
-- panel Super Admin. La migración 20260607 scopeó las RLS de SELECT por marca
-- pero dejó agujeros en WRITE y en tablas sin brand_id (comment/reaction), y la
-- moderación quedó global. Acá se cierran:
--
--   1. (blocker) Moderación (soft-delete) de post/comment scopeada a la marca:
--      un brand_admin solo modera SU marca, no todas.
--   2. (high) WITH CHECK de prediction/special_prediction fuerza
--      brand_id = current_brand_id() → un socio no puede spoofear su marca.
--   3. (high) INSERT de comment exige que el post objetivo sea de su marca.
--   4. (medium) SELECT de comment/reaction scopeado a la marca (no más lectura
--      cross-brand por query REST directa).
--   5. (low) fn_ranking_for_brand ordena por puntos (no por position, que es 0
--      hasta el primer recalc).
--   6. (low) Logos SVG fuera del set permitido (evita XSS por SVG con <script>).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  1. Moderación scopeada por marca                              │
-- └─────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "Borra post: dueño o admin" ON post;
CREATE POLICY "Borra post: dueño o admin de la marca"
  ON post FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR public.is_brand_admin(brand_id)
  );

DROP POLICY IF EXISTS "Borra comentario: dueño o admin" ON comment;
CREATE POLICY "Borra comentario: dueño o admin de la marca"
  ON comment FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR public.is_brand_admin((SELECT p.brand_id FROM post p WHERE p.id = comment.post_id))
  );

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  2. WITH CHECK de marca en prediction / special_prediction      │
-- └─────────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "User inserta sus predicciones" ON prediction;
CREATE POLICY "User inserta sus predicciones (de su marca)"
  ON prediction FOR INSERT
  WITH CHECK (auth.uid() = user_id AND brand_id = public.current_brand_id());

DROP POLICY IF EXISTS "User actualiza sus predicciones (si no cerró el partido)" ON prediction;
CREATE POLICY "User actualiza sus predicciones (si no cerró el partido)"
  ON prediction FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM match WHERE id = match_id AND (kickoff_at - INTERVAL '1 hour') > NOW())
  )
  WITH CHECK (auth.uid() = user_id AND brand_id = public.current_brand_id());

DROP POLICY IF EXISTS "User crea su predicción especial" ON special_prediction;
CREATE POLICY "User crea su predicción especial (de su marca)"
  ON special_prediction FOR INSERT
  WITH CHECK (auth.uid() = user_id AND brand_id = public.current_brand_id());

DROP POLICY IF EXISTS "User edita su predicción especial (si no cerró)" ON special_prediction;
CREATE POLICY "User edita su predicción especial (si no cerró)"
  ON special_prediction FOR UPDATE
  USING (auth.uid() = user_id AND locked_at IS NULL)
  WITH CHECK (auth.uid() = user_id AND brand_id = public.current_brand_id());

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  3 + 4. comment / reaction: scopear lectura y escritura         │
-- └─────────────────────────────────────────────────────────────────┘

-- comment SELECT: solo comentarios de posts de la marca del actor.
DROP POLICY IF EXISTS "Socios leen comentarios" ON comment;
CREATE POLICY "Socios leen comentarios de su marca"
  ON comment FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND deleted_at IS NULL
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM post p
         WHERE p.id = comment.post_id AND p.brand_id = public.current_brand_id()
      )
    )
  );

-- comment INSERT: el post objetivo debe ser de la marca del actor.
DROP POLICY IF EXISTS "User crea comentarios" ON comment;
CREATE POLICY "User crea comentarios (en su marca)"
  ON comment FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM post p
       WHERE p.id = post_id AND p.brand_id = public.current_brand_id()
    )
  );

-- reaction SELECT: solo reacciones cuyo target (post o comment) es de la marca.
DROP POLICY IF EXISTS "Socios ven todas las reacciones" ON reaction;
CREATE POLICY "Socios ven reacciones de su marca"
  ON reaction FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      public.is_super_admin()
      OR (
        target_type = 'post'
        AND EXISTS (
          SELECT 1 FROM post p
           WHERE p.id = reaction.target_id AND p.brand_id = public.current_brand_id()
        )
      )
      OR (
        target_type = 'comment'
        AND EXISTS (
          SELECT 1 FROM comment c
            JOIN post p ON p.id = c.post_id
           WHERE c.id = reaction.target_id AND p.brand_id = public.current_brand_id()
        )
      )
    )
  );

-- reaction write: separar el FOR ALL en DELETE (propias) + INSERT (en la marca).
DROP POLICY IF EXISTS "User reacciona / des-reacciona" ON reaction;
CREATE POLICY "User des-reacciona sus reacciones"
  ON reaction FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "User reacciona en su marca"
  ON reaction FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      (target_type = 'post' AND EXISTS (
        SELECT 1 FROM post p
         WHERE p.id = target_id AND p.brand_id = public.current_brand_id()))
      OR (target_type = 'comment' AND EXISTS (
        SELECT 1 FROM comment c JOIN post p ON p.id = c.post_id
         WHERE c.id = target_id AND p.brand_id = public.current_brand_id()))
    )
  );

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  5. fn_ranking_for_brand: ordenar por puntos, position derivada  │
-- └─────────────────────────────────────────────────────────────────┘
-- Antes ORDER BY u.position (0 hasta el primer recalc → orden arbitrario en
-- marcas nuevas). Ahora deriva la posición con ROW_NUMBER por puntos, así el
-- "top" es correcto aún sin settle previo.

CREATE OR REPLACE FUNCTION fn_ranking_for_brand(p_brand_id UUID, p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  "position"   INTEGER,   -- comillado: position es palabra reservada en Postgres
  user_id      UUID,
  user_name    TEXT,
  initials     TEXT,
  avatar_url   TEXT,
  level        user_level_t,
  points       INTEGER
)
LANGUAGE sql STABLE AS $$
  SELECT
    ROW_NUMBER() OVER (ORDER BY u.total_points DESC, u.joined_at ASC)::INTEGER AS "position",
    u.id, u.name, u.initials, u.avatar_url, u.level, u.total_points
  FROM "user" u
  WHERE u.deleted_at IS NULL AND u.brand_id = p_brand_id
  ORDER BY u.total_points DESC, u.joined_at ASC
  LIMIT p_limit
$$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  6. Logos SVG fuera del set permitido                          │
-- └─────────────────────────────────────────────────────────────────┘
-- Un SVG público puede contener <script> y ejecutar al navegar la URL directa.
-- El upload server-side (lib/super-admin/actions.ts) también dropea svg.

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
 WHERE id = 'brand-logos';
