-- ════════════════════════════════════════════════════════════════════
-- PRODE.WAZ — Setup completo de base de datos (one-shot, re-ejecutable)
-- Pegar TODO esto en el SQL Editor de Supabase (proyecto nuevo) y Run.
-- ════════════════════════════════════════════════════════════════════

-- Reset limpio del schema public (no toca auth/storage de Supabase).
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Grants base + DEFAULT PRIVILEGES. Imprescindible: al recrear public, Supabase
-- pierde los permisos que les da a anon/authenticated sobre las tablas. Sin esto,
-- la app (rol anon/authenticated) recibe error 42501 (insufficient_privilege).
-- Con DEFAULT PRIVILEGES, toda tabla/secuencia/función creada DESPUÉS hereda los grants.
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;


-- ====================================================================
-- SCHEMA BASE (tablas, RLS, funciones, triggers)
-- ====================================================================

-- ┌────────────────────────────────────────────────────────────────┐
-- │  PRODE.WAZ — Supabase Schema                                    │
-- │  Agente 8 · Data Modeler · 2026-05-18                          │
-- │  PostgreSQL 15+ · Row-Level Security activado                  │
-- └────────────────────────────────────────────────────────────────┘

-- ─── Extensions ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- search (futuro)

-- ─── Enums ──────────────────────────────────────────────────────────
CREATE TYPE phase_t AS ENUM ('groups', 'round-of-16', 'quarter', 'semi', 'final');
CREATE TYPE match_status_t AS ENUM ('scheduled', 'live', 'finished', 'postponed');
CREATE TYPE user_level_t AS ENUM ('1', '2', '3', '4', '5');
CREATE TYPE achievement_category_t AS ENUM ('skill', 'consistency', 'social', 'position');
CREATE TYPE reaction_target_t AS ENUM ('post', 'comment');
CREATE TYPE visibility_t AS ENUM ('public', 'private');
CREATE TYPE notification_type_t AS ENUM (
  'onboarding-incomplete', 'match-upcoming', 'phase-start', 'match-result',
  'reaction', 'comment', 'achievement-unlocked', 'close-to-podium',
  'position-change', 'weekly-digest', 'tournament-end', 'share-reminder'
);
CREATE TYPE share_template_t AS ENUM ('summary', 'position', 'match', 'achievement');
CREATE TYPE share_channel_t AS ENUM ('instagram', 'whatsapp', 'download', 'more');

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Foundational tables                                            │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE tournament (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  phase_config  JSONB NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE groups (
  id            TEXT PRIMARY KEY,            -- 'A', 'B', ..., 'L'
  tournament_id UUID NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  letter        TEXT NOT NULL,
  UNIQUE(tournament_id, letter)
);

CREATE TABLE team (
  code     TEXT PRIMARY KEY,                  -- ISO alpha-2 lowercase
  name     TEXT NOT NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL
);

CREATE TABLE player (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  full_name TEXT NOT NULL,
  team_code TEXT NOT NULL REFERENCES team(code) ON DELETE CASCADE
);

CREATE TABLE match (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  phase         phase_t NOT NULL,
  group_id      TEXT REFERENCES groups(id) ON DELETE SET NULL,
  home_code     TEXT NOT NULL REFERENCES team(code),
  away_code     TEXT NOT NULL REFERENCES team(code),
  kickoff_at    TIMESTAMPTZ NOT NULL,
  venue_city    TEXT,
  status        match_status_t NOT NULL DEFAULT 'scheduled',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_match_kickoff ON match(kickoff_at);
CREATE INDEX idx_match_status ON match(status) WHERE status != 'finished';
CREATE INDEX idx_match_phase ON match(phase);

CREATE TABLE match_result (
  match_id              UUID PRIMARY KEY REFERENCES match(id) ON DELETE CASCADE,
  home_score            SMALLINT NOT NULL CHECK (home_score >= 0 AND home_score <= 20),
  away_score            SMALLINT NOT NULL CHECK (away_score >= 0 AND away_score <= 20),
  top_scorer_player_id  UUID REFERENCES player(id) ON DELETE SET NULL,
  finished_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Users & auth                                                   │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE invite_code (
  code        TEXT PRIMARY KEY,
  created_by  UUID,  -- admin user; references auth.users
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  used_by     UUID,  -- references auth.users
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "user" (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  initials             TEXT NOT NULL,
  avatar_url           TEXT,
  phone                TEXT,
  level                user_level_t NOT NULL DEFAULT '1',
  total_points         INTEGER NOT NULL DEFAULT 0,
  position             INTEGER NOT NULL DEFAULT 0,
  joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Registro abierto (Sprint 8): el invite dejó de ser obligatorio.
  -- Se conserva el FK para el histórico de quienes sí usaron código.
  invite_code_used     TEXT REFERENCES invite_code(code),
  notification_prefs   JSONB NOT NULL DEFAULT '{"matchReminders":true,"results":true,"socialReactions":false,"weeklyDigest":true}',
  visibility           visibility_t NOT NULL DEFAULT 'public',
  is_admin             BOOLEAN NOT NULL DEFAULT false,  -- superusuario: modera muro, sube fotos de premios
  deleted_at           TIMESTAMPTZ
);

CREATE INDEX idx_user_position ON "user"(position) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_total_points ON "user"(total_points DESC) WHERE deleted_at IS NULL;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Predictions                                                    │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE prediction (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  match_id          UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  home_score        SMALLINT NOT NULL CHECK (home_score >= 0 AND home_score <= 20),
  away_score        SMALLINT NOT NULL CHECK (away_score >= 0 AND away_score <= 20),
  points_earned     INTEGER,                              -- null until match settled
  points_breakdown  JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, match_id)
);

CREATE INDEX idx_prediction_user ON prediction(user_id);
CREATE INDEX idx_prediction_match ON prediction(match_id);
CREATE INDEX idx_prediction_unsettled ON prediction(match_id) WHERE points_earned IS NULL;

CREATE TABLE special_prediction (
  user_id                   UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  tournament_id             UUID NOT NULL REFERENCES tournament(id),
  champion_code             TEXT NOT NULL REFERENCES team(code),
  runner_up_code            TEXT NOT NULL REFERENCES team(code),
  top_scorer_player_id      UUID NOT NULL REFERENCES player(id),
  group_stage_best_code     TEXT NOT NULL REFERENCES team(code),
  revelation_code           TEXT NOT NULL REFERENCES team(code),
  locked_at                 TIMESTAMPTZ,
  points_earned             INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Social: posts, comments, reactions                             │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE post (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (LENGTH(body) > 0 AND LENGTH(body) <= 280),
  embed_type      TEXT CHECK (embed_type IN ('prediction', 'match')),
  embed_ref_id    UUID,
  image_url       TEXT,                                  -- 2026-05-19: imagen opcional (Supabase Storage)
  image_width     SMALLINT,
  image_height    SMALLINT,
  reaction_count  INTEGER NOT NULL DEFAULT 0,
  comment_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- Supabase Storage bucket `post-images` (creado vía dashboard o migration aparte):
--   public read: true (autenticación a nivel app vía RLS de post)
--   upload: solo por usuario autenticado, path: {user_id}/{post_id}.{ext}
--   max size: 5MB
--   formats: image/jpeg, image/png, image/webp

CREATE INDEX idx_post_created ON post(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_post_user ON post(user_id);

CREATE TABLE comment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (LENGTH(body) > 0 AND LENGTH(body) <= 280),
  reaction_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_comment_post ON comment(post_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE reaction (
  target_type   reaction_target_t NOT NULL,
  target_id     UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (target_type, target_id, user_id)
);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Achievements                                                   │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE achievement_catalog (
  id             TEXT PRIMARY KEY,                       -- 'A01', 'C01', ...
  category       achievement_category_t NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL,
  icon_ref       TEXT NOT NULL,
  points_bonus   INTEGER NOT NULL DEFAULT 0,
  trigger_key    TEXT NOT NULL
);

CREATE TABLE user_achievement (
  user_id          UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  achievement_id   TEXT NOT NULL REFERENCES achievement_catalog(id),
  unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shared           BOOLEAN NOT NULL DEFAULT FALSE,
  progress         SMALLINT,
  PRIMARY KEY (user_id, achievement_id)
);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Ranking snapshots                                              │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE ranking_snapshot (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournament(id),
  week_number   SMALLINT NOT NULL,
  snapshot_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entries       JSONB NOT NULL,                         -- inline para query rápida
  UNIQUE (tournament_id, week_number)
);

CREATE INDEX idx_ranking_week ON ranking_snapshot(week_number DESC);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Notifications & push                                           │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE notification (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type        notification_type_t NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  deep_link   TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_user ON notification(user_id, created_at DESC);
CREATE INDEX idx_notification_unread ON notification(user_id) WHERE read_at IS NULL;

CREATE TABLE push_subscription (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh_key    TEXT NOT NULL,
  auth_key      TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Telemetry: share intents                                       │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE share_intent (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  template     share_template_t NOT NULL,
  channel      share_channel_t NOT NULL,
  context_id   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_share_intent_user ON share_intent(user_id, created_at DESC);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  RLS Policies                                                   │
-- └─────────────────────────────────────────────────────────────────┘

-- All user-data tables have RLS on
ALTER TABLE "user"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction          ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_prediction  ENABLE ROW LEVEL SECURITY;
ALTER TABLE post                ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reaction            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievement    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification        ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscription   ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_intent        ENABLE ROW LEVEL SECURITY;

-- Reference/tournament tables: datos PÚBLICOS del torneo. RLS activada con
-- lectura abierta (USING true) — si se activa RLS sin policy, los socios reciben
-- 0 filas (home sin "próximo partido", /prode sin partidos). Ver migración
-- 20260530_reference_tables_rls.sql.
ALTER TABLE tournament          ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE team                ENABLE ROW LEVEL SECURITY;
ALTER TABLE player              ENABLE ROW LEVEL SECURITY;
ALTER TABLE match               ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_result        ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_snapshot    ENABLE ROW LEVEL SECURITY;

-- Helper de moderación: ¿el usuario actual es admin? SECURITY DEFINER para poder
-- leer "user" sin chocar con sus propias RLS. Definido antes de las policies que
-- lo usan (post / comment / storage).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT u.is_admin FROM "user" u WHERE u.id = auth.uid()), false);
$$;

CREATE POLICY "Lectura pública torneo"     ON tournament          FOR SELECT USING (true);
CREATE POLICY "Lectura pública grupos"     ON groups              FOR SELECT USING (true);
CREATE POLICY "Lectura pública equipos"    ON team                FOR SELECT USING (true);
CREATE POLICY "Lectura pública jugadores"  ON player              FOR SELECT USING (true);
CREATE POLICY "Lectura pública partidos"   ON match               FOR SELECT USING (true);
CREATE POLICY "Lectura pública resultados" ON match_result        FOR SELECT USING (true);
CREATE POLICY "Lectura pública logros"     ON achievement_catalog FOR SELECT USING (true);
CREATE POLICY "Socios leen ranking"        ON ranking_snapshot    FOR SELECT USING (auth.role() = 'authenticated');

-- Common pattern: authenticated socios SELECT all, INSERT/UPDATE/DELETE own only
CREATE POLICY "Socios pueden leer todos los users públicos"
  ON "user" FOR SELECT
  USING (auth.role() = 'authenticated' AND deleted_at IS NULL);

CREATE POLICY "Cada user actualiza su propio perfil"
  ON "user" FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Socios leen predicciones públicas"
  ON prediction FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM match WHERE id = match_id AND status = 'finished')
         OR EXISTS (SELECT 1 FROM "user" WHERE id = prediction.user_id AND visibility = 'public'))
  );

-- Cierre: 5 minutos antes del kickoff (espejo TS: lib/predictions/constants.ts).
-- Versión final (con marca + chequeo horario en INSERT): sección de hardening.
CREATE POLICY "User inserta sus predicciones"
  ON prediction FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM match WHERE id = match_id AND status = 'scheduled' AND (kickoff_at - INTERVAL '5 minutes') > NOW())
  );

CREATE POLICY "User actualiza sus predicciones (si no cerró el partido)"
  ON prediction FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM match WHERE id = match_id AND status = 'scheduled' AND (kickoff_at - INTERVAL '5 minutes') > NOW())
  );

-- Posts y comments: lectura abierta a socios; CRUD del dueño
CREATE POLICY "Socios leen posts no borrados"
  ON post FOR SELECT
  USING (auth.role() = 'authenticated' AND deleted_at IS NULL);

CREATE POLICY "User crea sus posts"
  ON post FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Borra post: dueño o admin"
  ON post FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Socios leen comentarios"
  ON comment FOR SELECT
  USING (auth.role() = 'authenticated' AND deleted_at IS NULL);

CREATE POLICY "User crea comentarios"
  ON comment FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Borra comentario: dueño o admin"
  ON comment FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Socios ven todas las reacciones"
  ON reaction FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "User reacciona / des-reacciona"
  ON reaction FOR ALL
  USING (auth.uid() = user_id);

-- Notification: solo el dueño ve sus notifs
CREATE POLICY "User ve sus notifs"
  ON notification FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "User marca leídas"
  ON notification FOR UPDATE
  USING (auth.uid() = user_id);
-- NOTA: notification no tiene policy de INSERT a propósito. Las notifs propias
-- (logros) se insertan con service_role desde processAchievements(); las
-- sociales vía trigger SECURITY DEFINER; las del cron con service_role.

-- Logros desbloqueados: lectura para socios (visibles en perfiles), inserción
-- del propio. SIN estas policies, processAchievements() falla por RLS y los
-- logros nunca se desbloquean ni suman puntos.
CREATE POLICY "Socios leen logros"
  ON user_achievement FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "User desbloquea sus logros"
  ON user_achievement FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Functions                                                      │
-- └─────────────────────────────────────────────────────────────────┘

-- Calcula puntos de una predicción dada (sin grabar)
-- Implementa scoring del Agente 2 §7 (lo agresivo)
CREATE OR REPLACE FUNCTION fn_calculate_points(p_prediction_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_home_pred SMALLINT; v_away_pred SMALLINT;
  v_home_real SMALLINT; v_away_real SMALLINT;
  v_phase     phase_t;
  v_mult      NUMERIC;
  v_base      INTEGER := 0;
  v_diff_pred INTEGER;
  v_diff_real INTEGER;
BEGIN
  SELECT p.home_score, p.away_score, mr.home_score, mr.away_score, m.phase
    INTO v_home_pred, v_away_pred, v_home_real, v_away_real, v_phase
  FROM prediction p
  JOIN match m ON m.id = p.match_id
  JOIN match_result mr ON mr.match_id = m.id
  WHERE p.id = p_prediction_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  -- Multiplicador por fase
  v_mult := CASE v_phase
    WHEN 'groups'      THEN 1
    WHEN 'round-of-16' THEN 2
    WHEN 'quarter'     THEN 3
    WHEN 'semi'        THEN 4
    WHEN 'final'       THEN 5
  END;

  -- Acierto exacto
  IF v_home_pred = v_home_real AND v_away_pred = v_away_real THEN
    v_base := 8;
  ELSE
    -- Ganador correcto
    IF (v_home_pred > v_away_pred AND v_home_real > v_away_real)
       OR (v_home_pred < v_away_pred AND v_home_real < v_away_real)
    THEN
      v_base := 3;
    ELSIF v_home_pred = v_away_pred AND v_home_real = v_away_real THEN
      -- Empate sin score exacto
      v_base := 1;
    END IF;

    -- Bonus diferencia de gol (cuando no acertó exacto)
    v_diff_pred := v_home_pred - v_away_pred;
    v_diff_real := v_home_real - v_away_real;
    IF v_diff_pred = v_diff_real AND v_base > 0 THEN
      v_base := v_base + 2;
    END IF;
  END IF;

  RETURN ROUND(v_base * v_mult)::INTEGER;
END $$;

-- Procesa todos los puntos de las predicciones de un match recién settled
CREATE OR REPLACE FUNCTION fn_settle_match(p_match_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_pred RECORD;
  v_points INTEGER;
BEGIN
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

  -- Recalcular posiciones (Agente 9 implementa más sofisticado)
  PERFORM fn_recalculate_positions();
END $$;

-- Recalcula ranking global
CREATE OR REPLACE FUNCTION fn_recalculate_positions()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, joined_at ASC) AS pos
    FROM "user"
    WHERE deleted_at IS NULL
  )
  UPDATE "user" u SET position = r.pos FROM ranked r WHERE u.id = r.id;
END $$;

-- Trigger: cuando un match pasa a 'finished', invocar settle
CREATE OR REPLACE FUNCTION trg_match_finished()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
    PERFORM fn_settle_match(NEW.id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_match_status_change
  AFTER UPDATE OF status ON match
  FOR EACH ROW EXECUTE FUNCTION trg_match_finished();

-- Trigger: mantener post.reaction_count y comment_count consistentes
-- SECURITY DEFINER: el conteo updatea post/comment aunque quien reacciona no sea
-- el dueño (si no, la RLS de post/comment bloquea el UPDATE y el contador no sube).
CREATE OR REPLACE FUNCTION trg_reaction_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_type = 'post' THEN
      UPDATE post SET reaction_count = reaction_count + 1 WHERE id = NEW.target_id;
    ELSE
      UPDATE comment SET reaction_count = reaction_count + 1 WHERE id = NEW.target_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.target_type = 'post' THEN
      UPDATE post SET reaction_count = reaction_count - 1 WHERE id = OLD.target_id;
    ELSE
      UPDATE comment SET reaction_count = reaction_count - 1 WHERE id = OLD.target_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_reaction_count_change
  AFTER INSERT OR DELETE ON reaction
  FOR EACH ROW EXECUTE FUNCTION trg_reaction_count();

-- Notificaciones sociales (Twitter/FB): avisar al dueño del post al recibir
-- comentario o reacción. SECURITY DEFINER porque el actor inserta la notif de
-- otro usuario (la policy de notification solo permite auth.uid()=user_id).
CREATE OR REPLACE FUNCTION trg_notify_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_actor TEXT;
BEGIN
  SELECT user_id INTO v_owner FROM post WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT name INTO v_actor FROM "user" WHERE id = NEW.user_id;
  INSERT INTO notification (user_id, type, title, body, deep_link)
  VALUES (v_owner, 'comment', 'Nuevo comentario',
          COALESCE(v_actor, 'Alguien') || ' comentó tu publicación',
          '/app/muro/' || NEW.post_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_comment_notify ON comment;
CREATE TRIGGER trg_comment_notify
  AFTER INSERT ON comment
  FOR EACH ROW EXECUTE FUNCTION trg_notify_comment();

CREATE OR REPLACE FUNCTION trg_notify_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_actor TEXT;
BEGIN
  IF NEW.target_type <> 'post' THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner FROM post WHERE id = NEW.target_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT name INTO v_actor FROM "user" WHERE id = NEW.user_id;
  INSERT INTO notification (user_id, type, title, body, deep_link)
  VALUES (v_owner, 'reaction', 'Nueva reacción',
          'A ' || COALESCE(v_actor, 'alguien') || ' le gustó tu publicación',
          '/app/muro/' || NEW.target_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reaction_notify ON reaction;
CREATE TRIGGER trg_reaction_notify
  AFTER INSERT ON reaction
  FOR EACH ROW EXECUTE FUNCTION trg_notify_reaction();

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Materialized views (refresh on demand)                         │
-- └─────────────────────────────────────────────────────────────────┘

-- Resumen del usuario para el share endpoint (Agente 5)
CREATE MATERIALIZED VIEW mv_user_summary AS
SELECT
  u.id           AS user_id,
  u.name         AS user_name,
  u.initials,
  u.avatar_url,
  u.level,
  u.total_points,
  u.position,
  sp.champion_code,
  sp.runner_up_code,
  sp.top_scorer_player_id,
  p.name         AS top_scorer_name,
  p.team_code    AS top_scorer_team
FROM "user" u
LEFT JOIN special_prediction sp ON sp.user_id = u.id
LEFT JOIN player p ON p.id = sp.top_scorer_player_id
WHERE u.deleted_at IS NULL;

CREATE UNIQUE INDEX idx_mv_user_summary_pk ON mv_user_summary(user_id);

-- Ranking global con metadata para el feed
CREATE MATERIALIZED VIEW mv_ranking_global AS
SELECT
  u.position,
  u.id           AS user_id,
  u.name         AS user_name,
  u.initials,
  u.avatar_url,
  u.level,
  u.total_points AS points
FROM "user" u
WHERE u.deleted_at IS NULL
ORDER BY u.position;

CREATE UNIQUE INDEX idx_mv_ranking_global_pk ON mv_ranking_global(user_id);
CREATE INDEX idx_mv_ranking_global_pos ON mv_ranking_global(position);

-- Refresh manual (Agente 9 llama tras fn_settle_match)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_summary;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ranking_global;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Multi-Brand (2026-06-07)                                       │
-- │                                                                 │
-- │  La migración 20260607_multi_brand.sql evoluciona este schema   │
-- │  para soportar N marcas:                                        │
-- │                                                                 │
-- │  TABLAS NUEVAS:                                                 │
-- │    theme        - catálogo de tokens visuales (slug PK)         │
-- │    brand        - marca activa (slug UNIQUE, theme_slug FK)     │
-- │    brand_admin  - N:M brand ↔ user                              │
-- │                                                                 │
-- │  ENUMS NUEVOS:                                                  │
-- │    brand_status_t  - 'active' | 'inactive'                      │
-- │    user_role_t     - 'member' | 'brand_admin' | 'super_admin'   │
-- │                                                                 │
-- │  COLUMNAS AGREGADAS:                                            │
-- │    user(brand_id NOT NULL, role NOT NULL DEFAULT 'member')      │
-- │    prediction(brand_id NOT NULL)                                │
-- │    special_prediction(brand_id NOT NULL)                        │
-- │    post(brand_id NOT NULL)                                      │
-- │    ranking_snapshot(brand_id NOT NULL)                          │
-- │                                                                 │
-- │  FUNCIONES REESCRITAS (operan por marca, no globales):          │
-- │    fn_recalculate_positions(p_brand_id UUID)                    │
-- │    fn_recalculate_positions_all()  -- itera por todas activas   │
-- │    fn_settle_match(p_match_id)  -- resuelve brands afectadas    │
-- │    fn_add_points(p_user_id, p_delta)  -- usa user.brand_id      │
-- │                                                                 │
-- │  HELPERS NUEVOS:                                                │
-- │    current_brand_id()  -- brand_id del usuario auth             │
-- │    is_super_admin()    -- role = 'super_admin'                  │
-- │    is_brand_admin(p_brand_id)                                   │
-- │    is_admin()  -- ahora cubre super_admin Y brand_admin         │
-- │                                                                 │
-- │  MVs ELIMINADAS, reemplazadas por funciones parametrizadas:     │
-- │    mv_user_summary  → fn_user_summary_for_brand(p_brand_id)     │
-- │    mv_ranking_global → fn_ranking_for_brand(p_brand_id, p_limit)│
-- │                                                                 │
-- │  RLS: las policies de tablas user-data filtran por marca via    │
-- │  current_brand_id(); super_admin ve todo.                       │
-- │                                                                 │
-- │  Ver supabase/migrations/20260607_multi_brand.sql para el DDL   │
-- │  completo y el backfill que mueve a O2 todos los users actuales.│
-- └─────────────────────────────────────────────────────────────────┘

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Super Admin (2026-06-08)                                       │
-- │                                                                 │
-- │  20260608_super_admin.sql agrega:                              │
-- │    - Los 10 temas reales del design system en `theme`           │
-- │      (o2, carbon, rosso, alpine, volt, teal, stealth, papaya,   │
-- │       titanium, midnight); dropea los placeholders de 20260607. │
-- │    - Storage bucket `brand-logos` (público) + policies: lectura │
-- │      pública, escritura/borrado solo is_super_admin().          │
-- │    - Tabla `brand_admin_invite` (brand_id, email, consumed_at): │
-- │      asignar admins por email antes de que existan; se          │
-- │      reconcilia en app/auth/confirm al registrarse.             │
-- └─────────────────────────────────────────────────────────────────┘

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  Hardening de aislamiento (2026-06-09)                         │
-- │                                                                 │
-- │  20260609_brand_isolation_hardening.sql cierra agujeros de      │
-- │  WRITE/lectura cross-brand que 20260607 no cubrió:              │
-- │    - Moderación de post/comment scopeada con is_brand_admin()   │
-- │      (un brand_admin solo modera SU marca).                     │
-- │    - WITH CHECK de prediction/special_prediction fuerza         │
-- │      brand_id = current_brand_id() (anti-spoof de marca).       │
-- │    - INSERT de comment exige post de la marca del actor.        │
-- │    - SELECT de comment/reaction scopeado por marca.             │
-- │    - reaction: FOR ALL → DELETE (propias) + INSERT (en marca).  │
-- │    - fn_ranking_for_brand ordena por puntos (ROW_NUMBER).       │
-- │    - Logos SVG fuera del bucket (anti-XSS).                     │
-- └─────────────────────────────────────────────────────────────────┘


-- ====================================================================
-- MIGRACIÓN: 20260524_comment_count_trigger.sql
-- ====================================================================

-- Migration: comment_count trigger
-- Keeps post.comment_count in sync when comments are inserted or hard-deleted.
-- Soft deletes (deleted_at) are handled by the app layer (comment stays in table,
-- realtime hook filters it out client-side), so we only need INSERT / DELETE here.

CREATE OR REPLACE FUNCTION trg_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE post SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_comment_count_change ON comment;

CREATE TRIGGER trg_comment_count_change
  AFTER INSERT OR DELETE ON comment
  FOR EACH ROW EXECUTE FUNCTION trg_comment_count();


-- ====================================================================
-- MIGRACIÓN: 20260525_sprint6.sql
-- ====================================================================

-- Sprint 6: fn_add_points + notification INSERT policy + achievement_catalog seed
-- Run in Supabase Dashboard → SQL Editor

-- ─── fn_add_points ────────────────────────────────────────────────────
-- Atomic point increment + position recalculation.
-- Called from processAchievements when a bonus is awarded.

CREATE OR REPLACE FUNCTION fn_add_points(p_user_id UUID, p_delta INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "user" SET total_points = GREATEST(0, total_points + p_delta) WHERE id = p_user_id;
  PERFORM fn_recalculate_positions();
END $$;

-- ─── Notification INSERT policy ───────────────────────────────────────
-- Allows server actions running in user context to insert system notifications
-- for that user (processAchievements runs under the user's session).

CREATE POLICY "System inserta notifs del user"
  ON notification FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── achievement_catalog seed ─────────────────────────────────────────
-- The user_achievement table references achievement_catalog(id) via FK.
-- Must be seeded before any user_achievement row can be inserted.

INSERT INTO achievement_catalog (id, category, name, description, icon_ref, points_bonus, trigger_key)
VALUES
  -- Skill
  ('A01', 'skill',       'El que sabe',    'Acertá 5 resultados exactos seguidos.',           'target',    15, 'streak_exact_5'),
  ('A02', 'skill',       'Visionario',     'Acertá al campeón del Mundial antes del torneo.', 'crown',     40, 'champion_correct'),
  ('A03', 'skill',       'Mufa controlada','Acertá un upset: predijiste al no-favorito.',     'flame',     10, 'upset_correct'),
  ('A04', 'skill',       'Pleno',          'Acertá TODOS los partidos de un grupo.',           'check',     20, 'group_complete_correct'),
  ('A05', 'skill',       'Eliminator',     'Acertá todos los cruces de octavos.',             'medal',     25, 'knockout_round_correct'),
  -- Consistency
  ('C01', 'consistency', 'Constante',      '7 días seguidos cargando predicciones.',          'flame',     10, 'streak_days_7'),
  ('C02', 'consistency', 'Maratonista',    '21 días seguidos cargando predicciones.',         'flame',     30, 'streak_days_21'),
  ('C03', 'consistency', 'Todoterreno',    'Cargaste el 100% de los partidos del torneo.',    'ball',      50, 'tournament_100'),
  ('C04', 'consistency', 'Madrugador',     'Cargaste un grupo completo el 1er día.',          'clock',      5, 'group_first_day'),
  -- Social
  ('S01', 'social',      'Inicio fuerte',  'Tu primer post en el muro.',                      'comment',    5, 'first_post'),
  ('S02', 'social',      'Popular',        'Conseguiste 10 reacciones en un solo post.',      'heart',      5, 'post_10_reactions'),
  ('S03', 'social',      'Embajador',      'Compartiste 5 prodes fuera de la app.',           'share',     10, 'external_shares_5'),
  ('S04', 'social',      'Conector',       'Comentaste en 10 posts distintos.',               'comment',    5, 'comments_made_10'),
  ('S05', 'social',      'Tribu',          'Tres amigos tuyos también activaron la app.',     'nav-user',  10, 'friends_active_3'),
  -- Position
  ('P01', 'position',    'Top 10',         'Llegaste al top 10 del ranking.',                 'nav-chart', 10, 'position_top_10'),
  ('P02', 'position',    'Podio',          'Llegaste al top 3 del ranking.',                  'medal',     25, 'position_top_3'),
  ('P03', 'position',    'Líder',          'Liderás el ranking general.',                     'crown',     50, 'position_1'),
  ('P04', 'position',    'Remontada',      'Subiste 10 o más posiciones en una semana.',      'arrow-up',  15, 'weekly_rise_10'),
  ('P05', 'position',    'Campeón',        'Sos el ganador final del torneo.',                'world-trophy', 100, 'tournament_winner')
ON CONFLICT (id) DO NOTHING;


-- ====================================================================
-- MIGRACIÓN: 20260526_refresh_views_fn.sql
-- ====================================================================

-- Función llamada por el cron de refresh (cada 5 min).
-- Refresca las materialized views de ranking y resumen de usuario.
CREATE OR REPLACE FUNCTION fn_refresh_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ranking_global;
END;
$$;


-- ====================================================================
-- MIGRACIÓN: 20260527_push_subscription_rls.sql
-- ====================================================================

-- RLS policies for push_subscription
-- Each socio can only manage their own push subscriptions.

CREATE POLICY "Socios gestionan sus suscripciones push"
  ON push_subscription
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ====================================================================
-- MIGRACIÓN: 20260529_open_registration.sql
-- ====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- Migration: Registro abierto (Sprint 8)
--
-- Decisión de producto (Nahuel, 2026-05-29): se remueve el flujo
-- invite-only original. El registro pasa a ser abierto con email +
-- teléfono opcional, para construir una base de socios usable.
--
-- · invite_code_used deja de ser NOT NULL (se conserva la columna y el FK
--   para el histórico de quienes sí se registraron con código).
-- · Se agrega `phone` (opcional) como dato de contacto.
--
-- La tabla invite_code NO se borra: queda disponible por si se reactiva
-- el flujo cerrado en el futuro.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE "user" ALTER COLUMN invite_code_used DROP NOT NULL;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS phone TEXT;


-- ====================================================================
-- MIGRACIÓN: 20260530_reference_tables_rls.sql
-- ====================================================================

-- 20260530_reference_tables_rls.sql
--
-- FIX (Sprint 8, beta): en producción las tablas de referencia del torneo
-- quedaron con RLS ACTIVADA pero SIN policy de lectura. Resultado: cualquier
-- socio autenticado recibía 0 filas (solo service_role veía los datos).
--
-- Síntomas en la app:
--   • Home: "No hay partidos programados" (getNextMatch → null).
--   • /prode: "No hay partidos cargados para el Grupo X" (getMatchesByGroup → []).
--
-- Estos datos son PÚBLICOS del torneo (fixture, equipos, jugadores, resultados),
-- así que la lectura es abierta. La app igualmente gatea las pantallas por auth.
-- `USING (true)` mantiene legible también el endpoint de share (contexto anon).

ALTER TABLE tournament          ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE team                ENABLE ROW LEVEL SECURITY;
ALTER TABLE player              ENABLE ROW LEVEL SECURITY;
ALTER TABLE match               ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_result        ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_snapshot    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública torneo"     ON tournament;
DROP POLICY IF EXISTS "Lectura pública grupos"     ON groups;
DROP POLICY IF EXISTS "Lectura pública equipos"    ON team;
DROP POLICY IF EXISTS "Lectura pública jugadores"  ON player;
DROP POLICY IF EXISTS "Lectura pública partidos"   ON match;
DROP POLICY IF EXISTS "Lectura pública resultados" ON match_result;
DROP POLICY IF EXISTS "Lectura pública logros"     ON achievement_catalog;
DROP POLICY IF EXISTS "Socios leen ranking"        ON ranking_snapshot;

CREATE POLICY "Lectura pública torneo"     ON tournament          FOR SELECT USING (true);
CREATE POLICY "Lectura pública grupos"     ON groups              FOR SELECT USING (true);
CREATE POLICY "Lectura pública equipos"    ON team                FOR SELECT USING (true);
CREATE POLICY "Lectura pública jugadores"  ON player              FOR SELECT USING (true);
CREATE POLICY "Lectura pública partidos"   ON match               FOR SELECT USING (true);
CREATE POLICY "Lectura pública resultados" ON match_result        FOR SELECT USING (true);
CREATE POLICY "Lectura pública logros"     ON achievement_catalog FOR SELECT USING (true);
CREATE POLICY "Socios leen ranking"        ON ranking_snapshot    FOR SELECT USING (auth.role() = 'authenticated');


-- ====================================================================
-- MIGRACIÓN: 20260531_moderation_admin.sql
-- ====================================================================

-- 20260531_moderation_admin.sql
--
-- Moderación del muro + concepto de admin/superusuario.
--   1. Columna is_admin en "user" + helper is_admin().
--   2. Borrado (soft) de comentarios: dueño O admin.
--   3. Borrado (soft) de posts: ahora también el admin (antes solo el dueño).
--   4. comment_count: descontar también en el soft-delete (UPDATE de deleted_at),
--      no solo en INSERT / hard-DELETE.
--   5. Bucket de Storage `post-images` + policies (subida solo admin → fotos de
--      premios; lectura pública). Antes el bucket no existía y la subida fallaba.

-- ─── 1. Admin ─────────────────────────────────────────────────────────
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- SECURITY DEFINER: puede leer "user" sin chocar con las RLS al evaluar policies.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT u.is_admin FROM "user" u WHERE u.id = auth.uid()), false);
$$;

-- Admin inicial (dueño del proyecto).
UPDATE "user" SET is_admin = true WHERE email = 'nahuel.alexis.carrera@gmail.com';

-- ─── 2. Borrado de comentarios (dueño o admin) ────────────────────────
DROP POLICY IF EXISTS "Borra comentario: dueño o admin" ON comment;
CREATE POLICY "Borra comentario: dueño o admin"
  ON comment FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin());

-- ─── 3. Borrado de posts (dueño o admin) ──────────────────────────────
DROP POLICY IF EXISTS "User borra sus posts (soft)" ON post;
DROP POLICY IF EXISTS "Borra post: dueño o admin" ON post;
CREATE POLICY "Borra post: dueño o admin"
  ON post FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin());

-- ─── 4. comment_count consistente también en soft-delete ──────────────
CREATE OR REPLACE FUNCTION trg_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE post SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE post SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE post SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_comment_count_change ON comment;
CREATE TRIGGER trg_comment_count_change
  AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON comment
  FOR EACH ROW EXECUTE FUNCTION trg_comment_count();

-- ─── 5. Storage: bucket post-images ───────────────────────────────────
-- Subida abierta a TODOS los socios (cada uno a su carpeta {uid}/...); lectura
-- pública; borrado del dueño o admin. Límite 5 MB + MIME imagen.
-- (Actualizado en 20260615000002_post_images_members.sql; antes era solo-admin.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('post-images', 'post-images', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "post-images lectura pública" ON storage.objects;
CREATE POLICY "post-images lectura pública"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "post-images subida admin" ON storage.objects;
DROP POLICY IF EXISTS "post-images subida socio" ON storage.objects;
CREATE POLICY "post-images subida socio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "post-images borrado admin" ON storage.objects;
DROP POLICY IF EXISTS "post-images borrado dueño o admin" ON storage.objects;
CREATE POLICY "post-images borrado dueño o admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-images'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );


-- ====================================================================
-- MIGRACIÓN: 20260531_qa_hardening.sql
-- ====================================================================

-- 20260531_qa_hardening.sql
--
-- Dos bugs de integridad encontrados en el QA end-to-end:
--
-- 1) Contadores del muro entre usuarios. trg_comment_count / trg_reaction_count
--    hacen UPDATE sobre post/comment, pero corrían como el usuario actual → la
--    RLS de post/comment (solo dueño o admin) BLOQUEABA ese UPDATE cuando el que
--    comenta/reacciona NO es el dueño del post. Resultado: comment_count y
--    reaction_count se quedaban en 0 para interacciones entre socios. Se pasan a
--    SECURITY DEFINER (como ya lo son los triggers de notificación) para que el
--    conteo se mantenga sin importar quién dispara el evento.
--
-- 2) fn_add_points permitía a un socio AUTO-sumarse puntos llamando la RPC
--    directo (corre como el usuario; la RLS lo deja tocar su propia fila). Se
--    revoca la ejecución a anon/authenticated: ahora solo el service role la
--    ejecuta (processAchievements y los crons ya la llaman con service role).

-- ─── 1. Triggers de conteo → SECURITY DEFINER ─────────────────────────
CREATE OR REPLACE FUNCTION trg_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE post SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE post SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE post SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION trg_reaction_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_type = 'post' THEN
      UPDATE post SET reaction_count = reaction_count + 1 WHERE id = NEW.target_id;
    ELSE
      UPDATE comment SET reaction_count = reaction_count + 1 WHERE id = NEW.target_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.target_type = 'post' THEN
      UPDATE post SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.target_id;
    ELSE
      UPDATE comment SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.target_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- ─── 2. fn_add_points: solo service role ──────────────────────────────
-- OJO: en Postgres las funciones tienen EXECUTE para PUBLIC por defecto, así que
-- revocar solo a `authenticated` NO alcanza (el rol sigue teniendo permiso vía
-- PUBLIC). Hay que revocar a PUBLIC y dar el grant explícito al service role.
REVOKE EXECUTE ON FUNCTION fn_add_points(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_add_points(uuid, integer) TO service_role;

-- ─── Backfill: recomputar contadores reales (por si quedaron desfasados) ─
UPDATE post p SET
  comment_count = (SELECT COUNT(*) FROM comment c WHERE c.post_id = p.id AND c.deleted_at IS NULL),
  reaction_count = (SELECT COUNT(*) FROM reaction r WHERE r.target_type = 'post' AND r.target_id = p.id);

UPDATE comment c SET
  reaction_count = (SELECT COUNT(*) FROM reaction r WHERE r.target_type = 'comment' AND r.target_id = c.id);


-- ====================================================================
-- MIGRACIÓN: 20260531_social_notifications.sql
-- ====================================================================

-- 20260531_social_notifications.sql
--
-- Notificaciones sociales estilo Twitter/FB: avisar al DUEÑO del post cuando
-- alguien comenta o reacciona. Se hacen por TRIGGER (no desde el server action)
-- porque la policy de `notification` solo permite insertar con auth.uid()=user_id,
-- y acá el actor (comentador/reaccionador) inserta la notif de OTRO usuario.
-- SECURITY DEFINER + search_path fijo para insertar de forma segura.

-- ─── Comentario → notif al dueño del post ─────────────────────────────
CREATE OR REPLACE FUNCTION trg_notify_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner UUID;
  v_actor TEXT;
BEGIN
  SELECT user_id INTO v_owner FROM post WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;  -- no auto-notif
  SELECT name INTO v_actor FROM "user" WHERE id = NEW.user_id;
  INSERT INTO notification (user_id, type, title, body, deep_link)
  VALUES (
    v_owner, 'comment', 'Nuevo comentario',
    COALESCE(v_actor, 'Alguien') || ' comentó tu publicación',
    '/app/muro/' || NEW.post_id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_comment_notify ON comment;
CREATE TRIGGER trg_comment_notify
  AFTER INSERT ON comment
  FOR EACH ROW EXECUTE FUNCTION trg_notify_comment();

-- ─── Reacción a un post → notif al dueño ──────────────────────────────
CREATE OR REPLACE FUNCTION trg_notify_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner UUID;
  v_actor TEXT;
BEGIN
  IF NEW.target_type <> 'post' THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner FROM post WHERE id = NEW.target_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT name INTO v_actor FROM "user" WHERE id = NEW.user_id;
  INSERT INTO notification (user_id, type, title, body, deep_link)
  VALUES (
    v_owner, 'reaction', 'Nueva reacción',
    'A ' || COALESCE(v_actor, 'alguien') || ' le gustó tu publicación',
    '/app/muro/' || NEW.target_id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reaction_notify ON reaction;
CREATE TRIGGER trg_reaction_notify
  AFTER INSERT ON reaction
  FOR EACH ROW EXECUTE FUNCTION trg_notify_reaction();


-- ====================================================================
-- MIGRACIÓN: 20260531_user_achievement_rls.sql
-- ====================================================================

-- 20260531_user_achievement_rls.sql
--
-- FIX: la tabla user_achievement tenía RLS ACTIVADA pero SIN ninguna policy.
-- Resultado: processAchievements() (que corre en contexto del socio autenticado)
-- recibía 42501 al insertar → el catch lo silenciaba → ningún logro se
-- desbloqueaba ni sumaba puntos, y la pantalla de Logros mostraba todo bloqueado
-- (el SELECT también devolvía 0 filas).
--
-- Se agregan: lectura para socios autenticados (logros visibles en perfiles) e
-- inserción del propio usuario.

ALTER TABLE user_achievement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Socios leen logros" ON user_achievement;
DROP POLICY IF EXISTS "User desbloquea sus logros" ON user_achievement;

CREATE POLICY "Socios leen logros"
  ON user_achievement FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "User desbloquea sus logros"
  ON user_achievement FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ====================================================================
-- MIGRACIÓN: 20260604_resettle_match.sql
-- ====================================================================

-- 20260604_resettle_match.sql
--
-- Permite CORREGIR el resultado de un partido ya finalizado y re-puntuar.
-- fn_settle_match solo procesa predicciones con points_earned IS NULL (idempotente
-- para no duplicar puntos), así que para una corrección hay que primero revertir
-- los puntos ya asignados de ese partido y volver a puntuar desde cero.

CREATE OR REPLACE FUNCTION fn_resettle_match(p_match_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_pred RECORD;
BEGIN
  -- 1) revertir los puntos ya asignados de este partido
  FOR v_pred IN
    SELECT id, user_id, points_earned
    FROM prediction
    WHERE match_id = p_match_id AND points_earned IS NOT NULL
  LOOP
    UPDATE "user"
       SET total_points = GREATEST(0, total_points - v_pred.points_earned)
     WHERE id = v_pred.user_id;
    UPDATE prediction SET points_earned = NULL WHERE id = v_pred.id;
  END LOOP;

  -- 2) re-puntuar limpio (también recalcula posiciones)
  PERFORM fn_settle_match(p_match_id);
END $$;


-- ====================================================================
-- MIGRACIÓN: 20260604_wc2026_fd.sql
-- ====================================================================

-- 20260604_wc2026_fd.sql
--
-- Soporte del formato real del Mundial 2026 (48 equipos) + integración con
-- football-data.org.
--
--   1. phase_t: agregar 'round-of-32' (LAST_32). El formato de 48 equipos tiene
--      un cruce más que el viejo de 32 (R32 → R16 → QF → SF → Final).
--   2. match.fd_id: id del partido en football-data.org, clave estable para que
--      el cron upsertee resultados y CREE los cruces de eliminatorias a medida
--      que se definen (así las fases se desbloquean solas).
--   3. fn_calculate_points: multiplicador de R32 = 2 (igual que R16 — no cambia
--      ningún valor existente, así la paridad con lib/scoring se mantiene).
--
-- IMPORTANTE: corré el ALTER TYPE primero y confirmá (commit) antes de insertar
-- filas con phase='round-of-32'. Si el editor lo corre todo junto, está OK porque
-- la función usa v_phase::text (no necesita el valor del enum en la misma tx).

-- 1) Nuevo valor del enum de fases
ALTER TYPE phase_t ADD VALUE IF NOT EXISTS 'round-of-32' AFTER 'groups';

-- 2) Clave estable hacia football-data.org
ALTER TABLE match ADD COLUMN IF NOT EXISTS fd_id INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_fd_id ON match(fd_id) WHERE fd_id IS NOT NULL;

-- 3) Scoring con R32 (v_phase::text evita el problema de usar el valor nuevo del
--    enum en la misma transacción que el ADD VALUE)
CREATE OR REPLACE FUNCTION fn_calculate_points(p_prediction_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_home_pred SMALLINT; v_away_pred SMALLINT;
  v_home_real SMALLINT; v_away_real SMALLINT;
  v_phase     phase_t;
  v_mult      NUMERIC;
  v_base      INTEGER := 0;
  v_diff_pred INTEGER;
  v_diff_real INTEGER;
BEGIN
  SELECT p.home_score, p.away_score, mr.home_score, mr.away_score, m.phase
    INTO v_home_pred, v_away_pred, v_home_real, v_away_real, v_phase
  FROM prediction p
  JOIN match m ON m.id = p.match_id
  JOIN match_result mr ON mr.match_id = m.id
  WHERE p.id = p_prediction_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_mult := CASE v_phase::text
    WHEN 'groups'      THEN 1
    WHEN 'round-of-32' THEN 2
    WHEN 'round-of-16' THEN 2
    WHEN 'quarter'     THEN 3
    WHEN 'semi'        THEN 4
    WHEN 'final'       THEN 5
    ELSE 1
  END;

  IF v_home_pred = v_home_real AND v_away_pred = v_away_real THEN
    v_base := 8;
  ELSE
    IF (v_home_pred > v_away_pred AND v_home_real > v_away_real)
       OR (v_home_pred < v_away_pred AND v_home_real < v_away_real)
    THEN
      v_base := 3;
    ELSIF v_home_pred = v_away_pred AND v_home_real = v_away_real THEN
      v_base := 1;
    END IF;

    v_diff_pred := v_home_pred - v_away_pred;
    v_diff_real := v_home_real - v_away_real;
    IF v_diff_pred = v_diff_real AND v_base > 0 THEN
      v_base := v_base + 2;
    END IF;
  END IF;

  RETURN ROUND(v_base * v_mult)::INTEGER;
END $$;


-- ====================================================================
-- MIGRACIÓN: 20260605_audit_fixes.sql
-- ====================================================================

-- 20260605_audit_fixes.sql
--
-- Arreglos surgidos de la auditoría de cierre:
--   1. Columna position_last_week (el cron weekly-positions la usa y sin ella
--      crashea con "column does not exist" cada corrida → P04 nunca evalúa).
--   2. special_prediction: tenía RLS habilitado SIN policies (deny-all) → el
--      socio no podía leer ni cargar su predicción especial.
--   3. share_intent: ídem (RLS sin policy). Se agregan policies de dueño.
--   4. Realtime: agregar post/comment/reaction a la publicación supabase_realtime
--      (sin esto los INSERT/UPDATE nunca llegan al cliente → banner "posts nuevos",
--      stream de comentarios y borrado en vivo no funcionan en prod).

-- ─── 1. position_last_week ────────────────────────────────────────────
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS position_last_week INTEGER;

-- ─── 2. Predicción especial: policies de dueño ────────────────────────
DROP POLICY IF EXISTS "User lee su predicción especial" ON special_prediction;
CREATE POLICY "User lee su predicción especial"
  ON special_prediction FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User crea su predicción especial" ON special_prediction;
CREATE POLICY "User crea su predicción especial"
  ON special_prediction FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User edita su predicción especial (si no cerró)" ON special_prediction;
CREATE POLICY "User edita su predicción especial (si no cerró)"
  ON special_prediction FOR UPDATE
  USING (auth.uid() = user_id AND locked_at IS NULL);

-- ─── 3. share_intent: policies de dueño ───────────────────────────────
DROP POLICY IF EXISTS "User ve sus shares" ON share_intent;
CREATE POLICY "User ve sus shares"
  ON share_intent FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User registra sus shares" ON share_intent;
CREATE POLICY "User registra sus shares"
  ON share_intent FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── 4. Realtime publication ──────────────────────────────────────────
ALTER TABLE post REPLICA IDENTITY FULL;
ALTER TABLE comment REPLICA IDENTITY FULL;
ALTER TABLE reaction REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'post') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE post;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'comment') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE comment;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reaction') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE reaction;
  END IF;
END $$;


-- ====================================================================
-- MIGRACIÓN: 20260605_referrals.sql
-- ====================================================================

-- 20260605_referrals.sql
--
-- Referidos para el logro S05 "Tribu" (3 amigos activados).
-- Cada socio tiene un referral_code (6 chars) que comparte; un amigo que se
-- registra con ese código queda con referred_by = el referidor.
-- activatedFriendsCount = cantidad de usuarios con referred_by = vos.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES "user"(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_referral_code
  ON "user"(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_referred_by
  ON "user"(referred_by) WHERE referred_by IS NOT NULL;

-- Código para los usuarios existentes (6 hex en mayúscula)
UPDATE "user"
  SET referral_code = upper(substr(md5(random()::text || id::text), 1, 6))
  WHERE referral_code IS NULL;


-- ====================================================================
-- MIGRACIÓN: 20260605_special_pred_v1.sql
-- ====================================================================

-- 20260605_special_pred_v1.sql
--
-- Predicción especial v1: solo equipos (campeón, subcampeón, mejor de grupos,
-- revelación). El goleador (jugador) queda para v2, así que hacemos
-- top_scorer_player_id opcional para poder guardar sin él.

ALTER TABLE special_prediction ALTER COLUMN top_scorer_player_id DROP NOT NULL;

-- updated_at por si el upsert lo setea (la tabla ya lo tiene, pero garantizamos
-- que exista para no romper el onConflict).
ALTER TABLE special_prediction ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;


-- ====================================================================
-- MIGRACIÓN: 20260606_achievements_admin_points.sql
-- ====================================================================

-- 20260606_achievements_admin_points.sql
--
-- Reacomodo de logros para el lanzamiento:
--   1. Se elimina P05 "Campeón": no tiene sentido darle MÁS puntos al que ya
--      ganó el ranking (circular). Primero se borran sus filas en
--      user_achievement (FK) y después la fila del catálogo.
--   2. Los logros de posición que premian "estar arriba" (Top 10/Podio/Líder)
--      arrancan en 0 puntos; el admin los ajusta desde el panel
--      (/app/admin/logros → achievement_catalog.points_bonus). El awarding ahora
--      lee points_bonus de la DB, así que esto define el valor real.
--   3. Se agregan 2 logros de predicción especial: A06 Subcampeón y A07
--      Finalistas (acertar a los 2 finalistas, sin importar el orden).

-- ─── 1. Eliminar P05 ──────────────────────────────────────────────────
DELETE FROM user_achievement WHERE achievement_id = 'P05';
DELETE FROM achievement_catalog WHERE id = 'P05';

-- ─── 2. Posición: puntos por defecto en 0 (insignias; el admin los sube) ──
UPDATE achievement_catalog SET points_bonus = 0
  WHERE id IN ('P01', 'P02', 'P03');

-- ─── 3. Nuevos logros de predicción especial ──────────────────────────
INSERT INTO achievement_catalog (id, category, name, description, icon_ref, points_bonus, trigger_key) VALUES
('A06', 'skill', 'Subcampeón', 'Acertá al subcampeón del Mundial antes del torneo.', 'medal',        30, 'runner_up_correct'),
('A07', 'skill', 'Finalistas', 'Acertá a los 2 finalistas del Mundial.',             'world-trophy', 40, 'finalists_correct')
ON CONFLICT (id) DO UPDATE SET
  category     = EXCLUDED.category,
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  icon_ref     = EXCLUDED.icon_ref,
  trigger_key  = EXCLUDED.trigger_key;
  -- OJO: NO piso points_bonus en el UPDATE para no revertir lo que el admin haya
  -- editado. En el INSERT inicial usa el valor de arriba.


-- ====================================================================
-- MIGRACIÓN: 20260606_error_events.sql
-- ====================================================================

-- 20260606_error_events.sql
--
-- Auto-captura de errores DEDUPLICADA. La clave operativa para NO sobrecargar:
-- el mismo error (mismo fingerprint) NO genera un ticket nuevo cada vez — se
-- agrupa en UNA fila con un contador. Un bug que pegan 800 socios = 1 fila
-- count=800, no 800 issues en Jira.

CREATE TABLE IF NOT EXISTS error_event (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint    TEXT NOT NULL UNIQUE,
  kind           TEXT NOT NULL CHECK (kind IN ('server', 'client')),
  message        TEXT NOT NULL,
  route          TEXT,
  sample_stack   TEXT,
  count          INTEGER NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto', 'resuelto', 'ignorado')),
  jira_issue_key TEXT,
  jira_url       TEXT,
  first_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_event_last_seen ON error_event (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_error_event_jira_recent ON error_event (first_seen DESC) WHERE jira_issue_key IS NOT NULL;

ALTER TABLE error_event ENABLE ROW LEVEL SECURITY;
-- Sin policy: solo service role (endpoint /api/report-error + admin) lo toca.

-- Upsert atómico que además dice si la fila es NUEVA (truco xmax=0): así el
-- endpoint solo crea issue en Jira la PRIMERA vez que ve un fingerprint.
CREATE OR REPLACE FUNCTION fn_record_error(
  p_fingerprint text,
  p_kind text,
  p_message text,
  p_route text,
  p_stack text
) RETURNS TABLE (is_new boolean, ev_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new boolean;
  v_count integer;
BEGIN
  INSERT INTO error_event (fingerprint, kind, message, route, sample_stack)
  VALUES (p_fingerprint, p_kind, left(p_message, 2000), p_route, left(p_stack, 8000))
  ON CONFLICT (fingerprint) DO UPDATE
    SET count = error_event.count + 1,
        last_seen = NOW()
  RETURNING (xmax = 0), error_event.count INTO v_new, v_count;
  RETURN QUERY SELECT v_new, v_count;
END;
$$;

REVOKE ALL ON FUNCTION fn_record_error(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_record_error(text, text, text, text, text) TO service_role;


-- ====================================================================
-- MIGRACIÓN: 20260606_support_tickets.sql
-- ====================================================================

-- 20260606_support_tickets.sql
--
-- Sistema de tickets de soporte (panel de admin). Cada ticket genera un número
-- legible (OST-0001, OST-0002, ...) y se espeja como issue en Jira.
-- Solo el service role (server actions de admin) lo lee/escribe → RLS sin policy.

CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START 1;

CREATE TABLE IF NOT EXISTS support_ticket (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   TEXT NOT NULL UNIQUE
                    DEFAULT ('OST-' || lpad(nextval('support_ticket_seq')::text, 4, '0')),
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description     TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 5000),
  severity        TEXT NOT NULL DEFAULT 'media'
                    CHECK (severity IN ('baja', 'media', 'alta', 'critica')),
  area            TEXT,
  status          TEXT NOT NULL DEFAULT 'abierto'
                    CHECK (status IN ('abierto', 'enviado', 'error_jira')),
  reporter_id     UUID REFERENCES "user"(id) ON DELETE SET NULL,
  jira_issue_key  TEXT,
  jira_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_created ON support_ticket (created_at DESC);

ALTER TABLE support_ticket ENABLE ROW LEVEL SECURITY;
-- Sin policies a propósito: el panel de admin opera con service role
-- (createAdminClient) detrás del check getIsAdmin(). Ningún socio común accede.


-- ====================================================================
-- MIGRACIÓN: 20260607_multi_brand.sql
-- ====================================================================

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


-- ====================================================================
-- MIGRACIÓN: 20260608_super_admin.sql
-- ====================================================================

-- 20260608_super_admin.sql
--
-- Soporte para el panel de Super Admin:
--   1. Reemplaza los 4 temas placeholder de 20260607 por los 10 temas reales del
--      design system (Prode Design System / colors_and_type.css). Cada tema mapea
--      el --accent del diseño a la key `accent-lime` del repo, y agrega
--      `text-inverse` para mantener contraste WCAG AA en temas de primary oscuro.
--   2. Reasigna la marca O2 al tema 'o2' (era 'o2-fitness').
--   3. Crea el storage bucket `brand-logos` (lectura pública; escritura solo
--      service-role vía la action gateada por super admin).
--   4. Crea `brand_admin_invite` para asignar admins por email aunque el usuario
--      todavía no exista (se reconcilia al registrarse, en /auth/confirm).
--
-- Idempotente: ON CONFLICT en inserts, IF NOT EXISTS en tablas/bucket.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  1. Los 10 temas del design system                             │
-- └─────────────────────────────────────────────────────────────────┘
--
-- tokens mapea: design --brand-primary* → brand-primary*, design --accent →
-- accent-lime, design --accent-soft → accent-lime-soft, design
-- --shadow-glow-primary → shadow-glow-primary; shadow-glow-accent y text-inverse
-- se derivan para consistencia + contraste.

INSERT INTO theme (slug, name, tokens) VALUES
  ('o2', 'O2 · Elite Athlete', '{
    "brand-primary": "#ff6a00", "brand-primary-hover": "#ff7a1a", "brand-primary-pressed": "#e65e00",
    "brand-primary-soft": "#ff8a33", "brand-primary-glow": "rgba(255,106,0,0.35)", "brand-primary-bg": "rgba(255,106,0,0.12)",
    "accent-lime": "#d9ff3f", "accent-lime-soft": "rgba(217,255,63,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(255,106,0,0.35)", "shadow-glow-accent": "0 0 24px rgba(217,255,63,0.35)",
    "text-inverse": "#0b0b0d"
  }'::jsonb),
  ('carbon', 'Carbon · Signal Yellow', '{
    "brand-primary": "#FFE200", "brand-primary-hover": "#FFE933", "brand-primary-pressed": "#E6CC00",
    "brand-primary-soft": "#FFED66", "brand-primary-glow": "rgba(255,226,0,0.35)", "brand-primary-bg": "rgba(255,226,0,0.10)",
    "accent-lime": "#f5f7fa", "accent-lime-soft": "rgba(245,247,250,0.15)",
    "shadow-glow-primary": "0 0 24px rgba(255,226,0,0.40)", "shadow-glow-accent": "0 0 24px rgba(245,247,250,0.35)",
    "text-inverse": "#080808"
  }'::jsonb),
  ('rosso', 'Rosso · Scuderia Red', '{
    "brand-primary": "#E8000D", "brand-primary-hover": "#FF1520", "brand-primary-pressed": "#C40000",
    "brand-primary-soft": "#FF4D55", "brand-primary-glow": "rgba(232,0,13,0.40)", "brand-primary-bg": "rgba(232,0,13,0.10)",
    "accent-lime": "#B0B3B8", "accent-lime-soft": "rgba(176,179,184,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(232,0,13,0.40)", "shadow-glow-accent": "0 0 24px rgba(176,179,184,0.35)",
    "text-inverse": "#f5f7fa"
  }'::jsonb),
  ('alpine', 'Alpine · Speed Blue', '{
    "brand-primary": "#005AFF", "brand-primary-hover": "#1A6CFF", "brand-primary-pressed": "#0044D6",
    "brand-primary-soft": "#4D8AFF", "brand-primary-glow": "rgba(0,90,255,0.35)", "brand-primary-bg": "rgba(0,90,255,0.10)",
    "accent-lime": "#C8E6FF", "accent-lime-soft": "rgba(200,230,255,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(0,90,255,0.40)", "shadow-glow-accent": "0 0 24px rgba(200,230,255,0.35)",
    "text-inverse": "#f5f7fa"
  }'::jsonb),
  ('volt', 'Volt · Electric Yellow-Green', '{
    "brand-primary": "#CCFF00", "brand-primary-hover": "#D4FF26", "brand-primary-pressed": "#AADD00",
    "brand-primary-soft": "#DDFF55", "brand-primary-glow": "rgba(204,255,0,0.40)", "brand-primary-bg": "rgba(204,255,0,0.10)",
    "accent-lime": "#f5f7fa", "accent-lime-soft": "rgba(245,247,250,0.15)",
    "shadow-glow-primary": "0 0 24px rgba(204,255,0,0.45)", "shadow-glow-accent": "0 0 24px rgba(245,247,250,0.35)",
    "text-inverse": "#080808"
  }'::jsonb),
  ('teal', 'Teal · AMG Petronas', '{
    "brand-primary": "#00D2BE", "brand-primary-hover": "#00E5CF", "brand-primary-pressed": "#00B0A0",
    "brand-primary-soft": "#33DECA", "brand-primary-glow": "rgba(0,210,190,0.40)", "brand-primary-bg": "rgba(0,210,190,0.10)",
    "accent-lime": "#FF1801", "accent-lime-soft": "rgba(255,24,1,0.15)",
    "shadow-glow-primary": "0 0 24px rgba(0,210,190,0.40)", "shadow-glow-accent": "0 0 24px rgba(255,24,1,0.35)",
    "text-inverse": "#080808"
  }'::jsonb),
  ('stealth', 'Stealth · Acid Green', '{
    "brand-primary": "#00FF6A", "brand-primary-hover": "#26FF7D", "brand-primary-pressed": "#00D957",
    "brand-primary-soft": "#4DFFA0", "brand-primary-glow": "rgba(0,255,106,0.40)", "brand-primary-bg": "rgba(0,255,106,0.08)",
    "accent-lime": "#f5f7fa", "accent-lime-soft": "rgba(245,247,250,0.12)",
    "shadow-glow-primary": "0 0 24px rgba(0,255,106,0.45)", "shadow-glow-accent": "0 0 24px rgba(245,247,250,0.35)",
    "text-inverse": "#080808"
  }'::jsonb),
  ('papaya', 'Papaya · McLaren Orange', '{
    "brand-primary": "#FF8000", "brand-primary-hover": "#FF921A", "brand-primary-pressed": "#E06A00",
    "brand-primary-soft": "#FFB04D", "brand-primary-glow": "rgba(255,128,0,0.40)", "brand-primary-bg": "rgba(255,128,0,0.10)",
    "accent-lime": "#47D5FC", "accent-lime-soft": "rgba(71,213,252,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(255,128,0,0.40)", "shadow-glow-accent": "0 0 24px rgba(71,213,252,0.35)",
    "text-inverse": "#080808"
  }'::jsonb),
  ('titanium', 'Titanium · Slate + Amber', '{
    "brand-primary": "#8B949E", "brand-primary-hover": "#A0AAB4", "brand-primary-pressed": "#6E7880",
    "brand-primary-soft": "#B0BAC4", "brand-primary-glow": "rgba(139,148,158,0.35)", "brand-primary-bg": "rgba(139,148,158,0.10)",
    "accent-lime": "#F0AB00", "accent-lime-soft": "rgba(240,171,0,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(139,148,158,0.35)", "shadow-glow-accent": "0 0 24px rgba(240,171,0,0.35)",
    "text-inverse": "#0b0b0d"
  }'::jsonb),
  ('midnight', 'Midnight · Deep Navy + Cyan', '{
    "brand-primary": "#0028A5", "brand-primary-hover": "#1A3FBF", "brand-primary-pressed": "#001E8A",
    "brand-primary-soft": "#4466CC", "brand-primary-glow": "rgba(0,40,165,0.40)", "brand-primary-bg": "rgba(0,40,165,0.12)",
    "accent-lime": "#00E5FF", "accent-lime-soft": "rgba(0,229,255,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(0,40,165,0.40)", "shadow-glow-accent": "0 0 24px rgba(0,229,255,0.35)",
    "text-inverse": "#f5f7fa"
  }'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, tokens = EXCLUDED.tokens;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  2. Reasignar O2 al tema 'o2' y limpiar placeholders            │
-- └─────────────────────────────────────────────────────────────────┘

UPDATE brand SET theme_slug = 'o2' WHERE theme_slug = 'o2-fitness';

-- Cualquier marca que apuntara a un placeholder eliminado cae a 'o2'.
UPDATE brand SET theme_slug = 'o2'
 WHERE theme_slug IN ('corporate', 'gaming', 'premium');

DELETE FROM theme
 WHERE slug IN ('o2-fitness', 'corporate', 'gaming', 'premium')
   AND slug NOT IN (SELECT theme_slug FROM brand);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  2.5 Marca WAZ — demo / default de la plataforma                │
-- └─────────────────────────────────────────────────────────────────┘
-- WAZ es la marca a la que cae el login/registro SIN link de club (el default,
-- DEFAULT_BRAND_SLUG='waz'). Tema azul (alpine). Sin logo image: la identidad es
-- el wordmark "PRODE.WAZ". Los clubs (O2, etc.) se entran por /register?brand=<slug>.
INSERT INTO brand (slug, name, short_name, sub_brand, hashtag_suffix, logo_url, theme_slug, status)
VALUES ('waz', 'WAZ', 'WAZ', 'Comunidad', 'WAZ', NULL, 'alpine', 'active')
ON CONFLICT (slug) DO NOTHING;

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  3. Storage bucket para logos de marca                          │
-- └─────────────────────────────────────────────────────────────────┘
-- Lectura pública (los logos se sirven en headers/share). Escritura solo desde
-- la server action gateada por super admin (usa service_role → bypassa RLS).

-- NOTA: image/svg+xml se excluye a propósito (un SVG público puede llevar
-- <script> y ejecutar al navegar la URL directa). Ver 20260609.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-logos', 'brand-logos', true, 2097152,  -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policy de lectura pública explícita (defensa: aunque el bucket sea public, una
-- policy clara evita sorpresas si alguien lo marca privado).
DROP POLICY IF EXISTS "Lectura pública de logos de marca" ON storage.objects;
CREATE POLICY "Lectura pública de logos de marca"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-logos');

-- Solo super admins escriben (el service-role igual bypassa; esto cubre el caso
-- de que alguien intente subir con el anon/auth client).
DROP POLICY IF EXISTS "Solo super admin sube logos" ON storage.objects;
CREATE POLICY "Solo super admin sube logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'brand-logos' AND public.is_super_admin());

DROP POLICY IF EXISTS "Solo super admin actualiza logos" ON storage.objects;
CREATE POLICY "Solo super admin actualiza logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'brand-logos' AND public.is_super_admin());

DROP POLICY IF EXISTS "Solo super admin borra logos" ON storage.objects;
CREATE POLICY "Solo super admin borra logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'brand-logos' AND public.is_super_admin());

-- ┌─────────────────────────────────────────────────────────────────┐
-- │  4. brand_admin_invite (asignar admins por email)              │
-- └─────────────────────────────────────────────────────────────────┘
-- El super admin agrega correos de administradores al crear/editar una marca.
-- Si el email ya tiene cuenta, se promueve en el acto (brand_admin row + role).
-- Si no, se guarda acá y se reconcilia al registrarse (app/auth/confirm).

CREATE TABLE IF NOT EXISTS brand_admin_invite (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  invited_by  UUID,                                  -- super admin
  consumed_at TIMESTAMPTZ,                            -- null = pendiente
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, email)
);

CREATE INDEX IF NOT EXISTS idx_brand_admin_invite_email
  ON brand_admin_invite(lower(email)) WHERE consumed_at IS NULL;

ALTER TABLE brand_admin_invite ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin gestiona invites" ON brand_admin_invite;
CREATE POLICY "Super admin gestiona invites"
  ON brand_admin_invite FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE brand_admin_invite IS
'Invitaciones de admin por email previas al registro. Se reconcilian en /auth/confirm: al confirmar, si el email matchea un invite pendiente, el user se promueve a brand_admin de esa marca.';


-- ====================================================================
-- MIGRACIÓN: 20260609_brand_isolation_hardening.sql
-- ====================================================================

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
  WITH CHECK (
    auth.uid() = user_id
    AND brand_id = public.current_brand_id()
    AND EXISTS (
      SELECT 1 FROM match
      WHERE id = match_id
        AND status = 'scheduled'
        AND (kickoff_at - INTERVAL '5 minutes') > NOW()
    )
  );

DROP POLICY IF EXISTS "User actualiza sus predicciones (si no cerró el partido)" ON prediction;
CREATE POLICY "User actualiza sus predicciones (si no cerró el partido)"
  ON prediction FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM match
      WHERE id = match_id
        AND status = 'scheduled'
        AND (kickoff_at - INTERVAL '5 minutes') > NOW()
    )
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


-- ====================================================================
-- SEED — Mundial 2026 (placeholder)
-- ====================================================================

-- =====================================================================
-- PRODE.WAZ — Seed Data — Mundial 2026 (placeholder)
-- Ejecutar una vez vía Supabase CLI: supabase db seed
-- O pegar en el SQL editor del dashboard de Supabase
--
-- Estructura: tournament → groups → teams → matches (72 fase grupos)
-- Los partidos de eliminatorias se insertan cuando avancen los equipos.
-- IDs de matches son UUIDs fijos para que el seed sea idempotente.
-- =====================================================================

-- ─── Tournament ──────────────────────────────────────────────────────

INSERT INTO tournament (id, slug, display_name, short_name, start_date, end_date, phase_config, active)
VALUES (
  '00000000-0000-0000-0000-000000002026',
  'mundial-2026',
  'Copa del Mundo FIFA 2026',
  'Mundial 2026',
  '2026-06-11',
  '2026-07-19',
  '{"phases":["groups","round-of-16","quarter","semi","final"],"multipliers":{"groups":1,"round-of-16":2,"quarter":3,"semi":4,"final":5}}',
  true
) ON CONFLICT (slug) DO NOTHING;

-- ─── Groups A-L ──────────────────────────────────────────────────────

INSERT INTO groups (id, tournament_id, letter) VALUES
('A', '00000000-0000-0000-0000-000000002026', 'A'),
('B', '00000000-0000-0000-0000-000000002026', 'B'),
('C', '00000000-0000-0000-0000-000000002026', 'C'),
('D', '00000000-0000-0000-0000-000000002026', 'D'),
('E', '00000000-0000-0000-0000-000000002026', 'E'),
('F', '00000000-0000-0000-0000-000000002026', 'F'),
('G', '00000000-0000-0000-0000-000000002026', 'G'),
('H', '00000000-0000-0000-0000-000000002026', 'H'),
('I', '00000000-0000-0000-0000-000000002026', 'I'),
('J', '00000000-0000-0000-0000-000000002026', 'J'),
('K', '00000000-0000-0000-0000-000000002026', 'K'),
('L', '00000000-0000-0000-0000-000000002026', 'L')
ON CONFLICT (id) DO NOTHING;

-- ─── Teams (48 selecciones) ──────────────────────────────────────────

INSERT INTO team (code, name, group_id) VALUES
-- Grupo A
('mx', 'México',          'A'),
('ar', 'Argentina',       'A'),
('jp', 'Japón',           'A'),
('qa', 'Qatar',           'A'),
-- Grupo B
('us', 'Estados Unidos',  'B'),
('br', 'Brasil',          'B'),
('kr', 'Corea del Sur',   'B'),
('ec', 'Ecuador',         'B'),
-- Grupo C
('ca', 'Canadá',          'C'),
('fr', 'Francia',         'C'),
('ng', 'Nigeria',         'C'),
('uy', 'Uruguay',         'C'),
-- Grupo D
('de', 'Alemania',        'D'),
('co', 'Colombia',        'D'),
('sa', 'Arabia Saudita',  'D'),
('se', 'Suecia',          'D'),
-- Grupo E
('es', 'España',          'E'),
('ma', 'Marruecos',       'E'),
('au', 'Australia',       'E'),
('cr', 'Costa Rica',      'E'),
-- Grupo F
('pt', 'Portugal',        'F'),
('ir', 'Irán',            'F'),
('pa', 'Panamá',          'F'),
('be', 'Bélgica',         'F'),
-- Grupo G
('nl', 'Países Bajos',    'G'),
('sn', 'Senegal',         'G'),
('no', 'Noruega',         'G'),
('ws', 'Gales',           'G'),
-- Grupo H
('it', 'Italia',          'H'),
('tn', 'Túnez',           'H'),
('cl', 'Chile',           'H'),
('jm', 'Jamaica',         'H'),
-- Grupo I
('gb', 'Inglaterra',      'I'),
('ck', 'Rep. Checa',      'I'),
('py', 'Paraguay',        'I'),
('tr', 'Turquía',         'I'),
-- Grupo J
('dk', 'Dinamarca',       'J'),
('om', 'Omán',            'J'),
('ci', 'Costa de Marfil', 'J'),
('hr', 'Croacia',         'J'),
-- Grupo K
('pl', 'Polonia',         'K'),
('ke', 'Kenia',           'K'),
('ve', 'Venezuela',       'K'),
('nz', 'Nueva Zelanda',   'K'),
-- Grupo L
('ch', 'Suiza',           'L'),
('eg', 'Egipto',          'L'),
('pe', 'Perú',            'L'),
('uz', 'Uzbekistán',      'L')
ON CONFLICT (code) DO UPDATE SET
  name     = EXCLUDED.name,
  group_id = EXCLUDED.group_id;

-- ─── Group Stage Matches (72 partidos) ───────────────────────────────
--
-- Patrón round-robin por grupo [T1, T2, T3, T4]:
--   MD1: T1 vs T2,  T3 vs T4
--   MD2: T2 vs T3,  T4 vs T1
--   MD3: T2 vs T4,  T1 vs T3  (simultáneos — mismo kickoff_at)
--
-- Horarios UTC (Buenos Aires = UTC-3):
--   Slot mañana (grupos A-F):  MD1 16:00/19:00, MD2 19:00/22:00, MD3 19:00
--   Slot tarde  (grupos G-L):  MD1 20:00/23:00, MD2 20:00/23:00, MD3 22:00
--
-- Calendario:
--   MD1: Grupos A+G Jun 11 | B+H Jun 12 | C+I Jun 13 | D+J Jun 14 | E+K Jun 15 | F+L Jun 16
--   MD2: Grupos A+G Jun 17 | B+H Jun 18 | C+I Jun 19 | D+J Jun 20 | E+K Jun 21 | F+L Jun 22
--   MD3: Grupos A+G Jun 23 | B+H Jun 24 | C+I Jun 25 | D+J Jun 26 | E+K Jun 27 | F+L Jun 28

INSERT INTO match (id, tournament_id, phase, group_id, home_code, away_code, kickoff_at, venue_city, status)
VALUES

-- ═══ GRUPO A: mx, ar, jp, qa ═════════════════════════════════════════
-- MD1 — 11 jun
('00000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'A', 'mx', 'ar', '2026-06-11T16:00:00Z', 'Ciudad de México', 'scheduled'),
('00000001-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'A', 'jp', 'qa', '2026-06-11T19:00:00Z', 'Guadalajara',       'scheduled'),
-- MD2 — 17 jun
('00000001-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'A', 'ar', 'jp', '2026-06-17T19:00:00Z', 'Monterrey',         'scheduled'),
('00000001-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'A', 'qa', 'mx', '2026-06-17T22:00:00Z', 'Ciudad de México',  'scheduled'),
-- MD3 — 23 jun (simultáneos)
('00000001-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'A', 'ar', 'qa', '2026-06-23T19:00:00Z', 'Guadalajara',       'scheduled'),
('00000001-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'A', 'mx', 'jp', '2026-06-23T19:00:00Z', 'Monterrey',         'scheduled'),

-- ═══ GRUPO B: us, br, kr, ec ═════════════════════════════════════════
-- MD1 — 12 jun
('00000002-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'B', 'us', 'br', '2026-06-12T16:00:00Z', 'Los Angeles', 'scheduled'),
('00000002-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'B', 'kr', 'ec', '2026-06-12T19:00:00Z', 'Dallas',      'scheduled'),
-- MD2 — 18 jun
('00000002-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'B', 'br', 'kr', '2026-06-18T19:00:00Z', 'Los Angeles', 'scheduled'),
('00000002-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'B', 'ec', 'us', '2026-06-18T22:00:00Z', 'Houston',     'scheduled'),
-- MD3 — 24 jun (simultáneos)
('00000002-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'B', 'br', 'ec', '2026-06-24T19:00:00Z', 'Dallas',      'scheduled'),
('00000002-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'B', 'us', 'kr', '2026-06-24T19:00:00Z', 'Los Angeles', 'scheduled'),

-- ═══ GRUPO C: ca, fr, ng, uy ═════════════════════════════════════════
-- MD1 — 13 jun
('00000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'C', 'ca', 'fr', '2026-06-13T16:00:00Z', 'Toronto',   'scheduled'),
('00000003-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'C', 'ng', 'uy', '2026-06-13T19:00:00Z', 'Vancouver', 'scheduled'),
-- MD2 — 19 jun
('00000003-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'C', 'fr', 'ng', '2026-06-19T19:00:00Z', 'Toronto',   'scheduled'),
('00000003-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'C', 'uy', 'ca', '2026-06-19T22:00:00Z', 'Vancouver', 'scheduled'),
-- MD3 — 25 jun (simultáneos)
('00000003-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'C', 'fr', 'uy', '2026-06-25T19:00:00Z', 'Toronto',   'scheduled'),
('00000003-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'C', 'ca', 'ng', '2026-06-25T19:00:00Z', 'Vancouver', 'scheduled'),

-- ═══ GRUPO D: de, co, sa, se ═════════════════════════════════════════
-- MD1 — 14 jun
('00000004-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'D', 'de', 'co', '2026-06-14T16:00:00Z', 'Dallas',   'scheduled'),
('00000004-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'D', 'sa', 'se', '2026-06-14T19:00:00Z', 'Atlanta',  'scheduled'),
-- MD2 — 20 jun
('00000004-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'D', 'co', 'sa', '2026-06-20T19:00:00Z', 'Houston',  'scheduled'),
('00000004-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'D', 'se', 'de', '2026-06-20T22:00:00Z', 'Dallas',   'scheduled'),
-- MD3 — 26 jun (simultáneos)
('00000004-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'D', 'co', 'se', '2026-06-26T19:00:00Z', 'Dallas',   'scheduled'),
('00000004-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'D', 'de', 'sa', '2026-06-26T19:00:00Z', 'Atlanta',  'scheduled'),

-- ═══ GRUPO E: es, ma, au, cr ═════════════════════════════════════════
-- MD1 — 15 jun
('00000005-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'E', 'es', 'ma', '2026-06-15T16:00:00Z', 'Miami',         'scheduled'),
('00000005-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'E', 'au', 'cr', '2026-06-15T19:00:00Z', 'Kansas City',   'scheduled'),
-- MD2 — 21 jun
('00000005-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'E', 'ma', 'au', '2026-06-21T19:00:00Z', 'Seattle',       'scheduled'),
('00000005-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'E', 'cr', 'es', '2026-06-21T22:00:00Z', 'Miami',         'scheduled'),
-- MD3 — 27 jun (simultáneos)
('00000005-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'E', 'ma', 'cr', '2026-06-27T19:00:00Z', 'Miami',         'scheduled'),
('00000005-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'E', 'es', 'au', '2026-06-27T19:00:00Z', 'Kansas City',   'scheduled'),

-- ═══ GRUPO F: pt, ir, pa, be ═════════════════════════════════════════
-- MD1 — 16 jun
('00000006-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'F', 'pt', 'ir', '2026-06-16T16:00:00Z', 'Boston',       'scheduled'),
('00000006-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'F', 'pa', 'be', '2026-06-16T19:00:00Z', 'Philadelphia', 'scheduled'),
-- MD2 — 22 jun
('00000006-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'F', 'ir', 'pa', '2026-06-22T19:00:00Z', 'New York',     'scheduled'),
('00000006-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'F', 'be', 'pt', '2026-06-22T22:00:00Z', 'Boston',       'scheduled'),
-- MD3 — 28 jun (simultáneos)
('00000006-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'F', 'ir', 'be', '2026-06-28T19:00:00Z', 'Philadelphia', 'scheduled'),
('00000006-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'F', 'pt', 'pa', '2026-06-28T19:00:00Z', 'New York',     'scheduled'),

-- ═══ GRUPO G: nl, sn, no, ws ═════════════════════════════════════════
-- MD1 — 11 jun (slot tarde)
('00000007-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'G', 'nl', 'sn', '2026-06-11T20:00:00Z', 'Seattle',       'scheduled'),
('00000007-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'G', 'no', 'ws', '2026-06-11T23:00:00Z', 'San Francisco', 'scheduled'),
-- MD2 — 17 jun (slot tarde)
('00000007-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'G', 'sn', 'no', '2026-06-17T20:00:00Z', 'San Francisco', 'scheduled'),
('00000007-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'G', 'ws', 'nl', '2026-06-17T23:00:00Z', 'Los Angeles',   'scheduled'),
-- MD3 — 23 jun (simultáneos, slot tarde)
('00000007-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'G', 'sn', 'ws', '2026-06-23T22:00:00Z', 'Seattle',       'scheduled'),
('00000007-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'G', 'nl', 'no', '2026-06-23T22:00:00Z', 'San Francisco', 'scheduled'),

-- ═══ GRUPO H: it, tn, cl, jm ═════════════════════════════════════════
-- MD1 — 12 jun (slot tarde)
('00000008-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'H', 'it', 'tn', '2026-06-12T20:00:00Z', 'New York',     'scheduled'),
('00000008-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'H', 'cl', 'jm', '2026-06-12T23:00:00Z', 'Philadelphia', 'scheduled'),
-- MD2 — 18 jun (slot tarde)
('00000008-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'H', 'tn', 'cl', '2026-06-18T20:00:00Z', 'Boston',       'scheduled'),
('00000008-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'H', 'jm', 'it', '2026-06-18T23:00:00Z', 'New York',     'scheduled'),
-- MD3 — 24 jun (simultáneos, slot tarde)
('00000008-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'H', 'tn', 'jm', '2026-06-24T22:00:00Z', 'Philadelphia', 'scheduled'),
('00000008-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'H', 'it', 'cl', '2026-06-24T22:00:00Z', 'Boston',       'scheduled'),

-- ═══ GRUPO I: gb, ck, py, tr ═════════════════════════════════════════
-- MD1 — 13 jun (slot tarde)
('00000009-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'I', 'gb', 'ck', '2026-06-13T20:00:00Z', 'Dallas',      'scheduled'),
('00000009-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'I', 'py', 'tr', '2026-06-13T23:00:00Z', 'Kansas City', 'scheduled'),
-- MD2 — 19 jun (slot tarde)
('00000009-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'I', 'ck', 'py', '2026-06-19T20:00:00Z', 'Houston',     'scheduled'),
('00000009-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'I', 'tr', 'gb', '2026-06-19T23:00:00Z', 'Dallas',      'scheduled'),
-- MD3 — 25 jun (simultáneos, slot tarde)
('00000009-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'I', 'ck', 'tr', '2026-06-25T22:00:00Z', 'Kansas City', 'scheduled'),
('00000009-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'I', 'gb', 'py', '2026-06-25T22:00:00Z', 'Houston',     'scheduled'),

-- ═══ GRUPO J: dk, om, ci, hr ═════════════════════════════════════════
-- MD1 — 14 jun (slot tarde)
('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'J', 'dk', 'om', '2026-06-14T20:00:00Z', 'Miami',   'scheduled'),
('0000000a-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'J', 'ci', 'hr', '2026-06-14T23:00:00Z', 'Atlanta', 'scheduled'),
-- MD2 — 20 jun (slot tarde)
('0000000a-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'J', 'om', 'ci', '2026-06-20T20:00:00Z', 'Miami',   'scheduled'),
('0000000a-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'J', 'hr', 'dk', '2026-06-20T23:00:00Z', 'Atlanta', 'scheduled'),
-- MD3 — 26 jun (simultáneos, slot tarde)
('0000000a-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'J', 'om', 'hr', '2026-06-26T22:00:00Z', 'Miami',   'scheduled'),
('0000000a-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'J', 'dk', 'ci', '2026-06-26T22:00:00Z', 'Atlanta', 'scheduled'),

-- ═══ GRUPO K: pl, ke, ve, nz ═════════════════════════════════════════
-- MD1 — 15 jun (slot tarde)
('0000000b-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'K', 'pl', 'ke', '2026-06-15T20:00:00Z', 'Houston',     'scheduled'),
('0000000b-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'K', 've', 'nz', '2026-06-15T23:00:00Z', 'Kansas City', 'scheduled'),
-- MD2 — 21 jun (slot tarde)
('0000000b-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'K', 'ke', 've', '2026-06-21T20:00:00Z', 'Kansas City', 'scheduled'),
('0000000b-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'K', 'nz', 'pl', '2026-06-21T23:00:00Z', 'Houston',     'scheduled'),
-- MD3 — 27 jun (simultáneos, slot tarde)
('0000000b-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'K', 'ke', 'nz', '2026-06-27T22:00:00Z', 'Houston',     'scheduled'),
('0000000b-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'K', 'pl', 've', '2026-06-27T22:00:00Z', 'Kansas City', 'scheduled'),

-- ═══ GRUPO L: ch, eg, pe, uz ═════════════════════════════════════════
-- MD1 — 16 jun (slot tarde)
('0000000c-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000002026', 'groups', 'L', 'ch', 'eg', '2026-06-16T20:00:00Z', 'Guadalajara',      'scheduled'),
('0000000c-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000002026', 'groups', 'L', 'pe', 'uz', '2026-06-16T23:00:00Z', 'Monterrey',        'scheduled'),
-- MD2 — 22 jun (slot tarde)
('0000000c-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000002026', 'groups', 'L', 'eg', 'pe', '2026-06-22T20:00:00Z', 'Ciudad de México', 'scheduled'),
('0000000c-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000002026', 'groups', 'L', 'uz', 'ch', '2026-06-22T23:00:00Z', 'Guadalajara',      'scheduled'),
-- MD3 — 28 jun (simultáneos, slot tarde)
('0000000c-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000002026', 'groups', 'L', 'eg', 'uz', '2026-06-28T22:00:00Z', 'Monterrey',        'scheduled'),
('0000000c-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000002026', 'groups', 'L', 'ch', 'pe', '2026-06-28T22:00:00Z', 'Ciudad de México', 'scheduled')

ON CONFLICT (id) DO NOTHING;

-- ─── Achievement catalog (19 logros) ─────────────────────────────────
-- Fuente de verdad: lib/achievements/catalog.ts.
-- Si editás acá, actualizá también catalog.ts y data/mocks/achievements.json.

INSERT INTO achievement_catalog (id, category, name, description, icon_ref, points_bonus, trigger_key) VALUES
-- Skill
('A01', 'skill',       'El que sabe',     'Acertá 5 resultados exactos seguidos.',          'target',       15, 'streak_exact_5'),
('A02', 'skill',       'Visionario',      'Acertá al campeón del Mundial antes del torneo.', 'crown',       40, 'champion_correct'),
('A03', 'skill',       'Mufa controlada', 'Acertá un upset: predijiste al no-favorito y ganó.', 'flame',    10, 'upset_correct'),
('A04', 'skill',       'Pleno',           'Acertá TODOS los partidos de un grupo.',         'check',        20, 'group_complete_correct'),
('A05', 'skill',       'Eliminator',      'Acertá todos los cruces de octavos.',            'medal',        25, 'knockout_round_correct'),
('A06', 'skill',       'Subcampeón',      'Acertá al subcampeón del Mundial antes del torneo.', 'medal',    30, 'runner_up_correct'),
('A07', 'skill',       'Finalistas',      'Acertá a los 2 finalistas del Mundial.',         'world-trophy', 40, 'finalists_correct'),
-- Consistency
('C01', 'consistency', 'Constante',       '7 días seguidos cargando predicciones.',         'flame',        10, 'streak_days_7'),
('C02', 'consistency', 'Maratonista',     '21 días seguidos cargando predicciones.',        'flame',        30, 'streak_days_21'),
('C03', 'consistency', 'Todoterreno',     'Cargaste el 100% de los partidos del torneo.',   'ball',         50, 'tournament_100'),
('C04', 'consistency', 'Madrugador',      'Cargaste un grupo completo el 1er día disponible.', 'clock',     5,  'group_first_day'),
-- Social
('S01', 'social',      'Inicio fuerte',   'Tu primer post en el muro.',                     'comment',      5,  'first_post'),
('S02', 'social',      'Popular',         'Conseguiste 10 reacciones en un solo post.',     'heart',        5,  'post_10_reactions'),
('S03', 'social',      'Embajador',       'Compartiste 5 prodes fuera de la app.',          'share',        10, 'external_shares_5'),
('S04', 'social',      'Conector',        'Comentaste en 10 posts distintos.',              'comment',      5,  'comments_made_10'),
('S05', 'social',      'Tribu',           'Tres amigos tuyos del gym también activaron la app.', 'nav-user', 10, 'friends_active_3'),
-- Position
('P01', 'position',    'Top 10',          'Llegaste al top 10 del ranking.',                'nav-chart',    0, 'position_top_10'),
('P02', 'position',    'Podio',           'Llegaste al top 3 del ranking.',                 'medal',        0, 'position_top_3'),
('P03', 'position',    'Líder',           'Liderás el ranking general.',                    'crown',        0, 'position_1'),
('P04', 'position',    'Remontada',       'Subiste 10 o más posiciones en una semana.',     'arrow-up',     15, 'weekly_rise_10')
ON CONFLICT (id) DO UPDATE SET
  category     = EXCLUDED.category,
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  icon_ref     = EXCLUDED.icon_ref,
  points_bonus = EXCLUDED.points_bonus,
  trigger_key  = EXCLUDED.trigger_key;

-- ─── Invite codes para la beta (template) ────────────────────────────
-- Descomentar y editar antes de aplicar. Expiración por defecto: post-final.
-- Recomendado usar scripts/seed-invites.mjs en lugar de esto (más cómodo).
--
-- INSERT INTO invite_code (code, used, expires_at) VALUES
--   ('BETA-01', FALSE, '2026-07-26T23:59:59-03:00'),
--   ('BETA-02', FALSE, '2026-07-26T23:59:59-03:00'),
--   ('BETA-03', FALSE, '2026-07-26T23:59:59-03:00'),
--   ('BETA-04', FALSE, '2026-07-26T23:59:59-03:00'),
--   ('BETA-05', FALSE, '2026-07-26T23:59:59-03:00')
-- ON CONFLICT (code) DO NOTHING;

-- ─── Verify seed ─────────────────────────────────────────────────────
-- Después de ejecutar, corroborá con:
--   SELECT COUNT(*) FROM match WHERE phase = 'groups';  -- debe ser 72
--   SELECT COUNT(*) FROM team;                          -- debe ser 48
--   SELECT COUNT(*) FROM groups;                        -- debe ser 12
--   SELECT COUNT(*) FROM achievement_catalog;           -- debe ser 20


-- ════════════════════════════════════════════════════════════════════
-- GRANTS FINALES — explícitos sobre todo lo creado (belt & suspenders).
-- La seguridad real la dan las RLS (activas en todas las tablas de usuario);
-- estos grants solo dan acceso a nivel tabla, que la RLS después filtra por fila.
-- ════════════════════════════════════════════════════════════════════
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
