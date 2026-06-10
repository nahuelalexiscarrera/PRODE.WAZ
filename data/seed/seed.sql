-- PRODE.WAZ — Seed inicial de la DB (Sprint 0)
--
-- Correr DESPUÉS de aplicar schema.sql + todas las migrations.
-- Idempotente: todos los inserts usan ON CONFLICT DO NOTHING / DO UPDATE.
--
-- Orden: tournament → groups → team → match
-- ---------------------------------------------------------------

-- ─── 1. TORNEO ───────────────────────────────────────────────────

INSERT INTO tournament (slug, display_name, short_name, start_date, end_date, phase_config, active)
VALUES (
  'mundial-2026',
  'FIFA World Cup 2026',
  'Mundial 2026',
  '2026-06-11',
  '2026-07-19',
  '{
    "groupPhase": { "groups": 12, "teamsPerGroup": 4, "advanceCount": 2 },
    "knockout": ["round-of-32", "round-of-16", "quarter", "semi", "final"]
  }'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE
  SET active = true,
      display_name = EXCLUDED.display_name;

-- ─── 2. GRUPOS ───────────────────────────────────────────────────

DO $$
DECLARE v_tid UUID;
BEGIN
  SELECT id INTO v_tid FROM tournament WHERE slug = 'mundial-2026';
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'Tournament mundial-2026 no encontrado';
  END IF;

  INSERT INTO groups (id, tournament_id, letter) VALUES
    ('A', v_tid, 'A'), ('B', v_tid, 'B'), ('C', v_tid, 'C'),
    ('D', v_tid, 'D'), ('E', v_tid, 'E'), ('F', v_tid, 'F'),
    ('G', v_tid, 'G'), ('H', v_tid, 'H'), ('I', v_tid, 'I'),
    ('J', v_tid, 'J'), ('K', v_tid, 'K'), ('L', v_tid, 'L')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ─── 3. EQUIPOS ──────────────────────────────────────────────────
-- Los 48 clasificados REALES (sorteo 5 dic 2025, repechajes mar 2026).
-- Códigos = SVG en /public/flags/<code>.svg. Grupos = sorteo real.

INSERT INTO team (code, name, group_id) VALUES
  -- Grupo A
  ('mx',     'México',           'A'),
  ('za',     'Sudáfrica',        'A'),
  ('kr',     'Corea del Sur',    'A'),
  ('cz',     'Rep. Checa',       'A'),
  -- Grupo B
  ('ca',     'Canadá',           'B'),
  ('ba',     'Bosnia',           'B'),
  ('qa',     'Qatar',            'B'),
  ('ch',     'Suiza',            'B'),
  -- Grupo C
  ('br',     'Brasil',           'C'),
  ('ma',     'Marruecos',        'C'),
  ('ht',     'Haití',            'C'),
  ('gb-sct', 'Escocia',          'C'),
  -- Grupo D
  ('us',     'Estados Unidos',   'D'),
  ('py',     'Paraguay',         'D'),
  ('au',     'Australia',        'D'),
  ('tr',     'Turquía',          'D'),
  -- Grupo E
  ('de',     'Alemania',         'E'),
  ('cw',     'Curazao',          'E'),
  ('ci',     'Costa de Marfil',  'E'),
  ('ec',     'Ecuador',          'E'),
  -- Grupo F
  ('nl',     'Países Bajos',     'F'),
  ('jp',     'Japón',            'F'),
  ('se',     'Suecia',           'F'),
  ('tn',     'Túnez',            'F'),
  -- Grupo G
  ('be',     'Bélgica',          'G'),
  ('eg',     'Egipto',           'G'),
  ('ir',     'Irán',             'G'),
  ('nz',     'Nueva Zelanda',    'G'),
  -- Grupo H
  ('es',     'España',           'H'),
  ('cv',     'Cabo Verde',       'H'),
  ('sa',     'Arabia Saudita',   'H'),
  ('uy',     'Uruguay',          'H'),
  -- Grupo I
  ('fr',     'Francia',          'I'),
  ('sn',     'Senegal',          'I'),
  ('iq',     'Irak',             'I'),
  ('no',     'Noruega',          'I'),
  -- Grupo J
  ('ar',     'Argentina',        'J'),
  ('dz',     'Argelia',          'J'),
  ('at',     'Austria',          'J'),
  ('jo',     'Jordania',         'J'),
  -- Grupo K
  ('pt',     'Portugal',         'K'),
  ('cd',     'RD Congo',         'K'),
  ('uz',     'Uzbekistán',       'K'),
  ('co',     'Colombia',         'K'),
  -- Grupo L
  ('gb-eng', 'Inglaterra',       'L'),
  ('hr',     'Croacia',          'L'),
  ('gh',     'Ghana',            'L'),
  ('pa',     'Panamá',           'L')
ON CONFLICT (code) DO UPDATE
  SET name     = EXCLUDED.name,
      group_id = EXCLUDED.group_id;

-- ─── 4. PARTIDOS ─────────────────────────────────────────────────
-- NO se seedean partidos a mano: el fixture real (104 partidos, con fd_id,
-- group_id y horarios oficiales) lo crea y mantiene el sync de
-- football-data.org — cron /api/cron/sync-results (Bearer CRON_SECRET) o el
-- botón "Sincronizar fixture" en /app/admin/partidos. Un pairing inventado
-- genera filas fantasma que el sync no puede linkear (se limpian con
-- scripts/align-fixture.mjs).

-- ─── 5. BRAND SEED ───────────────────────────────────────────────
-- La migración 20260607 ya creó la brand 'o2'.
-- Actualizamos el logo_url para que apunte al logo del proyecto nuevo.
-- Si querés registrar el primer usuario como admin de plataforma,
-- registrate en /o2/register y luego ejecutá el bloque de abajo.

UPDATE brand
   SET name          = 'O2',
       short_name    = 'O2',
       sub_brand     = 'Wellness Club',
       hashtag_suffix = 'O2',
       logo_url      = '/logo.png',
       status        = 'active'
WHERE slug = 'o2';

-- ─── 6. PROMOVER SUPER ADMIN ─────────────────────────────────────
-- Ejecutar DESPUÉS de que el primer usuario se registre.
-- Reemplazá el email por el tuyo.

-- UPDATE "user"
--    SET role = 'super_admin'
--  WHERE email = 'nahuel.alexis.carrera@gmail.com';

-- ─── 7. STORAGE — bucket brand-logos ─────────────────────────────
-- La migración 20260608_super_admin.sql crea el bucket vía SQL storage.
-- Si no existe, crearlo desde Supabase Dashboard → Storage → New bucket:
--   Nombre: brand-logos  |  Public: SÍ  |  Max file size: 2 MB
--   Allowed MIME types: image/png, image/jpeg, image/webp
