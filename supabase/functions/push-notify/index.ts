import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import webpush from "npm:web-push@3.6.7";

type LegacyPushNotifyRequest = {
  runId?: string;
  instanceId?: string;
  userId?: string;
  jobId?: string;
  jobName?: string;
  status?: string;
  timestamp?: string;
  summary?: string | null;
  error?: string | null;
  deepLink?: string;
  deliveryChannel?: string | null;
  source?: string | null;
  requestId?: number | null;
};

type WebhookRunRecord = {
  id?: string;
  instance_id?: string;
  user_id?: string;
  job_id?: string;
  status?: string;
  timestamp?: string;
  summary?: string | null;
  error?: string | null;
  delivery_status?: string | null;
};

type WebhookPushNotifyRequest = {
  type?: string;
  table?: string;
  record?: WebhookRunRecord | null;
  old_record?: WebhookRunRecord | null;
  source?: string | null;
  request_id?: number | null;
};

type NormalizedPushRequest = {
  runId: string;
  instanceId: string;
  userId: string;
  jobId: string;
  jobName: string;
  status: "ok" | "error";
  timestamp: string | null;
  summary: string | null;
  error: string | null;
  deepLink: string;
  deliveryChannel: string | null;
  source: string;
  requestId: number | null;
};

type PushEventRow = {
  id: number;
  delivery_state: string;
  attempt_count: number;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUSH_NOTIFY_SHARED_SECRET =
  Deno.env.get("PUSH_NOTIFY_SHARED_SECRET") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@rondo.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function truncate(value: string | null | undefined, max = 180): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function buildNotification(payload: Pick<NormalizedPushRequest, "runId" | "jobName" | "status" | "summary" | "error" | "deepLink">) {
  const failed = payload.status === "error";
  const title = failed ? `Rondo - ${payload.jobName} failed` : `Rondo - ${payload.jobName} completed`;
  const body = failed
    ? truncate(payload.error, 160) ?? "Cron run failed."
    : truncate(payload.summary, 160) ?? "Cron run completed successfully.";

  return {
    title,
    body,
    tag: `cron-run:${payload.runId}:${payload.status}`,
    deepLink: payload.deepLink || "/",
  };
}

function extractBearerToken(req: Request): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

async function authenticateRequest(req: Request): Promise<boolean> {
  if (!PUSH_NOTIFY_SHARED_SECRET) return false;
  return extractBearerToken(req) === PUSH_NOTIFY_SHARED_SECRET;
}

async function loadJobContext(
  supabase: ReturnType<typeof createClient>,
  instanceId: string,
  jobId: string,
): Promise<{ name: string | null; delivery_channel: string | null }> {
  const { data, error } = await supabase
    .from("cron_jobs")
    .select("name, delivery_channel")
    .eq("instance_id", instanceId)
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load job context: ${error.message}`);
  }

  return {
    name: data?.name ?? null,
    delivery_channel: data?.delivery_channel ?? null,
  };
}

function shouldNotifyForDeliveryChannel(
  status: "ok" | "error",
  deliveryChannel: string | null,
): boolean {
  if (status === "error") return true;
  if (!deliveryChannel) return true;
  const normalized = deliveryChannel.toLowerCase();
  return normalized !== "telegram";
}

async function normalizeRequest(
  supabase: ReturnType<typeof createClient>,
  payload: LegacyPushNotifyRequest | WebhookPushNotifyRequest | null,
): Promise<NormalizedPushRequest | { ignored: string }> {
  if (!payload) {
    return { ignored: "missing_payload" };
  }

  if ("record" in payload) {
    const record = payload.record;
    if (!record?.id || !record.instance_id || !record.user_id || !record.job_id || !record.status) {
      return { ignored: "missing_webhook_record_fields" };
    }
    if (payload.table && payload.table !== "cron_runs") {
      return { ignored: "wrong_table" };
    }
    if (record.status !== "ok" && record.status !== "error") {
      return { ignored: "status_not_notifiable" };
    }
    if (payload.type === "UPDATE" && payload.old_record?.status === record.status) {
      return { ignored: "status_unchanged" };
    }

    const jobContext = await loadJobContext(supabase, record.instance_id, record.job_id);
    return {
      runId: record.id,
      instanceId: record.instance_id,
      userId: record.user_id,
      jobId: record.job_id,
      jobName: jobContext.name ?? record.job_id,
      status: record.status,
      timestamp: record.timestamp ?? null,
      summary: record.summary ?? null,
      error: record.error ?? null,
      deepLink: "/",
      deliveryChannel: jobContext.delivery_channel,
      source: payload.source ?? "managed-trigger",
      requestId: payload.request_id ?? null,
    };
  }

  if (!payload.runId || !payload.userId || !payload.jobId || !payload.status) {
    return { ignored: "missing_legacy_fields" };
  }
  if (payload.status !== "ok" && payload.status !== "error") {
    return { ignored: "status_not_notifiable" };
  }

  let deliveryChannel = payload.deliveryChannel ?? null;
  let jobName = payload.jobName || payload.jobId;
  if ((!deliveryChannel || !payload.jobName) && payload.instanceId) {
    const jobContext = await loadJobContext(supabase, payload.instanceId, payload.jobId);
    deliveryChannel = deliveryChannel ?? jobContext.delivery_channel;
    jobName = payload.jobName || jobContext.name || payload.jobId;
  }

  return {
    runId: payload.runId,
    instanceId: payload.instanceId || "unknown",
    userId: payload.userId,
    jobId: payload.jobId,
    jobName,
    status: payload.status,
    timestamp: payload.timestamp ?? null,
    summary: payload.summary ?? null,
    error: payload.error ?? null,
    deepLink: payload.deepLink || "/",
    deliveryChannel,
    source: payload.source ?? "plugin-sync",
    requestId: payload.requestId ?? null,
  };
}

async function getOrCreateEvent(
  supabase: ReturnType<typeof createClient>,
  request: NormalizedPushRequest,
  notification: ReturnType<typeof buildNotification>,
): Promise<{ row: PushEventRow; duplicate: boolean }> {
  const { data: existing, error: existingError } = await supabase
    .from("push_notification_events")
    .select("id, delivery_state, attempt_count")
    .eq("cron_run_id", request.runId)
    .eq("status", request.status)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to read dedupe row: ${existingError.message}`);
  }
  if (existing) {
    const duplicate =
      existing.delivery_state === "sent" ||
      existing.delivery_state === "no_subscriptions" ||
      existing.delivery_state === "suppressed";
    if (!duplicate) {
      await supabase
        .from("push_notification_events")
        .update({
          source: request.source,
          delivery_channel: request.deliveryChannel,
          request_id: request.requestId,
          notification_tag: notification.tag,
          title: notification.title,
          body: notification.body,
        })
        .eq("id", existing.id);
    }
    return { row: existing, duplicate };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("push_notification_events")
    .insert({
      cron_run_id: request.runId,
      instance_id: request.instanceId,
      user_id: request.userId,
      job_id: request.jobId,
      status: request.status,
      source: request.source,
      delivery_channel: request.deliveryChannel,
      request_id: request.requestId,
      delivery_state: "pending",
      notification_tag: notification.tag,
      title: notification.title,
      body: notification.body,
    })
    .select("id, delivery_state, attempt_count")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return getOrCreateEvent(supabase, request, notification);
    }
    throw new Error(`Failed to create dedupe row: ${insertError.message}`);
  }

  return { row: inserted, duplicate: false };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const authorized = await authenticateRequest(req);
  if (!authorized) {
    return json(401, { error: "Unauthorized" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Supabase credentials not configured" });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json(500, { error: "VAPID keys not configured" });
  }

  const payload = (await req.json().catch(() => null)) as LegacyPushNotifyRequest | WebhookPushNotifyRequest | null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let request: NormalizedPushRequest;
  try {
    const normalized = await normalizeRequest(supabase, payload);
    if ("ignored" in normalized) {
      return json(202, { ignored: true, reason: normalized.ignored });
    }
    request = normalized;
  } catch (err) {
    console.error("[push-notify] normalize error", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }

  if (!shouldNotifyForDeliveryChannel(request.status, request.deliveryChannel)) {
    const notification = buildNotification(request);
    const dedupe = await getOrCreateEvent(supabase, request, notification);
    await supabase
      .from("push_notification_events")
      .update({
        delivery_state: "suppressed",
        last_error: "suppressed:telegram_delivery_channel",
      })
      .eq("id", dedupe.row.id);
    return json(200, { ok: true, suppressed: "telegram_delivery_channel" });
  }

  const notification = buildNotification(request);

  let event: PushEventRow;
  try {
    const dedupe = await getOrCreateEvent(supabase, request, notification);
    event = dedupe.row;
    if (dedupe.duplicate) {
      console.log(`[push-notify] duplicate skip run=${request.runId} status=${request.status}`);
      return json(200, { ok: true, duplicate: true });
    }
  } catch (err) {
    console.error("[push-notify] dedupe error", err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }

  await supabase
    .from("push_notification_events")
    .update({
      delivery_state: "sending",
      attempt_count: (event.attempt_count ?? 0) + 1,
      last_attempted_at: new Date().toISOString(),
      next_retry_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      last_error: null,
    })
    .eq("id", event.id);

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys_p256dh, keys_auth")
    .eq("user_id", request.userId);

  if (subsError) {
    console.error("[push-notify] subscription lookup failed", subsError);
    await supabase
      .from("push_notification_events")
      .update({
        delivery_state: "failed",
        last_error: truncate(subsError.message, 400),
      })
      .eq("id", event.id);
    return json(500, { error: "Failed to fetch subscriptions" });
  }

  if (!subs || subs.length === 0) {
    console.log(`[push-notify] no subscriptions user=${request.userId} run=${request.runId}`);
    await supabase
      .from("push_notification_events")
      .update({
        delivery_state: "no_subscriptions",
        sent_count: 0,
        failed_count: 0,
        stale_deleted_count: 0,
        next_retry_at: null,
        last_error: "no_subscriptions",
      })
      .eq("id", event.id);
    return json(200, { ok: true, skipped: "no_subscriptions" });
  }

  const payloadBody = JSON.stringify(notification);
  let sentCount = 0;
  let failedCount = 0;
  let staleDeletedCount = 0;
  let lastError: string | null = null;

  for (const sub of subs) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
    };

    try {
      await webpush.sendNotification(pushSub, payloadBody);
      sentCount++;
    } catch (err) {
      failedCount++;
      const statusCode = (err as { statusCode?: number }).statusCode;
      lastError = truncate(err instanceof Error ? err.message : String(err), 400);
      console.error(
        `[push-notify] delivery failed run=${request.runId} endpoint=${sub.endpoint} status=${statusCode ?? "unknown"} error=${lastError ?? "unknown"}`
      );

      if (statusCode === 404 || statusCode === 410) {
        staleDeletedCount++;
        await supabase
          .from("push_subscriptions")
          .delete()
          .match({ user_id: request.userId, endpoint: sub.endpoint });
      }
    }
  }

  const deliveryState =
    sentCount > 0 ? "sent" : failedCount > 0 ? "failed" : "no_subscriptions";

  await supabase
    .from("push_notification_events")
    .update({
      delivery_state: deliveryState,
      sent_count: sentCount,
      failed_count: failedCount,
      stale_deleted_count: staleDeletedCount,
      delivered_at: sentCount > 0 ? new Date().toISOString() : null,
      next_retry_at: sentCount > 0 ? null : new Date(Date.now() + 5 * 60_000).toISOString(),
      last_error: lastError,
    })
    .eq("id", event.id);

  console.log(
    `[push-notify] completed run=${request.runId} status=${request.status} sent=${sentCount} failed=${failedCount} stale_deleted=${staleDeletedCount}`
  );

  if (sentCount === 0 && failedCount > 0) {
    return json(502, {
      error: "Push delivery failed",
      sent: sentCount,
      failed: failedCount,
    });
  }

  return json(200, {
    ok: true,
    sent: sentCount,
    failed: failedCount,
    staleDeleted: staleDeletedCount,
  });
});
