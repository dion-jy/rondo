import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, openSync, readSync, closeSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type {
  CronJob,
  CronRun,
  AcpSessionInfo,
  SupabaseCronJob,
  SupabaseCronRun,
  SupabaseAcpSession,
} from "./types.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_BATCH_SIZE } from "./config.js";

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
      writeFileSync(idPath, instanceId, "utf-8");
    } catch {
      // non-critical — will regenerate on next boot
    }
  }
  return instanceId;
}

// ── User ID (resolved from device link token) ──

function getUserIdPath(cronDir: string): string {
  return join(cronDir, "..", ".rondo-user-id");
}

export function getSavedUserId(cronDir: string): string | null {
  const idPath = getUserIdPath(cronDir);
  try {
    if (existsSync(idPath)) {
      const id = readFileSync(idPath, "utf-8").trim();
      if (id) return id;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveUserId(cronDir: string, userId: string): void {
  try {
    writeFileSync(getUserIdPath(cronDir), userId, "utf-8");
  } catch {
    // non-critical
  }
}

/**
 * Claim a one-time link token from Supabase device_links table.
 * Returns the user_id if successful, null otherwise.
 */
export async function claimLinkToken(
  token: string,
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
): Promise<string | null> {
  try {
    // Read the token (anon can read unused, non-expired tokens per RLS)
    const readResp = await fetch(
      `${SUPABASE_URL}/rest/v1/device_links?token=eq.${encodeURIComponent(token)}&select=user_id,used`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!readResp.ok) {
      logger.warn(`[rondo] Failed to read link token: HTTP ${readResp.status}`);
      return null;
    }
    const rows: { user_id: string; used: boolean }[] = await readResp.json();
    if (rows.length === 0) {
      logger.warn("[rondo] Link token not found or expired");
      return null;
    }
    if (rows[0].used) {
      logger.warn("[rondo] Link token already used");
      return null;
    }

    const userId = rows[0].user_id;

    // Mark the token as used (anon can update unused, non-expired tokens per RLS)
    const updateResp = await fetch(
      `${SUPABASE_URL}/rest/v1/device_links?token=eq.${encodeURIComponent(token)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ used: true, used_at: new Date().toISOString() }),
      }
    );
    if (!updateResp.ok) {
      logger.warn(`[rondo] Failed to mark token as used: HTTP ${updateResp.status}`);
      // Still return userId — the token was valid
    }

    logger.info(`[rondo] Device linked successfully (user_id=${userId})`);
    return userId;
  } catch (err) {
    logger.error(`[rondo] Error claiming link token: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Resolve user_id from saved .rondo-user-id file.
 * Linking is now handled by the /rondo link chat command.
 */
export function resolveUserId(cronDir: string): string | null {
  return getSavedUserId(cronDir);
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

function toSupabaseJob(job: CronJob, instId: string, userId: string | null = null): SupabaseCronJob {
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

function toSupabaseRun(run: CronRun, instId: string, userId: string | null = null): SupabaseCronRun {
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
  table: string,
  rows: Record<string, unknown>[],
  _conflictColumn: string = "id"
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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

// ── Read ACP session data ──

function getSessionsDir(cronDir: string): string {
  return join(cronDir, "..", "agents", "claude", "sessions");
}

/**
 * Read head (first N bytes) and tail (last N bytes) of a file efficiently.
 * Avoids reading entire large session files into memory.
 */
function readHeadAndTail(filePath: string, headBytes = 16384, tailBytes = 8192): { head: string; tail: string } {
  try {
    const stat = statSync(filePath);
    const size = stat.size;

    if (size <= headBytes + tailBytes) {
      const full = readFileSync(filePath, "utf-8");
      return { head: full, tail: full };
    }

    const fd = openSync(filePath, "r");
    try {
      // Read head
      const headBuf = Buffer.alloc(headBytes);
      readSync(fd, headBuf, 0, headBytes, 0);
      const head = headBuf.toString("utf-8");

      // Read tail
      const tailBuf = Buffer.alloc(tailBytes);
      readSync(fd, tailBuf, 0, tailBytes, size - tailBytes);
      const tail = tailBuf.toString("utf-8");

      return { head, tail };
    } finally {
      closeSync(fd);
    }
  } catch {
    return { head: "", tail: "" };
  }
}

function parseSessionLabel(firstUserContent: string): string {
  if (!firstUserContent) return "Untitled session";
  // Strip timestamp prefix like [Wed 2026-03-18 23:24 GMT+9]
  const cleaned = firstUserContent.replace(/^\[.*?\]\s*/, "");
  // Look for ## heading first
  const headingMatch = cleaned.match(/^#+\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim().slice(0, 100);
  // Otherwise take first line
  const firstLine = cleaned.split("\n")[0].trim();
  return firstLine.slice(0, 100) || "Untitled session";
}

function extractMessageContent(msg: any): string {
  if (!msg?.message?.content) return "";
  const content = msg.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b: any) => b.type === "text");
    return textBlock?.text ?? "";
  }
  return "";
}

export function readSessions(cronDir: string, maxAgeMs = 2 * 60 * 60 * 1000): AcpSessionInfo[] {
  const sessDir = getSessionsDir(cronDir);
  if (!existsSync(sessDir)) return [];

  const now = Date.now();
  const sessions: AcpSessionInfo[] = [];

  let files: string[];
  try {
    files = readdirSync(sessDir).filter(
      (f) => f.endsWith(".jsonl") && !f.includes(".acp-stream.")
    );
  } catch {
    return [];
  }

  for (const file of files) {
    const filePath = join(sessDir, file);
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      continue;
    }

    // Only sync sessions modified within maxAgeMs
    if (now - stat.mtimeMs > maxAgeMs) continue;

    const { head, tail } = readHeadAndTail(filePath);
    if (!head) continue;

    const headLines = head.split("\n").filter(Boolean);
    const tailLines = tail.split("\n").filter(Boolean);

    // Parse session header (first line)
    let sessionHeader: any;
    try {
      sessionHeader = JSON.parse(headLines[0]);
    } catch {
      continue;
    }
    if (sessionHeader?.type !== "session") continue;

    const sessionId = sessionHeader.id ?? file.replace(".jsonl", "");
    const startedAt = sessionHeader.timestamp;

    // Find first user message for label
    // Try JSON parsing first; fall back to regex extraction for truncated lines
    let label = "Untitled session";
    for (let i = 1; i < headLines.length; i++) {
      const line = headLines[i];
      try {
        const parsed = JSON.parse(line);
        if (parsed?.type === "message" && parsed?.message?.role === "user") {
          label = parseSessionLabel(extractMessageContent(parsed));
          break;
        }
      } catch {
        // Line may be truncated — try regex extraction for user messages
        if (line.includes('"role":"user"') && line.includes('"content":')) {
          const contentMatch = line.match(/"content":"((?:[^"\\]|\\.)*)/)
            ?? line.match(/"content":\s*"((?:[^"\\]|\\.)*)/);
          if (contentMatch) {
            const raw = contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
            label = parseSessionLabel(raw);
            break;
          }
        }
        continue;
      }
    }

    // Find last assistant message for summary/model/usage
    let lastAssistantMsg: any = null;
    let lastTimestamp = startedAt;
    for (let i = tailLines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(tailLines[i]);
        if (parsed?.timestamp) lastTimestamp = parsed.timestamp;
        if (parsed?.type === "message" && parsed?.message?.role === "assistant" && !lastAssistantMsg) {
          lastAssistantMsg = parsed;
        }
        if (lastAssistantMsg && lastTimestamp !== startedAt) break;
      } catch {
        continue;
      }
    }

    // Determine status
    const fileAgeSec = (now - stat.mtimeMs) / 1000;
    let status: string;
    if (fileAgeSec < 300) {
      status = "running";
    } else if (lastAssistantMsg?.message?.stopReason === "stop") {
      status = "completed";
    } else {
      status = "idle";
    }

    // Extract summary from last assistant message
    let summary: string | null = null;
    if (lastAssistantMsg) {
      const text = extractMessageContent(lastAssistantMsg);
      summary = text ? text.slice(0, 200) : null;
    }

    // Extract model and tokens
    const model = lastAssistantMsg?.message?.model ?? null;
    const usage = lastAssistantMsg?.message?.usage;
    const tokens = usage?.totalTokens ?? usage?.total_tokens ?? null;

    // Duration
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(lastTimestamp).getTime();
    const durationMs = endMs > startMs ? endMs - startMs : null;

    sessions.push({
      key: sessionId,
      label,
      agent: "claude",
      model,
      status,
      started_at: startedAt,
      updated_at: lastTimestamp,
      summary,
      tokens: typeof tokens === "number" ? tokens : null,
      duration_ms: durationMs,
    });
  }

  return sessions;
}

function toSupabaseSession(
  session: AcpSessionInfo,
  instId: string,
  userId: string | null = null
): SupabaseAcpSession {
  return {
    key: session.key,
    label: session.label,
    agent: session.agent,
    model: session.model,
    status: session.status,
    started_at: session.started_at,
    updated_at: session.updated_at,
    summary: session.summary,
    tokens: session.tokens,
    duration_ms: session.duration_ms,
    instance_id: instId,
    user_id: userId,
    synced_at: new Date().toISOString(),
  };
}

// ── Delete orphaned jobs from Supabase (cron_runs history is preserved) ──

async function supabaseDeleteOrphans(
  instId: string,
  localIds: Set<string>
): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  try {
    // Fetch job IDs for this instance from Supabase
    const fetchUrl = `${SUPABASE_URL}/rest/v1/cron_jobs?instance_id=eq.${encodeURIComponent(instId)}&select=id`;
    const resp = await fetch(fetchUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
      `${SUPABASE_URL}/rest/v1/cron_jobs?id=in.(${idsParam})`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void }
): Promise<void> {
  const instId = getInstanceId(cronDir);
  const userId = resolveUserId(cronDir);
  const jobs = readJobs(cronDir);
  const runs = readRuns(cronDir);
  const sessions = readSessions(cronDir);

  logger.info(
    `[rondo] Syncing ${jobs.length} jobs + ${runs.length} runs + ${sessions.length} sessions to Supabase`
  );

  // ── Upsert jobs ──
  const jobRows = jobs.map((j) => toSupabaseJob(j, instId, userId));
  const jobResult = await supabaseUpsert(
    "cron_jobs",
    jobRows as unknown as Record<string, unknown>[]
  );
  if (!jobResult.ok) {
    logger.error(`[rondo] Failed to sync jobs: ${jobResult.error}`);
  }

  // ── Delete orphaned jobs (not in local jobs.json; run history preserved) ──
  if (jobResult.ok) {
    const localJobIds = new Set(jobs.map((j) => j.id));
    const delResult = await supabaseDeleteOrphans(instId, localJobIds);
    if (!delResult.ok) {
      logger.warn(`[rondo] Failed to delete orphaned jobs: ${delResult.error}`);
    } else if (delResult.deleted) {
      logger.info(`[rondo] Deleted ${delResult.deleted} orphaned jobs from Supabase`);
    }
  }

  // ── Upsert runs in batches ──
  const runRows = runs.map((r) => toSupabaseRun(r, instId, userId));
  let runErrors = 0;
  for (let i = 0; i < runRows.length; i += SUPABASE_BATCH_SIZE) {
    const batch = runRows.slice(i, i + SUPABASE_BATCH_SIZE);
    const result = await supabaseUpsert(
      "cron_runs",
      batch as unknown as Record<string, unknown>[]
    );
    if (!result.ok) {
      logger.error(`[rondo] Failed to sync run batch: ${result.error}`);
      runErrors++;
    }
  }

  // ── Upsert ACP sessions ──
  let sessionErrors = 0;
  if (sessions.length > 0) {
    const sessionRows = sessions.map((s) => toSupabaseSession(s, instId, userId));
    for (let i = 0; i < sessionRows.length; i += SUPABASE_BATCH_SIZE) {
      const batch = sessionRows.slice(i, i + SUPABASE_BATCH_SIZE);
      const result = await supabaseUpsert(
        "acp_sessions",
        batch as unknown as Record<string, unknown>[],
        "key"
      );
      if (!result.ok) {
        logger.error(`[rondo] Failed to sync session batch: ${result.error}`);
        sessionErrors++;
      }
    }
  }

  if (runErrors === 0 && jobResult.ok && sessionErrors === 0) {
    logger.info("[rondo] Sync completed successfully");
  }
}
