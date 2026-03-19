import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type {
  CronJob,
  CronRun,
  RondoPluginConfig,
  SupabaseCronJob,
  SupabaseCronRun,
} from "./types.js";
import { SUPABASE_BATCH_SIZE } from "./config.js";

// ── Resolve Supabase Auth email → UUID ──

let cachedAuthUid: string | null = null;
let cachedAuthEmail: string | null = null;

async function resolveAuthUserId(
  url: string,
  key: string,
  email: string,
  logger: { warn: (msg: string) => void }
): Promise<string | null> {
  // Return cached value if email hasn't changed
  if (cachedAuthEmail === email && cachedAuthUid) return cachedAuthUid;

  try {
    const resp = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=100`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      logger.warn(`[rondo] Failed to resolve auth email (HTTP ${resp.status}): ${body}`);
      return null;
    }

    const data = await resp.json();
    const users: { id: string; email?: string }[] = data.users ?? data;
    const match = users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!match) {
      logger.warn(
        `[rondo] No Supabase Auth user found for email "${email}". ` +
        `Make sure this email has logged in via the Rondo UI at least once.`
      );
      return null;
    }

    cachedAuthEmail = email;
    cachedAuthUid = match.id;
    return match.id;
  } catch (err) {
    logger.warn(
      `[rondo] Error resolving auth email: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

// ── Instance ID (stable per gateway boot, identifies this OpenClaw instance) ──

let instanceId: string | undefined;

function getInstanceId(cronDir: string): string {
  if (instanceId) return instanceId;

  const idPath = join(cronDir, "..", ".rondo-instance-id");
  try {
    if (existsSync(idPath)) {
      instanceId = readFileSync(idPath, "utf-8").trim();
    }
  } catch {
    // ignore
  }
  if (!instanceId) {
    instanceId = randomUUID();
    try {
      const { writeFileSync } = require("fs");
      writeFileSync(idPath, instanceId, "utf-8");
    } catch {
      // non-critical — will regenerate on next boot
    }
  }
  return instanceId;
}

// ── Read local cron data ──

export function readJobs(cronDir: string): CronJob[] {
  const jobsPath = join(cronDir, "jobs.json");
  if (!existsSync(jobsPath)) return [];
  try {
    const raw = readFileSync(jobsPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.jobs)) return parsed.jobs;
    return [];
  } catch {
    return [];
  }
}

export function readRuns(cronDir: string): CronRun[] {
  const runsDir = join(cronDir, "runs");
  if (!existsSync(runsDir)) return [];

  const runs: CronRun[] = [];
  try {
    const files = readdirSync(runsDir).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      const lines = readFileSync(join(runsDir, file), "utf-8")
        .split("\n")
        .filter(Boolean);
      for (const line of lines) {
        try {
          runs.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }
    }
  } catch {
    // ignore read errors
  }

  return runs;
}

// ── Transform to Supabase rows ──

function toSupabaseJob(job: CronJob, instId: string, userId: string | null): SupabaseCronJob {
  const now = new Date().toISOString();
  return {
    id: job.id,
    instance_id: instId,
    name: job.name,
    agent_id: job.agentId ?? null,
    enabled: job.enabled,
    schedule_kind: job.schedule?.kind ?? null,
    schedule_every_ms: job.schedule?.everyMs ?? null,
    schedule_expr: job.schedule?.expr ?? null,
    schedule_at: job.schedule?.at ?? null,
    session_target: job.sessionTarget ?? null,
    wake_mode: job.wakeMode ?? null,
    delete_after_run: job.deleteAfterRun ?? false,
    delivery_mode: job.delivery?.mode ?? null,
    delivery_channel: job.delivery?.channel ?? null,
    payload_model: job.payload?.model ?? null,
    payload_thinking: job.payload?.thinking ?? null,
    timeout_seconds: job.payload?.timeoutSeconds ?? null,
    next_run_at: job.state?.nextRunAtMs
      ? new Date(job.state.nextRunAtMs).toISOString()
      : null,
    last_run_at: job.state?.lastRunAtMs
      ? new Date(job.state.lastRunAtMs).toISOString()
      : null,
    last_status: job.state?.lastStatus ?? null,
    last_duration_ms: job.state?.lastDurationMs ?? null,
    last_error: job.state?.lastError ?? null,
    consecutive_errors: job.state?.consecutiveErrors ?? 0,
    is_running: !!job.state?.runningAtMs,
    created_at: job.createdAtMs
      ? new Date(job.createdAtMs).toISOString()
      : null,
    updated_at: job.updatedAtMs
      ? new Date(job.updatedAtMs).toISOString()
      : null,
    synced_at: now,
    user_id: userId,
  };
}

function toSupabaseRun(run: CronRun, instId: string, userId: string | null): SupabaseCronRun {
  const now = new Date().toISOString();
  // Use ts + jobId as a deterministic ID to avoid duplicates
  const id = `${run.jobId}-${run.ts}`;
  return {
    id,
    instance_id: instId,
    job_id: run.jobId,
    timestamp: new Date(run.ts).toISOString(),
    status: run.status,
    action: run.action ?? null,
    summary: run.summary ?? null,
    error: run.error ?? null,
    duration_ms: run.durationMs ?? null,
    model: run.model ?? null,
    provider: run.provider ?? null,
    session_id: run.sessionId ?? null,
    delivered: run.delivered ?? null,
    delivery_status: run.deliveryStatus ?? null,
    input_tokens: run.usage?.input_tokens ?? null,
    output_tokens: run.usage?.output_tokens ?? null,
    total_tokens: run.usage?.total_tokens ?? null,
    synced_at: now,
    user_id: userId,
  };
}

// ── Supabase REST client (no SDK dependency — just fetch) ──

async function supabaseUpsert(
  url: string,
  key: string,
  table: string,
  rows: Record<string, unknown>[],
  conflictColumn: string = "id"
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };

  try {
    const resp = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: `resolution=merge-duplicates,return=minimal`,
      },
      body: JSON.stringify(rows),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, error: `HTTP ${resp.status}: ${body}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Delete orphaned jobs from Supabase (cron_runs history is preserved) ──

async function supabaseDeleteOrphans(
  url: string,
  key: string,
  instId: string,
  localIds: Set<string>,
  userId: string | null
): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  try {
    // Fetch job IDs for this instance from Supabase
    let fetchUrl = `${url}/rest/v1/cron_jobs?instance_id=eq.${encodeURIComponent(instId)}&select=id`;
    if (userId) {
      fetchUrl += `&user_id=eq.${encodeURIComponent(userId)}`;
    }
    const resp = await fetch(fetchUrl, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!resp.ok) {
      return { ok: false, error: `Fetch HTTP ${resp.status}` };
    }
    const remoteRows: { id: string }[] = await resp.json();
    const orphanIds = remoteRows.map((r) => r.id).filter((id) => !localIds.has(id));

    if (orphanIds.length === 0) return { ok: true, deleted: 0 };

    // Hard delete orphaned jobs (cron_runs has no FK cascade, history preserved)
    const idsParam = orphanIds.map((id) => `"${id}"`).join(",");
    const delResp = await fetch(
      `${url}/rest/v1/cron_jobs?id=in.(${idsParam})`,
      {
        method: "DELETE",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "return=minimal",
        },
      }
    );
    if (!delResp.ok) {
      const body = await delResp.text().catch(() => "");
      return { ok: false, error: `Delete HTTP ${delResp.status}: ${body}` };
    }
    return { ok: true, deleted: orphanIds.length };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Main sync function ──

export async function syncToSupabase(
  cronDir: string,
  config: RondoPluginConfig,
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
): Promise<void> {
  const { supabaseUrl, supabaseKey, userId, supabaseAuthEmail } = config;
  if (!supabaseUrl || !supabaseKey) {
    logger.warn("[rondo] Supabase not configured — skipping sync");
    return;
  }

  // Resolve user_id: prefer explicit userId, then auto-resolve from auth email
  let resolvedUserId = userId;
  if (!resolvedUserId && supabaseAuthEmail) {
    const authUid = await resolveAuthUserId(supabaseUrl, supabaseKey, supabaseAuthEmail, logger);
    if (authUid) {
      resolvedUserId = authUid;
      logger.info(`[rondo] Resolved auth email "${supabaseAuthEmail}" → user_id ${authUid}`);
    }
  }

  if (!resolvedUserId) {
    logger.warn("[rondo] No user_id configured (set supabaseAuthEmail or RONDO_USER_ID) — sync may fail with RLS");
  }

  const instId = getInstanceId(cronDir);
  const jobs = readJobs(cronDir);
  const runs = readRuns(cronDir);

  logger.info(
    `[rondo] Syncing ${jobs.length} jobs + ${runs.length} runs to Supabase`
  );

  // ── Upsert jobs ──
  const uid = resolvedUserId ?? null;
  const jobRows = jobs.map((j) => toSupabaseJob(j, instId, uid));
  const jobResult = await supabaseUpsert(
    supabaseUrl,
    supabaseKey,
    "cron_jobs",
    jobRows as unknown as Record<string, unknown>[]
  );
  if (!jobResult.ok) {
    logger.error(`[rondo] Failed to sync jobs: ${jobResult.error}`);
  }

  // ── Delete orphaned jobs (not in local jobs.json; run history preserved) ──
  if (jobResult.ok) {
    const localJobIds = new Set(jobs.map((j) => j.id));
    const delResult = await supabaseDeleteOrphans(
      supabaseUrl,
      supabaseKey,
      instId,
      localJobIds,
      uid
    );
    if (!delResult.ok) {
      logger.warn(`[rondo] Failed to delete orphaned jobs: ${delResult.error}`);
    } else if (delResult.deleted) {
      logger.info(`[rondo] Deleted ${delResult.deleted} orphaned jobs from Supabase`);
    }
  }

  // ── Upsert runs in batches ──
  const runRows = runs.map((r) => toSupabaseRun(r, instId, uid));
  let runErrors = 0;
  for (let i = 0; i < runRows.length; i += SUPABASE_BATCH_SIZE) {
    const batch = runRows.slice(i, i + SUPABASE_BATCH_SIZE);
    const result = await supabaseUpsert(
      supabaseUrl,
      supabaseKey,
      "cron_runs",
      batch as unknown as Record<string, unknown>[]
    );
    if (!result.ok) {
      logger.error(`[rondo] Failed to sync run batch: ${result.error}`);
      runErrors++;
    }
  }

  if (runErrors === 0 && jobResult.ok) {
    logger.info("[rondo] Sync completed successfully");
  }
}
