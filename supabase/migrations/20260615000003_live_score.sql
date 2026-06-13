-- 20260615000003_live_score.sql
--
-- Marcador EN VIVO en el Home. Hoy el sync solo setea match.status='live' pero
-- NO persiste el marcador parcial (match_result se escribe recién al finalizar).
-- Agregamos columnas livianas en `match` para guardar el marcador en curso.
--
-- SEGURO: el único trigger de scoring (trg_match_status_change → fn_settle_match)
-- dispara SOLO cuando status pasa a 'finished'. Escribir estas columnas NO toca
-- status ni match_result → no puntúa nada con un marcador parcial.

ALTER TABLE match ADD COLUMN IF NOT EXISTS live_home_score SMALLINT
  CHECK (live_home_score IS NULL OR (live_home_score >= 0 AND live_home_score <= 30));
ALTER TABLE match ADD COLUMN IF NOT EXISTS live_away_score SMALLINT
  CHECK (live_away_score IS NULL OR (live_away_score >= 0 AND live_away_score <= 30));
ALTER TABLE match ADD COLUMN IF NOT EXISTS live_updated_at TIMESTAMPTZ;
