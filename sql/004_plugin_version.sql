-- 004: Add plugin_version column to cron_jobs
-- Tracks which version of @dion-jy/rondo the gateway is running.

ALTER TABLE cron_jobs ADD COLUMN IF NOT EXISTS plugin_version text;
