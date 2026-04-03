-- ============================================================================
-- Rondo: Enforce RLS on cron_jobs, cron_runs, acp_sessions
-- Run this in your Supabase SQL Editor.
--
-- PREREQUISITE: Set RONDO_SUPABASE_SERVICE_ROLE_KEY env var on the plugin host
-- so the sync plugin uses service_role (bypasses RLS) instead of anon key.
--
-- This migration is idempotent — safe to run multiple times.
-- ============================================================================

-- ── 1. Enable RLS on all three tables ──────────────────────────────────────

ALTER TABLE cron_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE acp_sessions ENABLE ROW LEVEL SECURITY;

-- ── 2. Drop any old permissive policies (clean slate) ──────────────────────

-- cron_jobs
DROP POLICY IF EXISTS "Allow all access to cron_jobs"     ON cron_jobs;
DROP POLICY IF EXISTS "Users can view own jobs"            ON cron_jobs;
DROP POLICY IF EXISTS "Service role can manage all jobs"   ON cron_jobs;
DROP POLICY IF EXISTS "users_select_own_jobs"              ON cron_jobs;
DROP POLICY IF EXISTS "service_role_all_jobs"              ON cron_jobs;

-- cron_runs
DROP POLICY IF EXISTS "Allow all access to cron_runs"     ON cron_runs;
DROP POLICY IF EXISTS "Users can view own runs"            ON cron_runs;
DROP POLICY IF EXISTS "Service role can manage all runs"   ON cron_runs;
DROP POLICY IF EXISTS "users_select_own_runs"              ON cron_runs;
DROP POLICY IF EXISTS "service_role_all_runs"              ON cron_runs;

-- acp_sessions
DROP POLICY IF EXISTS "Allow all access to acp_sessions"     ON acp_sessions;
DROP POLICY IF EXISTS "Users can view own sessions"          ON acp_sessions;
DROP POLICY IF EXISTS "Service role can manage all sessions" ON acp_sessions;
DROP POLICY IF EXISTS "users_select_own_sessions"            ON acp_sessions;
DROP POLICY IF EXISTS "service_role_all_sessions"            ON acp_sessions;

-- ── 3. cron_jobs policies ──────────────────────────────────────────────────
-- Authenticated users (UI with JWT) can read only their own jobs.
-- No INSERT/UPDATE/DELETE for authenticated — the plugin handles all writes.

CREATE POLICY "users_select_own_jobs"
  ON cron_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role (plugin sync) has full access — bypasses RLS anyway,
-- but explicit policy ensures clarity if force_row_level_security is ever on.
CREATE POLICY "service_role_all_jobs"
  ON cron_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 4. cron_runs policies ──────────────────────────────────────────────────
-- Same pattern: authenticated can read own, service_role has full access.

CREATE POLICY "users_select_own_runs"
  ON cron_runs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_role_all_runs"
  ON cron_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 5. acp_sessions policies ───────────────────────────────────────────────

CREATE POLICY "users_select_own_sessions"
  ON acp_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "service_role_all_sessions"
  ON acp_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 6. Secure the view ────────────────────────────────────────────────────
-- cron_jobs_summary is a view that joins cron_jobs + cron_runs.
-- Views use the permissions of the view owner (typically postgres).
-- Set security_invoker so the view respects the CALLING user's RLS.

ALTER VIEW cron_jobs_summary SET (security_invoker = on);

-- ── 7. Revoke direct anon access ──────────────────────────────────────────
-- The anon role should NOT be able to SELECT/INSERT/UPDATE/DELETE on these
-- tables. RLS default-deny handles this (no policy grants anon access),
-- but revoking table-level grants adds defense-in-depth.

REVOKE ALL ON cron_jobs      FROM anon;
REVOKE ALL ON cron_runs      FROM anon;
REVOKE ALL ON acp_sessions   FROM anon;
REVOKE ALL ON cron_jobs_summary FROM anon;

-- Grant back to authenticated (needed for RLS policies to work)
GRANT SELECT ON cron_jobs        TO authenticated;
GRANT SELECT ON cron_runs        TO authenticated;
GRANT SELECT ON acp_sessions     TO authenticated;
GRANT SELECT ON cron_jobs_summary TO authenticated;
