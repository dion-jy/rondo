-- Rondo: classify synced sessions for filtering/distinction in UI
-- Safe for existing rows: new columns default nullable, then best-effort backfill.

ALTER TABLE acp_sessions ADD COLUMN IF NOT EXISTS session_type TEXT;
ALTER TABLE acp_sessions ADD COLUMN IF NOT EXISTS runtime_type TEXT;
ALTER TABLE acp_sessions ADD COLUMN IF NOT EXISTS source_channel TEXT;

CREATE INDEX IF NOT EXISTS idx_acp_sessions_user_session_type_updated
  ON acp_sessions (user_id, session_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_acp_sessions_runtime_type
  ON acp_sessions (runtime_type);
CREATE INDEX IF NOT EXISTS idx_acp_sessions_source_channel
  ON acp_sessions (source_channel);

UPDATE acp_sessions
SET
  session_type = CASE
    WHEN key ~ '^agent:[^:]+:acp:' THEN 'acp'
    WHEN key ~ '^agent:[^:]+:subagent:' THEN 'subagent'
    WHEN key ~ '^agent:main:cron:' THEN 'cron'
    WHEN key = 'agent:main:main'
      AND COALESCE(label, '') ~* '(heartbeat|heartbeat_ok|read heartbeat\.md)' THEN 'heartbeat'
    WHEN key ~ '^agent:main:[^:]+:.+' OR key = 'agent:main:main' THEN 'main'
    ELSE 'other'
  END,
  runtime_type = CASE
    WHEN key ~ '^agent:[^:]+:acp:' THEN 'acp'
    WHEN key ~ '^agent:[^:]+:subagent:' THEN 'subagent'
    WHEN key ~ '^agent:main:cron:' OR key ~ '^agent:main:[^:]+:.+' OR key = 'agent:main:main' THEN 'native'
    ELSE 'unknown'
  END,
  source_channel = CASE
    WHEN key ~ '^agent:main:telegram:.+' THEN 'telegram'
    WHEN key ~ '^agent:main:webchat:.+' THEN 'webchat'
    ELSE 'unknown'
  END
WHERE session_type IS NULL
   OR runtime_type IS NULL
   OR source_channel IS NULL;
