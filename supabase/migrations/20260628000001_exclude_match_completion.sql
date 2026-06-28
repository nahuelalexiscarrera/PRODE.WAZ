-- ─── Excluir partidos de la completitud del torneo (logro C03 "Todoterreno") ───
-- Cuando un partido queda inalcanzable por un incidente de plataforma (los socios
-- no pudieron predecirlo por un bug), se lo excluye del cálculo de completitud para
-- que "completar el resto del prode" siga desbloqueando C03 automáticamente.
--
-- Caso 28/06: Sudáfrica vs Canadá (za-ca, round-of-32) cerró mientras la fase estaba
-- mal bloqueada / con intermitencia de acceso. Se lo excluye para todos.

ALTER TABLE match ADD COLUMN IF NOT EXISTS excluded_from_completion BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE match
SET excluded_from_completion = TRUE
WHERE phase = 'round-of-32'
  AND ((home_code = 'za' AND away_code = 'ca')
    OR (home_code = 'ca' AND away_code = 'za'));
