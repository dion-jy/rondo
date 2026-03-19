-- Rondo: Add user_id columns + Auth-aware RLS policies
-- Run this in your Supabase SQL Editor AFTER schema.sql

-- ── Add user_id column (UUID to match Supabase Auth) ──────────────────

ALTER TABLE cron_jobs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE cron_runs ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS idx_cron_jobs_user ON cron_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_cron_runs_user ON cron_runs (user_id);

-- ── Drop permissive policies ──────────────────────────────────────────

DROP POLICY IF EXISTS "Allow all access to cron_jobs" ON cron_jobs;
DROP POLICY IF EXISTS "Allow all access to cron_runs" ON cron_runs;

-- ── New RLS policies: users see only their own data ───────────────────
-- The plugin uses service_role key (bypasses RLS) to write.
-- The UI uses anon key + user JWT, so auth.uid() is set.

-- cron_jobs: authenticated users see their own rows
CREATE POLICY "Users can view own jobs"
  ON cron_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all jobs"
  ON cron_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- cron_runs: authenticated users see their own rows
CREATE POLICY "Users can view own runs"
  ON cron_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all runs"
  ON cron_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
