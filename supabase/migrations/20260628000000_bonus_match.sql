-- ─── Bonus match: puntos dobles para compensación 16avos ─────────────────────
-- Agrega is_bonus_match a match + trigger que duplica points_earned al finalizar.

-- 1. Columna
ALTER TABLE match ADD COLUMN IF NOT EXISTS is_bonus_match BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Función trigger
CREATE OR REPLACE FUNCTION fn_apply_bonus_match()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'finished'
     AND NEW.is_bonus_match = TRUE
     AND OLD.status IS DISTINCT FROM 'finished'
  THEN
    -- Duplicar points_earned (solo predicciones que sumaron puntos)
    UPDATE prediction
    SET points_earned = points_earned * 2
    WHERE match_id = NEW.id
      AND points_earned > 0;

    -- Recalcular ranking de Energym
    PERFORM fn_recalculate_positions(
      (SELECT id FROM brand WHERE slug = 'energym' LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger
DROP TRIGGER IF EXISTS trg_bonus_match ON match;
CREATE TRIGGER trg_bonus_match
AFTER UPDATE OF status ON match
FOR EACH ROW
EXECUTE FUNCTION fn_apply_bonus_match();
