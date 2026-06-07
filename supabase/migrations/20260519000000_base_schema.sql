-- 20260519000000_base_schema.sql
--
-- Schema base idempotente (origen: supabase/schema.sql).
-- Versión migration-safe: CREATE IF NOT EXISTS, DO$$ para enums,
-- DROP...IF EXISTS antes de triggers y policies.
-- Correr ANTES de todas las demás migrations (nombre 20260519 < 20260524).
--
-- Reproduce schema.sql objeto-por-objeto (incluidas las MVs mv_user_summary /
-- mv_ranking_global) para que las 25 migrations existentes apliquen idénticas a
-- como lo hicieron en O2. La migration 20260607_multi_brand.sql elimina las MVs
-- y las reemplaza por funciones parametrizadas; aquí solo se crean para mantener
-- la cadena consistente (20260526_refresh_views_fn las referencia).

-- ─── Extensions ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Enums ───────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE phase_t AS ENUM ('groups','round-of-16','quarter','semi','final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE match_status_t AS ENUM ('scheduled','live','finished','postponed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE user_level_t AS ENUM ('1','2','3','4','5');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE achievement_category_t AS ENUM ('skill','consistency','social','position');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE reaction_target_t AS ENUM ('post','comment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE visibility_t AS ENUM ('public','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_type_t AS ENUM (
    'onboarding-incomplete','match-upcoming','phase-start','match-result',
    'reaction','comment','achievement-unlocked','close-to-podium',
    'position-change','weekly-digest','tournament-end','share-reminder'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE share_template_t AS ENUM ('summary','position','match','achievement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE share_channel_t AS ENUM ('instagram','whatsapp','download','more');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Foundational tables ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournament (
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

CREATE TABLE IF NOT EXISTS groups (
  id            TEXT PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  letter        TEXT NOT NULL,
  UNIQUE(tournament_id, letter)
);

CREATE TABLE IF NOT EXISTS team (
  code     TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS player (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  full_name TEXT NOT NULL,
  team_code TEXT NOT NULL REFERENCES team(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match (
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

CREATE INDEX IF NOT EXISTS idx_match_kickoff ON match(kickoff_at);
CREATE INDEX IF NOT EXISTS idx_match_status  ON match(status) WHERE status != 'finished';
CREATE INDEX IF NOT EXISTS idx_match_phase   ON match(phase);

CREATE TABLE IF NOT EXISTS match_result (
  match_id              UUID PRIMARY KEY REFERENCES match(id) ON DELETE CASCADE,
  home_score            SMALLINT NOT NULL CHECK (home_score >= 0 AND home_score <= 20),
  away_score            SMALLINT NOT NULL CHECK (away_score >= 0 AND away_score <= 20),
  top_scorer_player_id  UUID REFERENCES player(id) ON DELETE SET NULL,
  finished_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users & auth ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invite_code (
  code        TEXT PRIMARY KEY,
  created_by  UUID,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  used_by     UUID,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user" (
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
  invite_code_used     TEXT REFERENCES invite_code(code),
  notification_prefs   JSONB NOT NULL DEFAULT '{"matchReminders":true,"results":true,"socialReactions":false,"weeklyDigest":true}',
  visibility           visibility_t NOT NULL DEFAULT 'public',
  is_admin             BOOLEAN NOT NULL DEFAULT false,
  deleted_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_position     ON "user"(position)         WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_total_points ON "user"(total_points DESC) WHERE deleted_at IS NULL;

-- ─── Predictions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prediction (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  match_id          UUID NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  home_score        SMALLINT NOT NULL CHECK (home_score >= 0 AND home_score <= 20),
  away_score        SMALLINT NOT NULL CHECK (away_score >= 0 AND away_score <= 20),
  points_earned     INTEGER,
  points_breakdown  JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_prediction_user       ON prediction(user_id);
CREATE INDEX IF NOT EXISTS idx_prediction_match      ON prediction(match_id);
CREATE INDEX IF NOT EXISTS idx_prediction_unsettled  ON prediction(match_id) WHERE points_earned IS NULL;

CREATE TABLE IF NOT EXISTS special_prediction (
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

-- ─── Social ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (LENGTH(body) > 0 AND LENGTH(body) <= 280),
  embed_type      TEXT CHECK (embed_type IN ('prediction','match')),
  embed_ref_id    UUID,
  image_url       TEXT,
  image_width     SMALLINT,
  image_height    SMALLINT,
  reaction_count  INTEGER NOT NULL DEFAULT 0,
  comment_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_post_created ON post(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_post_user    ON post(user_id);

CREATE TABLE IF NOT EXISTS comment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (LENGTH(body) > 0 AND LENGTH(body) <= 280),
  reaction_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comment_post ON comment(post_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS reaction (
  target_type   reaction_target_t NOT NULL,
  target_id     UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (target_type, target_id, user_id)
);

-- ─── Achievements ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS achievement_catalog (
  id             TEXT PRIMARY KEY,
  category       achievement_category_t NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL,
  icon_ref       TEXT NOT NULL,
  points_bonus   INTEGER NOT NULL DEFAULT 0,
  trigger_key    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievement (
  user_id          UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  achievement_id   TEXT NOT NULL REFERENCES achievement_catalog(id),
  unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shared           BOOLEAN NOT NULL DEFAULT FALSE,
  progress         SMALLINT,
  PRIMARY KEY (user_id, achievement_id)
);

-- ─── Ranking snapshots ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ranking_snapshot (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournament(id),
  week_number   SMALLINT NOT NULL,
  snapshot_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entries       JSONB NOT NULL,
  UNIQUE (tournament_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_ranking_week ON ranking_snapshot(week_number DESC);

-- ─── Notifications & push ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type        notification_type_t NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  deep_link   TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_user   ON notification(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_unread ON notification(user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS push_subscription (
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

-- ─── Share intents ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS share_intent (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  template     share_template_t NOT NULL,
  channel      share_channel_t NOT NULL,
  context_id   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_intent_user ON share_intent(user_id, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────

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
ALTER TABLE tournament          ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE team                ENABLE ROW LEVEL SECURITY;
ALTER TABLE player              ENABLE ROW LEVEL SECURITY;
ALTER TABLE match               ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_result        ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_snapshot    ENABLE ROW LEVEL SECURITY;

-- ─── Helper functions ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT u.is_admin FROM "user" u WHERE u.id = auth.uid()), false);
$$;

-- ─── RLS Policies (reference / public data) ──────────────────────────

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

-- ─── RLS Policies (user-data) ────────────────────────────────────────
-- Nota: 20260607_multi_brand.sql reescribe estas policies con filtro de marca.
-- Aquí se crean versiones simples que funcionan para la marca única pre-migración.

DROP POLICY IF EXISTS "Socios pueden leer todos los users públicos"   ON "user";
DROP POLICY IF EXISTS "Cada user actualiza su propio perfil"          ON "user";
DROP POLICY IF EXISTS "Socios leen predicciones públicas"             ON prediction;
DROP POLICY IF EXISTS "User inserta sus predicciones"                 ON prediction;
DROP POLICY IF EXISTS "User actualiza sus predicciones (si no cerró el partido)" ON prediction;
DROP POLICY IF EXISTS "Socios leen posts no borrados"                 ON post;
DROP POLICY IF EXISTS "User crea sus posts"                           ON post;
DROP POLICY IF EXISTS "Borra post: dueño o admin"                     ON post;
DROP POLICY IF EXISTS "Socios leen comentarios"                       ON comment;
DROP POLICY IF EXISTS "User crea comentarios"                         ON comment;
DROP POLICY IF EXISTS "Borra comentario: dueño o admin"               ON comment;
DROP POLICY IF EXISTS "Socios ven todas las reacciones"               ON reaction;
DROP POLICY IF EXISTS "User reacciona / des-reacciona"                ON reaction;
DROP POLICY IF EXISTS "User ve sus notifs"                            ON notification;
DROP POLICY IF EXISTS "User marca leídas"                             ON notification;
DROP POLICY IF EXISTS "Socios leen logros"                            ON user_achievement;
DROP POLICY IF EXISTS "User desbloquea sus logros"                    ON user_achievement;

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

CREATE POLICY "User inserta sus predicciones"
  ON prediction FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User actualiza sus predicciones (si no cerró el partido)"
  ON prediction FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM match WHERE id = match_id AND (kickoff_at - INTERVAL '1 hour') > NOW())
  );

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

CREATE POLICY "User ve sus notifs"
  ON notification FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "User marca leídas"
  ON notification FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Socios leen logros"
  ON user_achievement FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "User desbloquea sus logros"
  ON user_achievement FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── Functions ───────────────────────────────────────────────────────

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

  v_mult := CASE v_phase
    WHEN 'groups'      THEN 1
    WHEN 'round-of-16' THEN 2
    WHEN 'quarter'     THEN 3
    WHEN 'semi'        THEN 4
    WHEN 'final'       THEN 5
  END;

  IF v_home_pred = v_home_real AND v_away_pred = v_away_real THEN
    v_base := 8;
  ELSE
    IF (v_home_pred > v_away_pred AND v_home_real > v_away_real)
       OR (v_home_pred < v_away_pred AND v_home_real < v_away_real)
    THEN v_base := 3;
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

CREATE OR REPLACE FUNCTION fn_settle_match(p_match_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_pred   RECORD;
  v_points INTEGER;
BEGIN
  FOR v_pred IN
    SELECT id, user_id FROM prediction WHERE match_id = p_match_id AND points_earned IS NULL
  LOOP
    v_points := fn_calculate_points(v_pred.id);
    UPDATE prediction SET points_earned = v_points, updated_at = NOW() WHERE id = v_pred.id;
    UPDATE "user"    SET total_points = total_points + v_points              WHERE id = v_pred.user_id;
  END LOOP;
  PERFORM fn_recalculate_positions();
END $$;

CREATE OR REPLACE FUNCTION fn_recalculate_positions()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, joined_at ASC) AS pos
    FROM "user" WHERE deleted_at IS NULL
  )
  UPDATE "user" u SET position = r.pos FROM ranked r WHERE u.id = r.id;
END $$;

CREATE OR REPLACE FUNCTION trg_match_finished()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
    PERFORM fn_settle_match(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_match_status_change ON match;
CREATE TRIGGER trg_match_status_change
  AFTER UPDATE OF status ON match
  FOR EACH ROW EXECUTE FUNCTION trg_match_finished();

CREATE OR REPLACE FUNCTION trg_reaction_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.target_type = 'post' THEN
      UPDATE post    SET reaction_count = reaction_count + 1 WHERE id = NEW.target_id;
    ELSE
      UPDATE comment SET reaction_count = reaction_count + 1 WHERE id = NEW.target_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.target_type = 'post' THEN
      UPDATE post    SET reaction_count = reaction_count - 1 WHERE id = OLD.target_id;
    ELSE
      UPDATE comment SET reaction_count = reaction_count - 1 WHERE id = OLD.target_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_reaction_count_change ON reaction;
CREATE TRIGGER trg_reaction_count_change
  AFTER INSERT OR DELETE ON reaction
  FOR EACH ROW EXECUTE FUNCTION trg_reaction_count();

CREATE OR REPLACE FUNCTION trg_notify_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_actor TEXT;
BEGIN
  SELECT user_id INTO v_owner FROM post WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT name INTO v_actor FROM "user" WHERE id = NEW.user_id;
  INSERT INTO notification (user_id, type, title, body, deep_link)
  VALUES (v_owner, 'comment', 'Nuevo comentario',
          COALESCE(v_actor,'Alguien') || ' comentó tu publicación',
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
          'A ' || COALESCE(v_actor,'alguien') || ' le gustó tu publicación',
          '/app/muro/' || NEW.target_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reaction_notify ON reaction;
CREATE TRIGGER trg_reaction_notify
  AFTER INSERT ON reaction
  FOR EACH ROW EXECUTE FUNCTION trg_notify_reaction();

-- ─── Materialized views ──────────────────────────────────────────────
-- Reproducidas de schema.sql. La migration 20260607 las elimina (DROP ... IF
-- EXISTS CASCADE) y reemplaza por fn_user_summary_for_brand / fn_ranking_for_brand.
-- Se mantienen acá para que la cadena de migrations sea idéntica a O2 y para que
-- 20260526_refresh_views_fn (que las referencia) tenga un objeto válido.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_summary AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_user_summary_pk ON mv_user_summary(user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ranking_global AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ranking_global_pk ON mv_ranking_global(user_id);
CREATE INDEX IF NOT EXISTS idx_mv_ranking_global_pos ON mv_ranking_global(position);
