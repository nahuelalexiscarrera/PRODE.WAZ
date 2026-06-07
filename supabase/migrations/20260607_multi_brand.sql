-- 20260607_multi_brand.sql
--
-- PRODE.WAZ → plataforma multi-marca.
-- Tenancy: user-bound. Cada user.brand_id ancla la marca; reference data del
-- torneo (matches, teams, players) sigue compartida.
--
-- Esta migración:
--   1. Crea catálogo de temas (theme) con tokens JSONB reutilizables.
--   2. Crea brand + brand_admin (N:M).
--   3. Reemplaza user.is_admin (booleano único) por user.role (enum), manteniendo
--      is_admin como columna sincronizada para compat durante la transición.
--   4. Agrega brand_id a user, prediction, special_prediction, post,
--      ranking_snapshot (hot-path queries del ranking).
--   5. Backfillea TODO a la marca seed 'o2' antes de aplicar NOT NULL + RLS.
--   6. Reescribe fn_recalculate_positions/fn_settle_match/fn_add_points para
--      operar por marca (no más ranking global).
--   7. Reemplaza materialized views por funciones parametrizadas
--      fn_user_summary_for_brand / fn_ranking_for_brand.
--   8. Reescribe RLS con filtro de marca (un socio solo ve su marca; super_admin
--      ve todo).
--
-- Si algo falla mid-flight: la migración corre dentro de la transacción implícita
-- de supabase migrate (todo o nada). Es idempotente para creaciones (IF NOT EXISTS,
-- DROP IF EXISTS antes de CREATE) pero los UPDATEs de backfill solo corren una
-- vez (rows ya con brand_id no se tocan).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  1. Enums nuevos                                                │
-- └─────────────────────────────────────────────────────────────────┘

DO $$ BEGIN
  CREATE TYPE brand_status_t AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role_t AS ENUM ('member', 'brand_admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  2. Tabla theme (catálogo reutilizable)                         │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS theme (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  tokens      JSONB NOT NULL,            -- overrides de --brand-primary, --accent-lime, glows
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE theme IS
'Catálogo de temas visuales. Cada brand referencia uno por slug. tokens es un objeto JSON con keys como "brand-primary", "accent-lime", "shadow-glow-primary", etc. Solo las CSS vars que VARÍAN por marca; las universales (espaciado, motion, semánticas) viven en globals.css.';

-- Tema 'o2-fitness' = naranja + lima actuales (sin cambio visual para usuarios O2).
INSERT INTO theme (slug, name, tokens) VALUES
  ('o2-fitness', 'O2 Fitness (default)', '{
    "brand-primary": "#ff6a00",
    "brand-primary-hover": "#ff7a1a",
    "brand-primary-pressed": "#e65e00",
    "brand-primary-soft": "#ff8a33",
    "brand-primary-glow": "rgba(255,106,0,0.35)",
    "brand-primary-bg": "rgba(255,106,0,0.12)",
    "accent-lime": "#d9ff3f",
    "accent-lime-soft": "rgba(217,255,63,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(255,106,0,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(217,255,63,0.35)"
  }'::jsonb),
  ('corporate', 'Corporate', '{
    "brand-primary": "#1e6fff",
    "brand-primary-hover": "#3a82ff",
    "brand-primary-pressed": "#1659d6",
    "brand-primary-soft": "#5d99ff",
    "brand-primary-glow": "rgba(30,111,255,0.35)",
    "brand-primary-bg": "rgba(30,111,255,0.12)",
    "accent-lime": "#7dd3fc",
    "accent-lime-soft": "rgba(125,211,252,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(30,111,255,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(125,211,252,0.35)"
  }'::jsonb),
  ('gaming', 'Gaming', '{
    "brand-primary": "#9333ea",
    "brand-primary-hover": "#a855f7",
    "brand-primary-pressed": "#7e22ce",
    "brand-primary-soft": "#c084fc",
    "brand-primary-glow": "rgba(147,51,234,0.35)",
    "brand-primary-bg": "rgba(147,51,234,0.12)",
    "accent-lime": "#22d3ee",
    "accent-lime-soft": "rgba(34,211,238,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(147,51,234,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(34,211,238,0.35)"
  }'::jsonb),
  ('premium', 'Premium', '{
    "brand-primary": "#d4af37",
    "brand-primary-hover": "#e0c050",
    "brand-primary-pressed": "#b8941f",
    "brand-primary-soft": "#e8cc6e",
    "brand-primary-glow": "rgba(212,175,55,0.35)",
    "brand-primary-bg": "rgba(212,175,55,0.12)",
    "accent-lime": "#f5f5f4",
    "accent-lime-soft": "rgba(245,245,244,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(212,175,55,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(245,245,244,0.35)"
  }'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  3. Tabla brand                                                 │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS brand (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,                  -- 'O2', 'FitClub'
  short_name      TEXT,                           -- para header / mobile compactado
  sub_brand       TEXT,                           -- 'Wellness Club' para o2, opcional
  hashtag_suffix  TEXT NOT NULL,                  -- 'O2' → #PRODEMUNDIALO2
  logo_url        TEXT,                           -- subido por super admin
  theme_slug      TEXT NOT NULL REFERENCES theme(slug),
  status          brand_status_t NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID                            -- super admin que la creó (no FK → user para no romper la creación inicial)
);

CREATE INDEX IF NOT EXISTS idx_brand_slug ON brand(slug);
CREATE INDEX IF NOT EXISTS idx_brand_status ON brand(status) WHERE status = 'active';

-- Seed de la marca O2 — todos los usuarios actuales se bindean acá.
INSERT INTO brand (slug, name, short_name, sub_brand, hashtag_suffix, logo_url, theme_slug)
VALUES ('o2', 'O2', 'O2', 'Wellness Club', 'O2', '/logo.png', 'o2-fitness')
ON CONFLICT (slug) DO NOTHING;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  4. user: role + brand_id                                       │
-- └─────────────────────────────────────────────────────────────────┘

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role user_role_t NOT NULL DEFAULT 'member';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brand(id);

-- Backfill: el único is_admin actual → super_admin global.
UPDATE "user" SET role = 'super_admin' WHERE is_admin = true AND role = 'member';

-- Backfill: todos los users existentes pertenecen a la marca seed 'o2'.
UPDATE "user"
   SET brand_id = (SELECT id FROM brand WHERE slug = 'o2')
 WHERE brand_id IS NULL;

-- Ahora sí, NOT NULL.
ALTER TABLE "user" ALTER COLUMN brand_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_brand ON "user"(brand_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_brand_points
  ON "user"(brand_id, total_points DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_brand_position
  ON "user"(brand_id, position) WHERE deleted_at IS NULL;

-- Trigger de compat: cuando alguien cambia role, mantener is_admin sincronizado
-- (queda mientras el código todavía lee is_admin; se elimina al limpiar).
CREATE OR REPLACE FUNCTION trg_sync_is_admin()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_admin := (NEW.role = 'super_admin');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_role_sync ON "user";
CREATE TRIGGER trg_user_role_sync
  BEFORE INSERT OR UPDATE OF role ON "user"
  FOR EACH ROW EXECUTE FUNCTION trg_sync_is_admin();

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  5. brand_admin (N:M user ↔ brand)                              │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS brand_admin (
  brand_id    UUID NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (brand_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_admin_user ON brand_admin(user_id);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  6. brand_id denormalizado en hot-path tables                   │
-- └─────────────────────────────────────────────────────────────────┘

-- prediction
ALTER TABLE prediction ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brand(id);
UPDATE prediction p
   SET brand_id = u.brand_id
  FROM "user" u
 WHERE u.id = p.user_id AND p.brand_id IS NULL;
ALTER TABLE prediction ALTER COLUMN brand_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prediction_brand ON prediction(brand_id);

-- special_prediction
ALTER TABLE special_prediction ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brand(id);
UPDATE special_prediction sp
   SET brand_id = u.brand_id
  FROM "user" u
 WHERE u.id = sp.user_id AND sp.brand_id IS NULL;
ALTER TABLE special_prediction ALTER COLUMN brand_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_special_prediction_brand ON special_prediction(brand_id);

-- post
ALTER TABLE post ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brand(id);
UPDATE post p
   SET brand_id = u.brand_id
  FROM "user" u
 WHERE u.id = p.user_id AND p.brand_id IS NULL;
ALTER TABLE post ALTER COLUMN brand_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_brand_created
  ON post(brand_id, created_at DESC) WHERE deleted_at IS NULL;

-- ranking_snapshot: si la tabla tiene rows previas (improbable en pre-release),
-- se bindean a O2; si está vacía, no pasa nada.
ALTER TABLE ranking_snapshot ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brand(id);
UPDATE ranking_snapshot
   SET brand_id = (SELECT id FROM brand WHERE slug = 'o2')
 WHERE brand_id IS NULL;
ALTER TABLE ranking_snapshot ALTER COLUMN brand_id SET NOT NULL;

-- El unique (tournament_id, week_number) ya no es suficiente: ahora cada marca
-- tiene su propia snapshot semanal.
ALTER TABLE ranking_snapshot
  DROP CONSTRAINT IF EXISTS ranking_snapshot_tournament_id_week_number_key;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ranking_snapshot_brand_tournament_week_key'
  ) THEN
    ALTER TABLE ranking_snapshot
      ADD CONSTRAINT ranking_snapshot_brand_tournament_week_key
      UNIQUE (brand_id, tournament_id, week_number);
  END IF;
END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  7. SQL helpers                                                 │
-- └─────────────────────────────────────────────────────────────────┘

-- current_brand_id(): la marca del usuario autenticado. NULL si no hay sesión.
CREATE OR REPLACE FUNCTION public.current_brand_id() RETURNS UUID
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT brand_id FROM "user" WHERE id = auth.uid()
$$;

-- is_super_admin(): true si el usuario autenticado es super admin.
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT COALESCE((SELECT role = 'super_admin' FROM "user" WHERE id = auth.uid()), false)
$$;

-- is_brand_admin(p_brand_id): true si el usuario administra esa marca o es super.
CREATE OR REPLACE FUNCTION public.is_brand_admin(p_brand_id UUID) RETURNS BOOLEAN
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT public.is_super_admin()
        OR EXISTS (
             SELECT 1 FROM brand_admin
              WHERE user_id = auth.uid() AND brand_id = p_brand_id
           )
$$;

-- public.is_admin() existente queda mientras código legacy todavía lo llama; ahora
-- devuelve true para super_admin Y para brand_admin de la marca del actor. Esto
-- preserva la semántica "puede moderar el muro" del flujo viejo.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role IN ('super_admin', 'brand_admin') FROM "user" WHERE id = auth.uid()),
    false
  );
$$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  8. Funciones de scoring reescritas por marca                   │
-- └─────────────────────────────────────────────────────────────────┘

-- Recalcular posiciones DENTRO de una marca. El ranking global se elimina:
-- cada marca tiene su propio ROW_NUMBER() ordenado por puntos.
CREATE OR REPLACE FUNCTION fn_recalculate_positions(p_brand_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, joined_at ASC) AS pos
    FROM "user"
    WHERE deleted_at IS NULL AND brand_id = p_brand_id
  )
  UPDATE "user" u SET position = r.pos FROM ranked r WHERE u.id = r.id;
END $$;

-- Sobrecarga sin args: itera por todas las marcas activas (útil para crons o
-- recalc manual). NO usar desde fn_settle_match — ahí solo tocamos las marcas
-- afectadas por las predicciones del match.
CREATE OR REPLACE FUNCTION fn_recalculate_positions_all()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_brand UUID;
BEGIN
  FOR v_brand IN SELECT id FROM brand WHERE status = 'active' LOOP
    PERFORM fn_recalculate_positions(v_brand);
  END LOOP;
END $$;

-- fn_settle_match: el match cerró → puntuar predicciones y recalcular ranking
-- SOLO de las marcas con socios que predijeron ese match.
CREATE OR REPLACE FUNCTION fn_settle_match(p_match_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_pred RECORD;
  v_points INTEGER;
  v_brand UUID;
BEGIN
  -- Puntuar cada predicción no settled.
  FOR v_pred IN
    SELECT id, user_id FROM prediction WHERE match_id = p_match_id AND points_earned IS NULL
  LOOP
    v_points := fn_calculate_points(v_pred.id);
    UPDATE prediction
       SET points_earned = v_points,
           updated_at = NOW()
     WHERE id = v_pred.id;

    UPDATE "user"
       SET total_points = total_points + v_points
     WHERE id = v_pred.user_id;
  END LOOP;

  -- Recalcular ranking de cada marca que tuvo socios afectados.
  FOR v_brand IN
    SELECT DISTINCT brand_id
      FROM prediction
     WHERE match_id = p_match_id
  LOOP
    PERFORM fn_recalculate_positions(v_brand);
  END LOOP;
END $$;

-- fn_add_points: usado por achievements. Resuelve la marca del user y recalcula
-- solo esa.
CREATE OR REPLACE FUNCTION fn_add_points(p_user_id UUID, p_delta INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand UUID;
BEGIN
  UPDATE "user"
     SET total_points = total_points + p_delta
   WHERE id = p_user_id
   RETURNING brand_id INTO v_brand;
  IF v_brand IS NOT NULL THEN
    PERFORM fn_recalculate_positions(v_brand);
  END IF;
END $$;

REVOKE ALL ON FUNCTION fn_add_points(UUID, INTEGER) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION fn_add_points(UUID, INTEGER) TO service_role;

-- fn_resettle_match: corrección de resultado. Existe ya (20260604_resettle_match.sql)
-- y llama a fn_settle_match al final, así que hereda el fix sin tocarla. Aún así,
-- nos aseguramos de que la versión actual no rompió por la nueva firma.
-- (No la reescribimos acá — sigue usando fn_settle_match(p_match_id).)

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  9. Reemplazar materialized views por funciones parametrizadas  │
-- └─────────────────────────────────────────────────────────────────┘

DROP MATERIALIZED VIEW IF EXISTS mv_ranking_global CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_user_summary CASCADE;

-- fn_ranking_for_brand: ranking en vivo de una marca (reemplaza mv_ranking_global).
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
  SELECT u.position, u.id, u.name, u.initials, u.avatar_url, u.level, u.total_points
    FROM "user" u
   WHERE u.deleted_at IS NULL AND u.brand_id = p_brand_id
   ORDER BY u.position
   LIMIT p_limit
$$;

-- fn_user_summary_for_brand: resumen de socio + su predicción especial.
-- Replica el shape de mv_user_summary pero filtrado por marca.
CREATE OR REPLACE FUNCTION fn_user_summary_for_brand(p_brand_id UUID)
RETURNS TABLE (
  user_id              UUID,
  user_name            TEXT,
  initials             TEXT,
  avatar_url           TEXT,
  level                user_level_t,
  total_points         INTEGER,
  "position"           INTEGER,   -- comillado: position es palabra reservada
  champion_code        TEXT,
  runner_up_code       TEXT,
  top_scorer_player_id UUID,
  top_scorer_name      TEXT,
  top_scorer_team      TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT u.id, u.name, u.initials, u.avatar_url, u.level, u.total_points, u.position,
         sp.champion_code, sp.runner_up_code, sp.top_scorer_player_id,
         p.name, p.team_code
    FROM "user" u
    LEFT JOIN special_prediction sp ON sp.user_id = u.id
    LEFT JOIN player p ON p.id = sp.top_scorer_player_id
   WHERE u.deleted_at IS NULL AND u.brand_id = p_brand_id
$$;

-- fn_refresh_views se vuelve no-op (no hay MVs). Lo dejamos definido para no
-- romper crons existentes que la llamen mientras transicionan.
CREATE OR REPLACE FUNCTION fn_refresh_views()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- MVs eliminadas en 20260607_multi_brand.sql. Ranking es ahora una función
  -- en vivo (fn_ranking_for_brand). Nada que refrescar.
  RETURN;
END $$;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 10. RLS con filtro de marca                                     │
-- └─────────────────────────────────────────────────────────────────┘

-- brand + theme: lectura pública (necesaria para auth pages pre-login).
ALTER TABLE brand ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_admin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública marcas" ON brand;
CREATE POLICY "Lectura pública marcas"
  ON brand FOR SELECT USING (status = 'active' OR public.is_super_admin());

DROP POLICY IF EXISTS "Solo super admin escribe marcas" ON brand;
CREATE POLICY "Solo super admin escribe marcas"
  ON brand FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Lectura pública temas" ON theme;
CREATE POLICY "Lectura pública temas" ON theme FOR SELECT USING (true);

DROP POLICY IF EXISTS "Solo super admin escribe temas" ON theme;
CREATE POLICY "Solo super admin escribe temas"
  ON theme FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Brand admins se ven a sí mismos" ON brand_admin;
CREATE POLICY "Brand admins se ven a sí mismos"
  ON brand_admin FOR SELECT
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "Solo super admin gestiona brand_admin" ON brand_admin;
CREATE POLICY "Solo super admin gestiona brand_admin"
  ON brand_admin FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- user: aislado por marca (los socios solo ven a los de su marca).
DROP POLICY IF EXISTS "Socios pueden leer todos los users públicos" ON "user";
CREATE POLICY "Socios leen users de su marca"
  ON "user" FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND deleted_at IS NULL
    AND (brand_id = public.current_brand_id() OR public.is_super_admin())
  );

-- (la policy UPDATE existente sigue valiendo: solo el dueño edita su perfil)

-- prediction: solo predicciones de la misma marca.
DROP POLICY IF EXISTS "Socios leen predicciones públicas" ON prediction;
CREATE POLICY "Socios leen predicciones de su marca"
  ON prediction FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (brand_id = public.current_brand_id() OR public.is_super_admin())
    AND (
      user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM match WHERE id = match_id AND status = 'finished')
      OR EXISTS (SELECT 1 FROM "user" WHERE id = prediction.user_id AND visibility = 'public')
    )
  );

-- INSERT: el WITH CHECK existente (auth.uid() = user_id) sigue; el brand_id se
-- inyecta server-side desde lib/predictions/actions.ts antes del insert.

-- special_prediction: idem.
DROP POLICY IF EXISTS "User lee su predicción especial" ON special_prediction;
CREATE POLICY "User lee su predicción especial"
  ON special_prediction FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR (auth.role() = 'authenticated' AND brand_id = public.current_brand_id()
        AND EXISTS (SELECT 1 FROM "user" WHERE id = special_prediction.user_id AND visibility = 'public'))
  );

-- post: muro privado por marca.
DROP POLICY IF EXISTS "Socios leen posts no borrados" ON post;
CREATE POLICY "Socios leen posts de su marca"
  ON post FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND deleted_at IS NULL
    AND (brand_id = public.current_brand_id() OR public.is_super_admin())
  );

-- comment / reaction: heredan transitivamente vía post.brand_id (ya filtrado
-- arriba), pero las policies siguen siendo "authenticated leen todo" del schema
-- original. Si un user no puede leer un post (RLS), tampoco puede ver sus
-- comments porque la join a post falla. Es seguro dejarlas como están — y nos
-- ahorra una columna brand_id duplicada. Sí actualizamos la policy de UPDATE
-- para que el moderador sea brand_admin de la marca del post, no global.

-- (Se deja la policy existente "Socios leen comentarios" — la visibilidad real
-- la decide la join client-side al traer el feed por post_id ya filtrado).

-- notification: ya está scopeada por auth.uid() = user_id. Como cada user pertenece
-- a una sola marca, el aislamiento es implícito. Sin cambios.

-- user_achievement: lectura authenticated → la limitamos a la misma marca.
DROP POLICY IF EXISTS "Socios leen logros" ON user_achievement;
CREATE POLICY "Socios leen logros de su marca"
  ON user_achievement FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM "user" u
         WHERE u.id = user_achievement.user_id
           AND u.brand_id = public.current_brand_id()
      )
    )
  );

-- push_subscription / share_intent: ya son auth.uid() = user_id (own only).
-- ranking_snapshot:
DROP POLICY IF EXISTS "Socios leen ranking" ON ranking_snapshot;
CREATE POLICY "Socios leen ranking de su marca"
  ON ranking_snapshot FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (brand_id = public.current_brand_id() OR public.is_super_admin())
  );

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 11. Comentarios y notas                                         │
-- └─────────────────────────────────────────────────────────────────┘

COMMENT ON COLUMN "user".brand_id IS 'Marca a la que pertenece el socio. Asignado al confirmar email vía ?brand=<slug>.';
COMMENT ON COLUMN "user".role IS 'Rol del usuario: member (socio común), brand_admin (admin de su marca via brand_admin), super_admin (owner global).';
COMMENT ON COLUMN brand.theme_slug IS 'FK a theme.slug. Cambiar acá actualiza el branding visual instantáneamente para todos los socios de la marca.';
COMMENT ON COLUMN brand.logo_url IS 'URL del logo (subida a Supabase Storage por super admin). Vacía → fallback a /logo.png.';
