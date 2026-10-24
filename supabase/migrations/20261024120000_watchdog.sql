-- ═══════════════════════════════════════════════════════════════════
-- WATCHDOG (2026-10-24) — paste in Lovable → More → Cloud → SQL editor. Idempotent.
--   "A screen broke → Oksana knows in Telegram within minutes."
--   1. watchdog_state       — what the watchdog last saw (service role only)
--   2. watchdog_facts()     — server facts for one run: pg_net failures, new
--                             player errors since a watermark, cron, lifecycle,
--                             email failures, counts, the newest event/game
--   3. trg_watchdog_client_error — a player error is forwarded the SECOND it
--                             lands (AFTER INSERT on client_errors → watchdog)
--   4. admin_watchdog_status() — the Admin → Health row (last run, Telegram,
--                             pairing code) + the pairing code itself
--   5. pg_cron 'courtship-watchdog' every 5 minutes → the function
-- Needs Package 3 (public._notify_headers) and Package 3.3 (client_errors).
-- ═══════════════════════════════════════════════════════════════════

-- ▌1. State
CREATE TABLE IF NOT EXISTS public.watchdog_state (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.watchdog_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.watchdog_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.watchdog_state TO service_role;

-- ▌2. Facts (service role only — the function reads them with the service key)
CREATE OR REPLACE FUNCTION public.watchdog_facts(_since timestamptz DEFAULT now() - interval '10 minutes')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _net jsonb := '{}'::jsonb; _cron jsonb := '[]'::jsonb; _cron_runs jsonb := '[]'::jsonb;
  _lc_last timestamptz; _lc_on text; _errs jsonb := '[]'::jsonb; _mail jsonb := '{}'::jsonb;
  _ev jsonb; _g jsonb;
BEGIN
  -- the DB's own calls to the edge functions, last hour (404 = not deployed, 401 = refused, 5xx = crashed)
  BEGIN
    SELECT jsonb_build_object(
      'total',  count(*),
      'failed', count(*) FILTER (WHERE coalesce(status_code, 0) >= 400 OR timed_out OR error_msg IS NOT NULL),
      'samples', coalesce((SELECT jsonb_agg(jsonb_build_object('status', status_code, 'error', error_msg, 'body', left(content, 160), 'at', created) ORDER BY created DESC)
                           FROM (SELECT * FROM net._http_response
                                  WHERE created > now() - interval '1 hour'
                                    AND (coalesce(status_code, 0) >= 400 OR timed_out OR error_msg IS NOT NULL)
                                  ORDER BY created DESC LIMIT 5) f), '[]'::jsonb))
      INTO _net FROM net._http_response WHERE created > now() - interval '1 hour';
  EXCEPTION WHEN OTHERS THEN _net := jsonb_build_object('unavailable', SQLERRM); END;
  -- cron: the jobs and how their last run ended
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active)), '[]'::jsonb) INTO _cron FROM cron.job;
  EXCEPTION WHEN OTHERS THEN _cron := '[]'::jsonb; END;
  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO _cron_runs FROM (
      SELECT DISTINCT ON (d.jobid) j.jobname AS name, d.status, left(d.return_message, 160) AS message, d.end_time
        FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
       WHERE d.end_time > now() - interval '48 hours'
       ORDER BY d.jobid, d.end_time DESC) r;
  EXCEPTION WHEN OTHERS THEN _cron_runs := '[]'::jsonb; END;
  -- lifecycle emails
  BEGIN SELECT max(sent_at) INTO _lc_last FROM public.lifecycle_sends; EXCEPTION WHEN OTHERS THEN _lc_last := NULL; END;
  BEGIN SELECT value INTO _lc_on FROM public.app_config WHERE key = 'lifecycle_enabled'; EXCEPTION WHEN OTHERS THEN _lc_on := NULL; END;
  -- what players hit since the watermark (oldest first, capped)
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'kind', e.kind, 'message', e.message, 'where', e.where_,
                                                 'details', left(e.details, 300), 'signed_in', e.user_id IS NOT NULL) ORDER BY e.at), '[]'::jsonb)
      INTO _errs
      FROM (SELECT * FROM public.client_errors WHERE at > _since ORDER BY at LIMIT 50) e;
  EXCEPTION WHEN OTHERS THEN _errs := '[]'::jsonb; END;
  -- email: what went out and what failed, last hour
  BEGIN
    SELECT jsonb_build_object(
      'sent',   count(*) FILTER (WHERE status = 'sent'),
      'failed', count(*) FILTER (WHERE status IN ('failed', 'bounced', 'dlq')),
      'samples', coalesce((SELECT jsonb_agg(jsonb_build_object('template', template_name, 'status', status, 'at', created_at, 'error', left(coalesce(error_message, ''), 160)) ORDER BY created_at DESC)
                           FROM (SELECT * FROM public.email_send_log
                                  WHERE created_at > now() - interval '1 hour' AND status IN ('failed', 'bounced', 'dlq')
                                  ORDER BY created_at DESC LIMIT 3) s), '[]'::jsonb))
      INTO _mail FROM public.email_send_log WHERE created_at > now() - interval '1 hour';
  EXCEPTION WHEN OTHERS THEN _mail := jsonb_build_object('unavailable', SQLERRM); END;
  -- the newest public event and game, so the share pages can be checked with real ids
  BEGIN
    SELECT jsonb_build_object('id', id, 'title', title) INTO _ev FROM public.event_requests
     WHERE status = 'approved' AND starts_at > now() ORDER BY starts_at LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _ev := NULL; END;
  BEGIN
    SELECT jsonb_build_object('id', id) INTO _g FROM public.sos_requests
     WHERE status = 'active' AND play_at > now() AND coalesce(broadcast, true) ORDER BY play_at LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _g := NULL; END;

  RETURN jsonb_build_object(
    'at', now(),
    'net', _net, 'cron', _cron, 'cron_runs', _cron_runs,
    'lifecycle_enabled', _lc_on = 'true', 'lifecycle_last_sent', _lc_last,
    'client_errors', _errs, 'mail', _mail,
    'open_games', (SELECT count(*) FROM public.sos_requests WHERE status = 'active' AND play_at > now()),
    'pending_events', (SELECT count(*) FROM public.event_requests WHERE status = 'pending'),
    'profiles', (SELECT count(*) FROM public.profiles),
    'latest_event', _ev, 'latest_game', _g);
END $$;
REVOKE ALL ON FUNCTION public.watchdog_facts(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.watchdog_facts(timestamptz) TO service_role;

-- ▌3. A player error is forwarded the second it lands (the 5-minute tick is the safety net)
CREATE OR REPLACE FUNCTION public.watchdog_on_client_error()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/watchdog',
      headers := public._notify_headers(),
      body := jsonb_build_object('event', 'client_error', 'id', NEW.id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_watchdog_client_error ON public.client_errors;
CREATE TRIGGER trg_watchdog_client_error
  AFTER INSERT ON public.client_errors
  FOR EACH ROW EXECUTE FUNCTION public.watchdog_on_client_error();

-- ▌4. Admin → Health row: last run, Telegram link state, the pairing code
--    (the code is what Oksana sends her bot — "/start ABC123" — so the
--    watchdog pairs with HER chat and nobody else's)
CREATE OR REPLACE FUNCTION public.admin_watchdog_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _chat text; _last jsonb; _tg jsonb; _checks jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.is_admin) THEN
    RETURN jsonb_build_object('error', 'not_admin');
  END IF;
  SELECT value INTO _code FROM public.internal_config WHERE key = 'telegram_pair_code';
  IF _code IS NULL THEN
    _code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    INSERT INTO public.internal_config (key, value) VALUES ('telegram_pair_code', _code) ON CONFLICT (key) DO NOTHING;
    SELECT value INTO _code FROM public.internal_config WHERE key = 'telegram_pair_code';
  END IF;
  SELECT value INTO _chat FROM public.internal_config WHERE key = 'telegram_chat_id';
  SELECT value INTO _last FROM public.watchdog_state WHERE key = 'last_run';
  SELECT value INTO _tg FROM public.watchdog_state WHERE key = 'telegram';
  SELECT value INTO _checks FROM public.watchdog_state WHERE key = 'checks';
  RETURN jsonb_build_object(
    'pair_code', _code,
    'telegram_connected', _chat IS NOT NULL,
    'telegram_chat_id', _chat,
    'telegram', coalesce(_tg, '{}'::jsonb),
    'last_run', coalesce(_last, '{}'::jsonb),
    'checks', coalesce(_checks, '{}'::jsonb),
    'cron', EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'courtship-watchdog'));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END $$;
REVOKE ALL ON FUNCTION public.admin_watchdog_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_watchdog_status() TO authenticated;

-- ▌5. Every 5 minutes (pg_cron is UTC; the function decides Stockholm times itself)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'courtship-watchdog';
    PERFORM cron.schedule('courtship-watchdog', '*/5 * * * *',
      $cron$ SELECT net.http_post(url := 'https://ycsidxtrizgycfumkrnq.supabase.co/functions/v1/watchdog', headers := public._notify_headers(), body := '{"event":"tick"}'::jsonb); $cron$);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ▌VERIFY — all true
SELECT
  EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'watchdog_state')               AS state_table,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'watchdog_facts')                   AS facts_fn,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_watchdog_client_error')      AS instant_forward,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_watchdog_status')            AS admin_row,
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'courtship-watchdog')              AS every_5_min;
