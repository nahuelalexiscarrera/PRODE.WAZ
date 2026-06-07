-- 20260614000000_security_hardening.sql
--
-- Cierra DOS vulnerabilidades CRÍTICAS encontradas en pentest autorizado
-- (scripts/redteam-pentest.mjs):
--
--   1. ESCALADA DE PRIVILEGIOS / RANKING TRUCHADO / SALTO DE MARCA.
--      Un socio (rol PG `authenticated`) podía hacer UPDATE sobre su propia fila
--      `user` y cambiar role/brand_id/total_points/position/is_admin. La policy
--      RLS de UPDATE ("Cada user actualiza su propio perfil") usa USING
--      (auth.uid()=id) SIN restricción de columnas — y Postgres RLS no limita
--      columnas. Resultado probado: role='super_admin' (toma de control total),
--      total_points=999999 (#1 instantáneo), brand_id→otra marca.
--
--   2. FUNCIONES DE SCORING EXPUESTAS POR RPC.
--      fn_add_points / fn_settle_match / fn_resettle_match / fn_recalculate_*
--      / fn_calculate_points tenían EXECUTE concedido a PUBLIC (default de
--      Postgres) → un socio podía sumarse puntos o disparar el settle de
--      cualquier partido vía supabase.rpc(...).
--
-- La app YA usa service_role (admin client) para TODOS los writes privilegiados
-- (processAchievements, los 4 crons, las acciones de super-admin, ensure-user),
-- así que estos locks NO rompen ningún flujo legítimo: completan el diseño que
-- el código ya asumía (ver comentario en lib/achievements/actions.ts:67).

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. Guard de columnas privilegiadas en `user`                    │
-- └─────────────────────────────────────────────────────────────────┘
-- Trigger SECURITY INVOKER: corre con el rol del que hace el UPDATE.
-- Solo restringe a roles de usuario final (authenticated/anon). service_role
-- (crons, admin client) y postgres (migraciones, SQL editor) pasan sin tocar.

CREATE OR REPLACE FUNCTION public.trg_guard_user_privileged_cols()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role         IS DISTINCT FROM OLD.role
    OR NEW.brand_id     IS DISTINCT FROM OLD.brand_id
    OR NEW.total_points IS DISTINCT FROM OLD.total_points
    OR NEW.position     IS DISTINCT FROM OLD.position
    OR NEW.is_admin     IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION
        'No autorizado: role/brand_id/total_points/position/is_admin no se pueden modificar desde una sesión de usuario.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_guard_privileged ON "user";
CREATE TRIGGER trg_user_guard_privileged
  BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_user_privileged_cols();

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. Revocar EXECUTE de las funciones sensibles a usuarios finales │
-- └─────────────────────────────────────────────────────────────────┘
-- Quita el grant default a PUBLIC y a anon/authenticated; deja EXECUTE solo
-- para service_role (los crons y el admin client). El owner (postgres) conserva
-- acceso siempre. El loop cubre todos los overloads y tolera funciones ausentes.
-- Helpers de RLS (current_brand_id, is_super_admin, is_admin, is_brand_admin) y
-- funciones de lectura (fn_ranking_for_brand, fn_user_summary_for_brand) NO se
-- tocan — authenticated las necesita para que las policies se evalúen.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'fn_add_points',
        'fn_settle_match',
        'fn_resettle_match',
        'fn_recalculate_positions',
        'fn_recalculate_positions_all',
        'fn_calculate_points'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
