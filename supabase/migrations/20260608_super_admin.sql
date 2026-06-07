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
