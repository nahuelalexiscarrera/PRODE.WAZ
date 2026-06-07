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
    "knockout": ["round-of-16", "quarter", "semi", "final"]
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
-- Nota: códigos coinciden con los SVG en /public/flags/<code>.svg
-- Algunos equipos (it, dk, pl, ng, cl, etc.) no tienen flag SVG aún —
-- el componente Flag mostrará un fallback transparente.

INSERT INTO team (code, name, group_id) VALUES
  -- Grupo A
  ('ar', 'Argentina',        'A'),
  ('mx', 'México',           'A'),
  ('jp', 'Japón',            'A'),
  ('qa', 'Qatar',            'A'),
  -- Grupo B
  ('us', 'Estados Unidos',   'B'),
  ('br', 'Brasil',           'B'),
  ('kr', 'Corea del Sur',    'B'),
  ('ec', 'Ecuador',          'B'),
  -- Grupo C
  ('ca', 'Canadá',           'C'),
  ('fr', 'Francia',          'C'),
  ('ng', 'Nigeria',          'C'),
  ('uy', 'Uruguay',          'C'),
  -- Grupo D
  ('de', 'Alemania',         'D'),
  ('co', 'Colombia',         'D'),
  ('sa', 'Arabia Saudita',   'D'),
  ('se', 'Suecia',           'D'),
  -- Grupo E
  ('es', 'España',           'E'),
  ('ma', 'Marruecos',        'E'),
  ('au', 'Australia',        'E'),
  ('cr', 'Costa Rica',       'E'),
  -- Grupo F
  ('pt', 'Portugal',         'F'),
  ('ir', 'Irán',             'F'),
  ('pa', 'Panamá',           'F'),
  ('be', 'Bélgica',          'F'),
  -- Grupo G
  ('nl', 'Países Bajos',     'G'),
  ('sn', 'Senegal',          'G'),
  ('no', 'Noruega',          'G'),
  ('ws', 'Gales',            'G'),
  -- Grupo H
  ('it', 'Italia',           'H'),
  ('tn', 'Túnez',            'H'),
  ('cl', 'Chile',            'H'),
  ('jm', 'Jamaica',          'H'),
  -- Grupo I
  ('gb', 'Inglaterra',       'I'),
  ('ck', 'Rep. Checa',       'I'),
  ('py', 'Paraguay',         'I'),
  ('tr', 'Turquía',          'I'),
  -- Grupo J
  ('dk', 'Dinamarca',        'J'),
  ('om', 'Omán',             'J'),
  ('ci', 'Costa de Marfil',  'J'),
  ('hr', 'Croacia',          'J'),
  -- Grupo K
  ('pl', 'Polonia',          'K'),
  ('ke', 'Kenia',            'K'),
  ('ve', 'Venezuela',        'K'),
  ('nz', 'Nueva Zelanda',    'K'),
  -- Grupo L
  ('ch', 'Suiza',            'L'),
  ('eg', 'Egipto',           'L'),
  ('pe', 'Perú',             'L'),
  ('uz', 'Uzbekistán',       'L')
ON CONFLICT (code) DO UPDATE
  SET name     = EXCLUDED.name,
      group_id = EXCLUDED.group_id;

-- ─── 4. PARTIDOS — FASE DE GRUPOS ────────────────────────────────
-- Horarios en UTC (las kickoffISO del schedule.json están en GMT-3, se suman 3h).
-- Solo Grupo A está completo; el resto son ejemplos hasta que se complete el fixture.
-- El cron sync-results auto-completa el calendario de la API de football-data.org.

DO $$
DECLARE v_tid UUID;
BEGIN
  SELECT id INTO v_tid FROM tournament WHERE slug = 'mundial-2026';
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'Tournament mundial-2026 no encontrado';
  END IF;

  -- Grupo A (completo — 6 partidos)
  INSERT INTO match (tournament_id, phase, group_id, home_code, away_code, kickoff_at, venue_city, status) VALUES
    (v_tid, 'groups', 'A', 'mx', 'ar', '2026-06-11T16:00:00Z', 'Ciudad de México', 'scheduled'),
    (v_tid, 'groups', 'A', 'jp', 'qa', '2026-06-11T19:00:00Z', 'Guadalajara',      'scheduled'),
    (v_tid, 'groups', 'A', 'ar', 'jp', '2026-06-17T19:00:00Z', 'Monterrey',        'scheduled'),
    (v_tid, 'groups', 'A', 'qa', 'mx', '2026-06-17T22:00:00Z', 'Ciudad de México', 'scheduled'),
    (v_tid, 'groups', 'A', 'ar', 'qa', '2026-06-23T19:00:00Z', 'Guadalajara',      'scheduled'),
    (v_tid, 'groups', 'A', 'mx', 'jp', '2026-06-23T19:00:00Z', 'Monterrey',        'scheduled'),

  -- Grupo B (ejemplo — completar con fixture real)
    (v_tid, 'groups', 'B', 'us', 'br', '2026-06-12T19:00:00Z', 'Los Ángeles',      'scheduled'),
    (v_tid, 'groups', 'B', 'kr', 'ec', '2026-06-12T22:00:00Z', 'Dallas',           'scheduled'),

  -- Grupo C (ejemplo)
    (v_tid, 'groups', 'C', 'ca', 'fr', '2026-06-13T19:00:00Z', 'Toronto',          'scheduled'),
    (v_tid, 'groups', 'C', 'ng', 'uy', '2026-06-13T22:00:00Z', 'Vancouver',        'scheduled'),

  -- Grupo D
    (v_tid, 'groups', 'D', 'de', 'sa', '2026-06-14T16:00:00Z', 'Miami',            'scheduled'),
    (v_tid, 'groups', 'D', 'co', 'se', '2026-06-14T19:00:00Z', 'Atlanta',          'scheduled'),

  -- Grupo E
    (v_tid, 'groups', 'E', 'es', 'cr', '2026-06-15T16:00:00Z', 'Kansas City',      'scheduled'),
    (v_tid, 'groups', 'E', 'ma', 'au', '2026-06-15T19:00:00Z', 'Seattle',          'scheduled'),

  -- Grupo F
    (v_tid, 'groups', 'F', 'pt', 'pa', '2026-06-16T16:00:00Z', 'Boston',           'scheduled'),
    (v_tid, 'groups', 'F', 'ir', 'be', '2026-06-16T19:00:00Z', 'Filadelfia',       'scheduled'),

  -- Grupo G
    (v_tid, 'groups', 'G', 'nl', 'ws', '2026-06-17T16:00:00Z', 'San Francisco',    'scheduled'),
    (v_tid, 'groups', 'G', 'sn', 'no', '2026-06-17T16:00:00Z', 'Nueva York',       'scheduled'),

  -- Grupo H
    (v_tid, 'groups', 'H', 'it', 'jm', '2026-06-18T16:00:00Z', 'Miami',            'scheduled'),
    (v_tid, 'groups', 'H', 'tn', 'cl', '2026-06-18T19:00:00Z', 'Atlanta',          'scheduled'),

  -- Grupo I
    (v_tid, 'groups', 'I', 'gb', 'tr', '2026-06-19T16:00:00Z', 'Seattle',          'scheduled'),
    (v_tid, 'groups', 'I', 'ck', 'py', '2026-06-19T19:00:00Z', 'San Francisco',    'scheduled'),

  -- Grupo J
    (v_tid, 'groups', 'J', 'dk', 'hr', '2026-06-20T16:00:00Z', 'Kansas City',      'scheduled'),
    (v_tid, 'groups', 'J', 'om', 'ci', '2026-06-20T19:00:00Z', 'Boston',           'scheduled'),

  -- Grupo K
    (v_tid, 'groups', 'K', 'pl', 'nz', '2026-06-21T16:00:00Z', 'Dallas',           'scheduled'),
    (v_tid, 'groups', 'K', 've', 'ke', '2026-06-21T19:00:00Z', 'Los Ángeles',      'scheduled'),

  -- Grupo L
    (v_tid, 'groups', 'L', 'ch', 'uz', '2026-06-22T16:00:00Z', 'Dallas',           'scheduled'),
    (v_tid, 'groups', 'L', 'eg', 'pe', '2026-06-22T19:00:00Z', 'Miami',            'scheduled');

END $$;

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
