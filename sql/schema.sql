-- Rondo: Supabase Schema
-- Run this in your Supabase SQL Editor

-- ── cron_jobs ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cron_jobs (
  id                TEXT NOT NULL,
  instance_id       TEXT NOT NULL,
  name              TEXT NOT NULL,
  agent_id          TEXT,
  enabled           BOOLEAN NOT NULL DEFAULT true,

  -- Schedule
  schedule_kind     TEXT,
  schedule_every_ms BIGINT,
  schedule_expr     TEXT,
  schedule_at       TEXT,

  -- Execution config
  session_target    TEXT,
  wake_mode         TEXT,
  delete_after_run  BOOLEAN NOT NULL DEFAULT false,
  delivery_mode     TEXT,
  delivery_channel  TEXT,
  payload_model     TEXT,
  payload_thinking  TEXT,
  timeout_seconds   INTEGER,

  -- State (last known)
  next_run_at       TIMESTAMPTZ,
  last_run_at       TIMESTAMPTZ,
  last_status       TEXT,
  last_duration_ms  INTEGER,
  last_error        TEXT,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  is_running        BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  created_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, instance_id)
);

-- Index for UI queries
CREATE INDEX IF NOT EXISTS idx_cron_jobs_instance
  ON cron_jobs (instance_id);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled
  ON cron_jobs (instance_id, enabled);

-- ── cron_runs ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cron_runs (
  id                TEXT NOT NULL,
  instance_id       TEXT NOT NULL,
  job_id            TEXT NOT NULL,
  timestamp         TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL,
  action            TEXT,

  -- Result
  summary           TEXT,
  error             TEXT,
  duration_ms       INTEGER,

  -- Model info
  model             TEXT,
  provider          TEXT,
  session_id        TEXT,

  -- Delivery
  delivered         BOOLEAN,
  delivery_status   TEXT,

  -- Token usage
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  total_tokens      INTEGER,

  -- Metadata
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, instance_id)
);

-- Indexes for UI queries
CREATE INDEX IF NOT EXISTS idx_cron_runs_instance
  ON cron_runs (instance_id);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job
  ON cron_runs (instance_id, job_id);
CREATE INDEX IF NOT EXISTS idx_cron_runs_timestamp
  ON cron_runs (instance_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_status
  ON cron_runs (instance_id, status);

-- ── RLS (Row Level Security) ──────────────────────────────────────────
-- Enable RLS for future multi-user support.
-- For now, allow all access via anon key.
-- TODO: Add proper user-based policies when auth is implemented.

ALTER TABLE cron_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;

-- Temporary: allow all operations for authenticated and anon users
CREATE POLICY "Allow all access to cron_jobs"
  ON cron_jobs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to cron_runs"
  ON cron_runs FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Views (convenience) ──────────────────────────────────────────────

CREATE OR REPLACE VIEW cron_jobs_summary AS
SELECT
  j.id,
  j.instance_id,
  j.name,
  j.enabled,
  j.schedule_kind,
  j.last_status,
  j.last_run_at,
  j.next_run_at,
  j.consecutive_errors,
  j.is_running,
  j.synced_at,
  (SELECT COUNT(*) FROM cron_runs r WHERE r.job_id = j.id AND r.instance_id = j.instance_id) AS total_runs,
  (SELECT COUNT(*) FROM cron_runs r WHERE r.job_id = j.id AND r.instance_id = j.instance_id AND r.status = 'ok') AS successful_runs,
  (SELECT SUM(r.total_tokens) FROM cron_runs r WHERE r.job_id = j.id AND r.instance_id = j.instance_id) AS total_tokens_used
FROM cron_jobs j;
