-- Rondo: Enforce user_id scoping — cleanup NULL rows + constraints + acp_sessions RLS
-- Run this in Supabase SQL Editor AFTER 002_user_id_rls.sql

-- ── 1. Delete unscoped rows (user_id IS NULL) ──────────────────────────

DELETE FROM cron_runs   WHERE user_id IS NULL;
DELETE FROM acp_sessions WHERE user_id IS NULL;
DELETE FROM cron_jobs    WHERE user_id IS NULL;

-- ── 2. Add NOT NULL constraints ─────────────────────────────────────────

ALTER TABLE cron_jobs    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cron_runs    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE acp_sessions ALTER COLUMN user_id SET NOT NULL;

-- ── 3. RLS policies for acp_sessions (missing from 002) ────────────────

ALTER TABLE acp_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to acp_sessions" ON acp_sessions;

CREATE POLICY "Users can view own sessions"
  ON acp_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all sessions"
  ON acp_sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 4. Index for acp_sessions user_id ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_acp_sessions_user ON acp_sessions (user_id);
