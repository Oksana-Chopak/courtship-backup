-- ═══════════════════════════════════════════════════════════════════
-- PRUNE LOGS (2026-11-01) — paste in Lovable → More → Cloud → SQL editor. Idempotent.
--   The 2026-10-25 size audit: the database was 4.5 GB, of which 4.3 GB was
--   pg_cron's own run log (cron.job_run_details) — one row per run of every
--   scheduled job since June (escalate-open-games alone runs every 5 minutes),
--   never pruned. Nothing reads it except Admin → Health and the watchdog, and
--   they only look at the last two days.
--   1. prune it now (keep 3 days)
--   2. a nightly job keeps it that way
--   3. VERIFY shows the job and what is left
--   The DELETE frees the space for Postgres to REUSE; the disk itself only
--   shrinks after the one-line TRUNCATE at the very end (run it on its own —
--   it empties the log in a second; the watchdog tolerates an empty log).
-- ═══════════════════════════════════════════════════════════════════

-- ▌1. Prune now (keep 3 days — the watchdog reads 48 h)
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days';
-- pg_net already expires its response log after 6 h; this only matters if that
-- default was ever raised. Harmless when the table is absent.
DO $$ BEGIN
  DELETE FROM net._http_response WHERE created < now() - interval '2 days';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ▌2. Every night at 04:17 UTC
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'courtship-prune-logs';
    PERFORM cron.schedule('courtship-prune-logs', '17 4 * * *',
      $cron$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'; $cron$);
  END IF;
END $$;

-- ▌VERIFY — nightly prune scheduled, and what the log holds now
SELECT
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'courtship-prune-logs')  AS nightly_prune,
  (SELECT count(*) FROM cron.job_run_details)                             AS run_log_rows_left,
  pg_size_pretty(pg_total_relation_size('cron.job_run_details'))          AS run_log_size_on_disk;

-- ▌OPTIONAL, afterwards, ON ITS OWN (select just this one line and Run): gives
-- the ~4 GB back to the disk at once. It drops the whole run log, which is
-- diagnostics only (the DELETE above cannot shrink the file; VACUUM FULL could,
-- but needs 4 GB of free disk and locks the table for minutes — this does not).
-- TRUNCATE cron.job_run_details;
