-- ─────────────────────────────────────────────────────────────────────
-- PRODE.WAZ — Cron del sync de fixture (football-data.org) cada 5 min.
--
-- Vercel Hobby no soporta crons de alta frecuencia, así que el scheduler vive
-- en Postgres: pg_cron dispara un POST (pg_net) al endpoint del sync, que
-- corre runFixtureSync() — partidos nuevos, horarios, resultados, puntajes.
--
-- PASO OPERATIVO (una sola vez, NO se commitea el secret):
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- El job lee el Bearer desde Vault. Si el secret no existe todavía, el job
-- corre igual pero el endpoint responde 401 hasta que se cargue.
-- ─────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- cron.schedule con el mismo nombre re-agenda (idempotente).
SELECT cron.schedule(
  'sync-results-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://prode-waz.vercel.app/api/cron/sync-results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        coalesce(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1),
          ''
        )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
