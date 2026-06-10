-- ─────────────────────────────────────────────────────────────────────
-- PRODE.WAZ — Cierre de predicciones 5 MINUTOS antes del kickoff.
--
-- Antes: 1 hora. Pedido del cliente: 5 minutos. Espejo TS de la regla:
-- lib/predictions/constants.ts (PREDICTION_LOCKOUT_MINUTES).
--
-- Además tapa un hueco: la policy de INSERT no tenía chequeo horario, así que
-- una PRIMERA predicción podía crearse vía REST directo después del kickoff
-- (la action lo bloqueaba, pero la RLS no). Ahora INSERT y UPDATE exigen
-- partido 'scheduled' y a más de 5 minutos del kickoff.
-- ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "User inserta sus predicciones (de su marca)" ON prediction;
CREATE POLICY "User inserta sus predicciones (de su marca)"
  ON prediction FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND brand_id = public.current_brand_id()
    AND EXISTS (
      SELECT 1 FROM match
      WHERE id = match_id
        AND status = 'scheduled'
        AND (kickoff_at - INTERVAL '5 minutes') > NOW()
    )
  );

DROP POLICY IF EXISTS "User actualiza sus predicciones (si no cerró el partido)" ON prediction;
CREATE POLICY "User actualiza sus predicciones (si no cerró el partido)"
  ON prediction FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM match
      WHERE id = match_id
        AND status = 'scheduled'
        AND (kickoff_at - INTERVAL '5 minutes') > NOW()
    )
  )
  WITH CHECK (auth.uid() = user_id AND brand_id = public.current_brand_id());
