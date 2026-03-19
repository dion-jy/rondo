// ── Cron Data Types (matching OpenClaw's jobs.json + runs/*.jsonl) ──

export interface CronSchedule {
  kind: string;
  everyMs?: number;
  every?: string;
  anchorMs?: number;
  expr?: string;
  at?: string;
}

export interface CronJobState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: string;
  lastStatus?: string;
  lastDurationMs?: number;
  lastError?: string;
  lastDelivered?: boolean;
  lastDeliveryStatus?: string;
  consecutiveErrors?: number;
  runningAtMs?: number;
  scheduleErrorCount?: number;
  [key: string]: unknown;
}

export interface CronJob {
  id: string;
  name: string;
  agentId?: string;
  enabled: boolean;
  schedule?: CronSchedule;
  sessionTarget?: string;
  wakeMode?: string;
  deleteAfterRun?: boolean;
  payload?: {
    kind?: string;
    message?: string;
    model?: string;
    thinking?: string;
    timeoutSeconds?: number;
    [key: string]: unknown;
  };
  delivery?: {
    mode?: string;
    channel?: string;
    to?: string;
    [key: string]: unknown;
  };
  state?: CronJobState;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface CronRun {
  ts: number;
  jobId: string;
  action?: string;
  status: string;
  summary?: string;
  error?: string;
  durationMs?: number;
  model?: string;
  provider?: string;
  sessionId?: string;
  sessionKey?: string;
  runAtMs?: number;
  nextRunAtMs?: number;
  delivered?: boolean;
  deliveryStatus?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── Supabase Row Types ──

export interface SupabaseCronJob {
  id: string;
  instance_id: string;
  name: string;
  agent_id: string | null;
  enabled: boolean;
  schedule_kind: string | null;
  schedule_every_ms: number | null;
  schedule_expr: string | null;
  schedule_at: string | null;
  session_target: string | null;
  wake_mode: string | null;
  delete_after_run: boolean;
  delivery_mode: string | null;
  delivery_channel: string | null;
  payload_model: string | null;
  payload_thinking: string | null;
  timeout_seconds: number | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
  last_error: string | null;
  consecutive_errors: number;
  is_running: boolean;
  created_at: string | null;
  updated_at: string | null;
  synced_at: string;
  user_id: string | null;
}

export interface SupabaseCronRun {
  id: string;
  instance_id: string;
  job_id: string;
  timestamp: string;
  status: string;
  action: string | null;
  summary: string | null;
  error: string | null;
  duration_ms: number | null;
  model: string | null;
  provider: string | null;
  session_id: string | null;
  delivered: boolean | null;
  delivery_status: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  synced_at: string;
  user_id: string | null;
}

// ── Plugin Config ──

export interface RondoPluginConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  syncIntervalMs?: number;
  userId?: string;
}
