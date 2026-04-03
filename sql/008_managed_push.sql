-- Managed Push for Rondo
-- Server-side path:
-- cron_runs INSERT/terminal UPDATE -> pg_net HTTP -> Supabase Edge Function -> web push
--
-- Prerequisites:
--   1. 005_push_subscriptions.sql
--   2. 007_push_notification_events.sql
--   3. Edge Function `push-notify` deployed
--   4. Secrets stored in Vault:
--        select vault.create_secret('https://<project>.supabase.co/functions/v1/push-notify', 'rondo_push_notify_url');
--        select vault.create_secret('<shared-secret>', 'rondo_push_notify_shared_secret');

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE push_notification_events
  ADD COLUMN IF NOT EXISTS delivery_channel TEXT,
  ADD COLUMN IF NOT EXISTS request_id BIGINT,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION rondo_get_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  SELECT decrypted_secret
    INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  ORDER BY created_at DESC
  LIMIT 1;

  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'Missing Vault secret: %', secret_name;
  END IF;

  RETURN secret_value;
END;
$$;

CREATE OR REPLACE FUNCTION rondo_dispatch_push_notification(
  p_run_id TEXT,
  p_instance_id TEXT,
  p_user_id UUID,
  p_job_id TEXT,
  p_status TEXT,
  p_timestamp TIMESTAMPTZ,
  p_summary TEXT,
  p_error TEXT,
  p_delivery_channel TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'managed-trigger'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_job_name TEXT;
  v_request_id BIGINT;
BEGIN
  IF p_user_id IS NULL OR p_status NOT IN ('ok', 'error') THEN
    RETURN NULL;
  END IF;

  SELECT name INTO v_job_name
  FROM cron_jobs
  WHERE id = p_job_id
    AND instance_id = p_instance_id
  ORDER BY synced_at DESC
  LIMIT 1;

  v_url := rondo_get_secret('rondo_push_notify_url');
  v_secret := rondo_get_secret('rondo_push_notify_shared_secret');

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object(
      'runId', p_run_id,
      'instanceId', p_instance_id,
      'userId', p_user_id,
      'jobId', p_job_id,
      'jobName', COALESCE(v_job_name, p_job_id),
      'status', p_status,
      'timestamp', p_timestamp,
      'summary', p_summary,
      'error', p_error,
      'deliveryChannel', p_delivery_channel,
      'source', p_source,
      'deepLink', '/'
    )
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION rondo_trigger_managed_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delivery_channel TEXT;
  v_request_id BIGINT;
BEGIN
  IF NEW.user_id IS NULL OR NEW.status NOT IN ('ok', 'error') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT delivery_channel
    INTO v_delivery_channel
  FROM cron_jobs
  WHERE id = NEW.job_id
    AND instance_id = NEW.instance_id
  ORDER BY synced_at DESC
  LIMIT 1;

  v_request_id := rondo_dispatch_push_notification(
    NEW.id,
    NEW.instance_id,
    NEW.user_id,
    NEW.job_id,
    NEW.status,
    NEW.timestamp,
    NEW.summary,
    NEW.error,
    v_delivery_channel,
    'managed-trigger'
  );

  INSERT INTO push_notification_events (
    cron_run_id,
    instance_id,
    user_id,
    job_id,
    status,
    source,
    delivery_channel,
    request_id,
    delivery_state,
    title,
    body,
    next_retry_at,
    last_error
  )
  VALUES (
    NEW.id,
    NEW.instance_id,
    NEW.user_id,
    NEW.job_id,
    NEW.status,
    'managed-trigger',
    v_delivery_channel,
    v_request_id,
    'pending',
    NULL,
    NULL,
    now() + interval '5 minutes',
    NULL
  )
  ON CONFLICT (cron_run_id, status)
  DO UPDATE SET
    source = EXCLUDED.source,
    delivery_channel = EXCLUDED.delivery_channel,
    request_id = EXCLUDED.request_id,
    next_retry_at = EXCLUDED.next_retry_at,
    updated_at = now();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO push_notification_events (
      cron_run_id,
      instance_id,
      user_id,
      job_id,
      status,
      source,
      delivery_channel,
      delivery_state,
      next_retry_at,
      last_error
    )
    VALUES (
      NEW.id,
      NEW.instance_id,
      NEW.user_id,
      NEW.job_id,
      NEW.status,
      'managed-trigger',
      v_delivery_channel,
      'failed',
      now() + interval '5 minutes',
      LEFT(SQLERRM, 400)
    )
    ON CONFLICT (cron_run_id, status)
    DO UPDATE SET
      delivery_state = 'failed',
      next_retry_at = now() + interval '5 minutes',
      last_error = LEFT(SQLERRM, 400),
      updated_at = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rondo_managed_push ON cron_runs;

CREATE TRIGGER trg_rondo_managed_push
AFTER INSERT OR UPDATE OF status ON cron_runs
FOR EACH ROW
EXECUTE FUNCTION rondo_trigger_managed_push();

CREATE OR REPLACE FUNCTION rondo_retry_failed_push_notifications(
  p_max_attempts INTEGER DEFAULT 5,
  p_batch_size INTEGER DEFAULT 20
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
  v_count INTEGER := 0;
  v_request_id BIGINT;
BEGIN
  FOR v_row IN
    SELECT
      e.id AS event_id,
      r.id AS run_id,
      r.instance_id,
      r.user_id,
      r.job_id,
      r.status,
      r.timestamp,
      r.summary,
      r.error,
      e.delivery_channel
    FROM push_notification_events e
    JOIN cron_runs r
      ON r.id = e.cron_run_id
     AND r.instance_id = e.instance_id
    WHERE e.delivery_state = 'failed'
      AND e.attempt_count < p_max_attempts
      AND COALESCE(e.next_retry_at, '-infinity'::timestamptz) <= now()
    ORDER BY e.updated_at ASC
    LIMIT p_batch_size
  LOOP
    v_request_id := rondo_dispatch_push_notification(
      v_row.run_id,
      v_row.instance_id,
      v_row.user_id,
      v_row.job_id,
      v_row.status,
      v_row.timestamp,
      v_row.summary,
      v_row.error,
      v_row.delivery_channel,
      'managed-retry'
    );

    UPDATE push_notification_events
    SET
      source = 'managed-retry',
      request_id = v_request_id,
      delivery_state = 'pending',
      next_retry_at = now() + interval '5 minutes',
      updated_at = now()
    WHERE id = v_row.event_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

SELECT cron.unschedule('rondo-push-retry-every-5m')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'rondo-push-retry-every-5m'
);

SELECT cron.schedule(
  'rondo-push-retry-every-5m',
  '*/5 * * * *',
  $$SELECT rondo_retry_failed_push_notifications();$$
);
