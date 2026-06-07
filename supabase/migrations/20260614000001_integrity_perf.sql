-- 20260614000001_integrity_perf.sql
--
-- (C4) Cierra la edición de la PREDICCIÓN ESPECIAL una vez que arrancó el torneo.
--      Bug: la columna special_prediction.locked_at NUNCA se setea, y la RLS de
--      UPDATE solo chequea `locked_at IS NULL` (siempre true) → un usuario podía
--      editar campeón/goleador vía REST directo después de ver los primeros
--      resultados. El cierre real estaba solo en el cliente (botón disabled).
--      Fix: trigger que, para roles de usuario final, rechaza INSERT/UPDATE si el
--      primer partido del torneo ya pasó. service_role/postgres pasan.
--
-- (C11) Índice para que getMyRankEntry() (2× COUNT por socio fuera del top-100)
--       no haga seq scans a 800+ socios.

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ C4 · Lock de special_prediction al arrancar el torneo           │
-- └─────────────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.trg_guard_special_prediction_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_first TIMESTAMPTZ;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    SELECT MIN(kickoff_at) INTO v_first FROM match WHERE tournament_id = NEW.tournament_id;
    IF v_first IS NOT NULL AND NOW() >= v_first THEN
      RAISE EXCEPTION
        'La predicción especial ya cerró: el torneo arrancó (primer partido %).', v_first
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_special_prediction_lock ON special_prediction;
CREATE TRIGGER trg_special_prediction_lock
  BEFORE INSERT OR UPDATE ON special_prediction
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_special_prediction_lock();

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ C11 · Índice para el ranking per-marca (getMyRankEntry)         │
-- └─────────────────────────────────────────────────────────────────┘
CREATE INDEX IF NOT EXISTS idx_user_brand_points_joined
  ON "user" (brand_id, total_points DESC, joined_at)
  WHERE deleted_at IS NULL;
