-- 20260613_theme_text_inverse.sql
--
-- Los 8 temas fitness de 20260612 no tenían el token `text-inverse`, que
-- controla el color del texto sobre fondos primarios (botones, badges, etc.).
-- Sin él, todos heredan el default negro (#0b0b0d) del CSS — lo que hace el
-- texto invisible en temas de primary oscuro como style-waz (púrpura) o
-- pro-impact (rojo).
--
-- Regla aplicada (WCAG AA mínimo, contrast ratio ≥ 4.5:1 sobre primary):
--   • Primary < 30% luminancia relativa → text-inverse claro (#f5f7fa)
--   • Primary ≥ 30% luminancia relativa → text-inverse oscuro (#080808)
--
-- También limpiamos el token `accent-lime-soft` que faltaba en algunos.
--
-- Idempotente: usa jsonb_set / || para mergear sin perder tokens existentes.

UPDATE theme
SET tokens = tokens || '{
  "text-inverse": "#080808",
  "accent-lime-soft": "rgba(255,255,255,0.18)"
}'::jsonb
WHERE slug = 'hiit-zone';
-- #ccff00 (yellow-green) → 60% luminancia → texto oscuro OK

UPDATE theme
SET tokens = tokens || '{
  "text-inverse": "#f5f7fa",
  "accent-lime-soft": "rgba(42,56,67,0.18)"
}'::jsonb
WHERE slug = 'power-lift';
-- #ff096c (hot pink) → 20% luminancia → texto claro requerido

UPDATE theme
SET tokens = tokens || '{
  "text-inverse": "#080808",
  "accent-lime-soft": "rgba(254,232,208,0.18)"
}'::jsonb
WHERE slug = 'endurance-core';
-- #fc6f20 (orange) → 40% luminancia → texto oscuro OK

UPDATE theme
SET tokens = tokens || '{
  "text-inverse": "#080808",
  "accent-lime-soft": "rgba(0,128,128,0.18)"
}'::jsonb
WHERE slug = 'recovery-flow';
-- #00a896 (teal) → 38% luminancia → texto oscuro OK (límite, pero readable)

UPDATE theme
SET tokens = tokens || '{
  "text-inverse": "#080808",
  "accent-lime-soft": "rgba(230,255,0,0.18)"
}'::jsonb
WHERE slug = 'padel-court';
-- #00d2ff (cyan) → 55% luminancia → texto oscuro OK

UPDATE theme
SET tokens = tokens || '{
  "text-inverse": "#f5f7fa",
  "accent-lime-soft": "rgba(255,255,255,0.18)"
}'::jsonb
WHERE slug = 'pro-impact';
-- #ff1744 (vivid red) → 18% luminancia → texto claro requerido

UPDATE theme
SET tokens = tokens || '{
  "text-inverse": "#080808",
  "accent-lime-soft": "rgba(26,26,26,0.18)"
}'::jsonb
WHERE slug = 'crossfit-yellow';
-- #ffd600 (yellow) → 70% luminancia → texto oscuro OK

UPDATE theme
SET tokens = tokens || '{
  "text-inverse": "#f5f7fa",
  "accent-lime-soft": "rgba(255,255,255,0.18)"
}'::jsonb
WHERE slug = 'style-waz';
-- #5b2c6f (dark purple) → 6% luminancia → texto claro CRÍTICO (era invisible)
