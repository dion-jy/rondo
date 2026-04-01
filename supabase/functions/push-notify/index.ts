import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import webpush from "npm:web-push@3.6.7";

type PushNotifyRequest = {
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
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function buildNotification(payload: Required<Pick<PushNotifyRequest, "runId" | "jobName" | "status">> & Pick<PushNotifyRequest, "summary" | "error" | "deepLink">) {
  const failed = payload.status === "error";
  const title = failed ? `Rondo — ${payload.jobName} failed` : `Rondo — ${payload.jobName} completed`;
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

async function getOrCreateEvent(
  supabase: ReturnType<typeof createClient>,
  request: Required<Pick<PushNotifyRequest, "runId" | "instanceId" | "userId" | "jobId" | "status">>,
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
    const duplicate = existing.delivery_state === "sent" || existing.delivery_state === "no_subscriptions";
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
      source: "plugin-sync",
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

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!PUSH_NOTIFY_SHARED_SECRET || token !== PUSH_NOTIFY_SHARED_SECRET) {
    return json(401, { error: "Unauthorized" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Supabase credentials not configured" });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json(500, { error: "VAPID keys not configured" });
  }

  const body = (await req.json().catch(() => null)) as PushNotifyRequest | null;
  if (!body?.runId || !body.userId || !body.jobId || !body.status) {
    return json(400, { error: "Missing required fields" });
  }
  if (body.status !== "ok" && body.status !== "error") {
    return json(202, { ignored: true, reason: "status_not_notifiable" });
  }

  const notification = buildNotification({
    runId: body.runId,
    jobName: body.jobName || body.jobId,
    status: body.status,
    summary: body.summary,
    error: body.error,
    deepLink: body.deepLink,
  });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let event: PushEventRow;
  try {
    const dedupe = await getOrCreateEvent(supabase, {
      runId: body.runId,
      instanceId: body.instanceId || "unknown",
      userId: body.userId,
      jobId: body.jobId,
      status: body.status,
    }, notification);
    event = dedupe.row;
    if (dedupe.duplicate) {
      console.log(`[push-notify] duplicate skip run=${body.runId} status=${body.status}`);
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
      last_error: null,
    })
    .eq("id", event.id);

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys_p256dh, keys_auth")
    .eq("user_id", body.userId);

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
    console.log(`[push-notify] no subscriptions user=${body.userId} run=${body.runId}`);
    await supabase
      .from("push_notification_events")
      .update({
        delivery_state: "no_subscriptions",
        sent_count: 0,
        failed_count: 0,
        stale_deleted_count: 0,
        last_error: "no_subscriptions",
      })
      .eq("id", event.id);
    return json(200, { ok: true, skipped: "no_subscriptions" });
  }

  const payload = JSON.stringify(notification);
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
      await webpush.sendNotification(pushSub, payload);
      sentCount++;
    } catch (err) {
      failedCount++;
      const statusCode = (err as { statusCode?: number }).statusCode;
      lastError = truncate(
        err instanceof Error ? err.message : String(err),
        400,
      );
      console.error(
        `[push-notify] delivery failed run=${body.runId} endpoint=${sub.endpoint} status=${statusCode ?? "unknown"} error=${lastError ?? "unknown"}`
      );

      if (statusCode === 404 || statusCode === 410) {
        staleDeletedCount++;
        await supabase
          .from("push_subscriptions")
          .delete()
          .match({ user_id: body.userId, endpoint: sub.endpoint });
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
      last_error: lastError,
    })
    .eq("id", event.id);

  console.log(
    `[push-notify] completed run=${body.runId} status=${body.status} sent=${sentCount} failed=${failedCount} stale_deleted=${staleDeletedCount}`
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
