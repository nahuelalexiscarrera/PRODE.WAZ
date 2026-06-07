-- ════════════════════════════════════════════════════════════════════
-- PRODE.WAZ — Fix de usuario sin fila en public.user
--
-- Situación: el usuario confirmó email mientras los grants estaban
-- rotos (error 42501). ensureUserRow() falló silenciosamente → el user
-- existe en auth.users pero NO en public.user → RLS bloquea todo →
-- perfil rebota a home.
--
-- Correr en el SQL Editor de Supabase (corre como postgres, sin RLS).
-- ════════════════════════════════════════════════════════════════════

-- 1. Crear fila en public.user para cualquier auth user confirmado que la
--    tenga faltante. Brand = WAZ (default de la plataforma).
INSERT INTO public."user" (id, email, name, initials, brand_id, referral_code)
SELECT
  au.id,
  au.email,
  COALESCE(
    NULLIF(TRIM(au.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(au.email, '@', 1),
    'Socio'
  ) AS name,
  UPPER(LEFT(COALESCE(
    NULLIF(TRIM(au.raw_user_meta_data->>'name'), ''),
    au.email,
    'S'
  ), 2)) AS initials,
  (SELECT id FROM public.brand WHERE slug = 'waz') AS brand_id,
  UPPER(SUBSTR(MD5(RANDOM()::TEXT || au.id::TEXT), 1, 6)) AS referral_code
FROM auth.users au
WHERE au.confirmed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public."user" pu WHERE pu.id = au.id)
ON CONFLICT (id) DO NOTHING;

-- 2. Fix: si algún user existente tiene brand_id NULL, asignarle WAZ.
UPDATE public."user"
SET brand_id = (SELECT id FROM public.brand WHERE slug = 'waz')
WHERE brand_id IS NULL;

-- 3. Elevar a super_admin (reemplazá el email por el tuyo si es distinto).
UPDATE public."user"
SET role = 'super_admin'
WHERE email = 'nahuel.alexis.carrera@gmail.com';

-- Verificación: debería devolver tu fila con role = 'super_admin'.
SELECT id, email, name, role, brand_id FROM public."user"
WHERE email = 'nahuel.alexis.carrera@gmail.com';
