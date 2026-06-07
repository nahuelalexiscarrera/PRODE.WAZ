-- ════════════════════════════════════════════════════════════════════
-- PRODE.WAZ — Fix de grants (error 42501 insufficient_privilege)
-- Correr en el SQL Editor de Supabase SOBRE la base ya construida.
-- NO borra nada: solo restaura los permisos que Supabase pierde cuando se
-- recrea el schema public. Después de esto la app (rol anon/authenticated)
-- puede leer/escribir las tablas; la RLS sigue filtrando por fila.
-- ════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;

-- Permisos sobre TODO lo ya creado.
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Permisos por defecto para lo que se cree a futuro.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
