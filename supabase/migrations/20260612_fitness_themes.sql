-- 20260612_fitness_themes.sql
-- Nuevos temas visuales enfocados al mundo del fitness y alto rendimiento.
-- Reemplaza los temas genéricos (corporate, gaming, premium) y establece la
-- nueva paleta "Fit Green" como base para el alto rendimiento.

-- 1. Insertamos los nuevos temas fitness
INSERT INTO theme (slug, name, tokens) VALUES
  ('hiit-zone', 'HIIT Zone', '{
    "brand-primary": "#ccff00",
    "brand-primary-hover": "#b8e600",
    "brand-primary-pressed": "#a3cc00",
    "brand-primary-soft": "#dbff33",
    "brand-primary-glow": "rgba(204,255,0,0.35)",
    "brand-primary-bg": "rgba(204,255,0,0.12)",
    "accent-lime": "#ffffff",
    "accent-lime-soft": "rgba(255,255,255,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(204,255,0,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(255,255,255,0.35)"
  }'::jsonb),
  ('power-lift', 'Powerhouse', '{
    "brand-primary": "#ff096c",
    "brand-primary-hover": "#e60861",
    "brand-primary-pressed": "#cc0756",
    "brand-primary-soft": "#ff3a89",
    "brand-primary-glow": "rgba(255,9,108,0.35)",
    "brand-primary-bg": "rgba(255,9,108,0.12)",
    "accent-lime": "#2a3843",
    "accent-lime-soft": "rgba(42,56,67,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(255,9,108,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(42,56,67,0.35)"
  }'::jsonb),
  ('endurance-core', 'Endurance Core', '{
    "brand-primary": "#fc6f20",
    "brand-primary-hover": "#e3631c",
    "brand-primary-pressed": "#c95819",
    "brand-primary-soft": "#fd8b4c",
    "brand-primary-glow": "rgba(252,111,32,0.35)",
    "brand-primary-bg": "rgba(252,111,32,0.12)",
    "accent-lime": "#fee8d0",
    "accent-lime-soft": "rgba(254,232,208,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(252,111,32,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(254,232,208,0.35)"
  }'::jsonb),
  ('recovery-flow', 'Recovery Flow', '{
    "brand-primary": "#00a896",
    "brand-primary-hover": "#009787",
    "brand-primary-pressed": "#008678",
    "brand-primary-soft": "#33b9aab3",
    "brand-primary-glow": "rgba(0,168,150,0.35)",
    "brand-primary-bg": "rgba(0,168,150,0.12)",
    "accent-lime": "#008080",
    "accent-lime-soft": "rgba(0,128,128,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(0,168,150,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(0,128,128,0.35)"
  }'::jsonb),
  ('padel-court', 'Padel Court', '{
    "brand-primary": "#00d2ff",
    "brand-primary-hover": "#00b8e6",
    "brand-primary-pressed": "#009ecc",
    "brand-primary-soft": "#33dbff",
    "brand-primary-glow": "rgba(0,210,255,0.35)",
    "brand-primary-bg": "rgba(0,210,255,0.12)",
    "accent-lime": "#e6ff00",
    "accent-lime-soft": "rgba(230,255,0,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(0,210,255,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(230,255,0,0.35)"
  }'::jsonb),
  ('pro-impact', 'Pro Impact', '{
    "brand-primary": "#ff1744",
    "brand-primary-hover": "#e6143d",
    "brand-primary-pressed": "#cc1236",
    "brand-primary-soft": "#ff4569",
    "brand-primary-glow": "rgba(255,23,68,0.35)",
    "brand-primary-bg": "rgba(255,23,68,0.12)",
    "accent-lime": "#ffffff",
    "accent-lime-soft": "rgba(255,255,255,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(255,23,68,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(255,255,255,0.35)"
  }'::jsonb),
  ('crossfit-yellow', 'Crossfit / Sport', '{
    "brand-primary": "#ffd600",
    "brand-primary-hover": "#e6c000",
    "brand-primary-pressed": "#ccab00",
    "brand-primary-soft": "#ffde33",
    "brand-primary-glow": "rgba(255,214,0,0.35)",
    "brand-primary-bg": "rgba(255,214,0,0.12)",
    "accent-lime": "#1a1a1a",
    "accent-lime-soft": "rgba(26,26,26,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(255,214,0,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(26,26,26,0.35)"
  }'::jsonb),
  ('style-waz', 'Style Waz', '{
    "brand-primary": "#5b2c6f",
    "brand-primary-hover": "#4a245a",
    "brand-primary-pressed": "#3a1c46",
    "brand-primary-soft": "#7c4a93",
    "brand-primary-glow": "rgba(91,44,111,0.35)",
    "brand-primary-bg": "rgba(91,44,111,0.12)",
    "accent-lime": "#ffffff",
    "accent-lime-soft": "rgba(255,255,255,0.18)",
    "shadow-glow-primary": "0 0 24px rgba(91,44,111,0.35)",
    "shadow-glow-accent": "0 0 24px rgba(255,255,255,0.35)"
  }'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  tokens = EXCLUDED.tokens;

-- 2. Migramos las marcas existentes que usaban 'o2-fitness' al nuevo 'hiit-zone'
UPDATE brand
   SET theme_slug = 'hiit-zone'
 WHERE theme_slug = 'o2-fitness';

-- 3. Opcional: limpiar los temas viejos si ya no se usan
DELETE FROM theme
 WHERE slug IN ('o2-fitness', 'corporate', 'gaming', 'premium')
   AND NOT EXISTS (SELECT 1 FROM brand WHERE theme_slug = theme.slug);
