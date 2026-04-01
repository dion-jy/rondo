-- Automatic Web Push delivery bookkeeping for Rondo
-- Run this after the base schema + 005_push_subscriptions.sql

CREATE TABLE IF NOT EXISTS push_notification_events (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cron_run_id         TEXT NOT NULL,
  instance_id         TEXT NOT NULL,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id              TEXT NOT NULL,
  status              TEXT NOT NULL,
  source              TEXT NOT NULL DEFAULT 'push-notify',
  delivery_state      TEXT NOT NULL DEFAULT 'pending',
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  sent_count          INTEGER NOT NULL DEFAULT 0,
  failed_count        INTEGER NOT NULL DEFAULT 0,
  stale_deleted_count INTEGER NOT NULL DEFAULT 0,
  notification_tag    TEXT,
  title               TEXT,
  body                TEXT,
  last_error          TEXT,
  last_attempted_at   TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (cron_run_id, status)
);

CREATE INDEX IF NOT EXISTS idx_push_notification_events_user
  ON push_notification_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_notification_events_run
  ON push_notification_events (cron_run_id, status);

ALTER TABLE push_notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push notification events"
  ON push_notification_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all push notification events"
  ON push_notification_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION update_push_notification_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_notification_events_updated_at
  ON push_notification_events;

CREATE TRIGGER trg_push_notification_events_updated_at
BEFORE UPDATE ON push_notification_events
FOR EACH ROW
EXECUTE FUNCTION update_push_notification_events_updated_at();
