import { getJobs, getRuns, getAllRuns } from '../openclawData.js';

function formatSchedule(schedule) {
  if (!schedule) return { label: 'unknown', kind: 'unknown' };
  const { kind } = schedule;
  if (kind === 'every') {
    const ms = schedule.everyMs;
    if (!ms) return { label: schedule.every || 'interval', kind: 'recurring' };
    if (ms >= 86400000) return { label: `every ${Math.round(ms / 86400000)}d`, kind: 'recurring' };
    if (ms >= 3600000) return { label: `every ${Math.round(ms / 3600000)}h`, kind: 'recurring' };
    if (ms >= 60000) return { label: `every ${Math.round(ms / 60000)}m`, kind: 'recurring' };
    return { label: `every ${Math.round(ms / 1000)}s`, kind: 'recurring' };
  }
  if (kind === 'cron') return { label: `cron: ${schedule.expr}`, kind: 'recurring' };
  if (kind === 'once' || kind === 'at') return { label: `once: ${schedule.at || ''}`, kind: 'once' };
  return { label: kind, kind };
}

function computeNextRun(job) {
  if (job.state?.nextRunAtMs) return job.state.nextRunAtMs;
  const s = job.schedule;
  if (!s) return null;
  if (s.kind === 'every' && s.everyMs && s.anchorMs) {
    const now = Date.now();
    const elapsed = now - s.anchorMs;
    const periods = Math.ceil(elapsed / s.everyMs);
    return s.anchorMs + periods * s.everyMs;
  }
  if ((s.kind === 'once' || s.kind === 'at') && s.at) {
    return new Date(s.at).getTime();
  }
  return null;
}

function enrichJob(job) {
  const runs = getRuns(job.id);
  const sched = formatSchedule(job.schedule);
  const lastRun = runs[0] || null;
  const nextRunAtMs = computeNextRun(job);

  return {
    id: job.id,
    name: job.name,
    enabled: job.enabled,
    scheduleLabel: sched.label,
    scheduleKind: sched.kind,
    schedule: job.schedule,
    payload: job.payload,
    delivery: job.delivery,
    sessionTarget: job.sessionTarget,
    createdAtMs: job.createdAtMs,
    updatedAtMs: job.updatedAtMs,
    nextRunAtMs,
    state: job.state || {},
    lastRun: lastRun ? {
      ts: lastRun.ts,
      status: lastRun.status,
      summary: lastRun.summary || lastRun.error || '',
      durationMs: lastRun.durationMs,
      model: lastRun.model,
      provider: lastRun.provider,
      usage: lastRun.usage,
    } : null,
    recentRuns: runs.slice(0, 10).map(r => ({
      ts: r.ts,
      status: r.status,
      summary: r.summary || r.error || '',
      durationMs: r.durationMs,
      model: r.model,
      provider: r.provider,
      usage: r.usage,
    })),
    consecutiveErrors: job.state?.consecutiveErrors || 0,
    timeoutSeconds: job.payload?.timeoutSeconds || null,
  };
}

export function getAllJobs() {
  return getJobs().map(enrichJob);
}

export function getJobById(id) {
  const job = getJobs().find(j => j.id === id);
  if (!job) return null;
  const enriched = enrichJob(job);
  enriched.allRuns = getRuns(id).map(r => ({
    ts: r.ts,
    runAtMs: r.runAtMs,
    status: r.status,
    summary: r.summary || r.error || '',
    durationMs: r.durationMs,
    model: r.model,
    provider: r.provider,
    usage: r.usage,
    delivered: r.delivered,
    deliveryStatus: r.deliveryStatus,
    sessionId: r.sessionId,
    nextRunAtMs: r.nextRunAtMs,
  }));
  return enriched;
}

export function getTimeline(hours = 24) {
  const jobs = getJobs().filter(j => j.enabled);
  const now = Date.now();
  const end = now + hours * 3600000;
  const events = [];

  for (const job of jobs) {
    const s = job.schedule;
    if (!s) continue;

    if (s.kind === 'every' && s.everyMs && s.anchorMs) {
      const elapsed = now - s.anchorMs;
      let nextPeriod = Math.ceil(elapsed / s.everyMs);
      let nextTime = s.anchorMs + nextPeriod * s.everyMs;
      let count = 0;
      while (nextTime <= end && count < 100) {
        if (nextTime >= now) {
          events.push({
            jobId: job.id,
            jobName: job.name,
            time: nextTime,
            kind: 'recurring',
            timeoutSeconds: job.payload?.timeoutSeconds || null,
          });
        }
        nextPeriod++;
        nextTime = s.anchorMs + nextPeriod * s.everyMs;
        count++;
      }
    } else if (s.kind === 'every' && s.every) {
      // Parse "3h" style
      const match = s.every.match(/^(\d+)(s|m|h|d)$/);
      if (match) {
        const val = parseInt(match[1]);
        const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
        const interval = val * unit;
        const anchor = s.anchorMs || job.createdAtMs || now;
        const elapsed = now - anchor;
        let nextPeriod = Math.ceil(elapsed / interval);
        let nextTime = anchor + nextPeriod * interval;
        let count = 0;
        while (nextTime <= end && count < 100) {
          if (nextTime >= now) {
            events.push({
              jobId: job.id,
              jobName: job.name,
              time: nextTime,
              kind: 'recurring',
              timeoutSeconds: job.payload?.timeoutSeconds || null,
            });
          }
          nextPeriod++;
          nextTime = anchor + nextPeriod * interval;
          count++;
        }
      }
    } else if ((s.kind === 'once' || s.kind === 'at') && s.at) {
      const t = new Date(s.at).getTime();
      if (t >= now && t <= end) {
        events.push({
          jobId: job.id,
          jobName: job.name,
          time: t,
          kind: 'once',
          timeoutSeconds: job.payload?.timeoutSeconds || null,
        });
      }
    }
  }

  return events.sort((a, b) => a.time - b.time);
}

export function getStats() {
  const jobs = getJobs();
  const allRunsMap = getAllRuns();
  const enabled = jobs.filter(j => j.enabled).length;
  const disabled = jobs.length - enabled;

  let totalRuns = 0;
  let successRuns = 0;
  let errorRuns = 0;
  let totalDurationMs = 0;
  let totalTokens = 0;
  let runCount24h = 0;
  let tokenCount24h = 0;
  const now = Date.now();
  const day = 86400000;
  const week = 7 * day;
  let tokenCount7d = 0;
  let runCount7d = 0;

  for (const [, runs] of allRunsMap) {
    for (const r of runs) {
      totalRuns++;
      if (r.status === 'ok') successRuns++;
      else if (r.status === 'error') errorRuns++;
      if (r.durationMs) totalDurationMs += r.durationMs;
      const tokens = r.usage?.total_tokens || 0;
      totalTokens += tokens;
      if (r.ts && r.ts > now - day) {
        runCount24h++;
        tokenCount24h += tokens;
      }
      if (r.ts && r.ts > now - week) {
        runCount7d++;
        tokenCount7d += tokens;
      }
    }
  }

  // Estimate daily burn from timeoutSeconds
  let estimatedDailySessionSeconds = 0;
  for (const job of jobs.filter(j => j.enabled)) {
    const timeout = job.payload?.timeoutSeconds || 120;
    const s = job.schedule;
    let runsPerDay = 0;
    if (s?.kind === 'every') {
      const ms = s.everyMs || parseEveryString(s.every);
      if (ms > 0) runsPerDay = day / ms;
    }
    estimatedDailySessionSeconds += runsPerDay * timeout;
  }

  return {
    totalJobs: jobs.length,
    enabled,
    disabled,
    totalRuns,
    successRuns,
    errorRuns,
    successRate: totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0,
    avgDurationMs: totalRuns > 0 ? Math.round(totalDurationMs / totalRuns) : 0,
    totalTokens,
    tokenCount24h,
    tokenCount7d,
    runCount24h,
    runCount7d,
    estimatedDailySessionSeconds: Math.round(estimatedDailySessionSeconds),
    estimatedDailyTokens: tokenCount7d > 0 && runCount7d > 0
      ? Math.round((tokenCount7d / runCount7d) * (runCount24h || 1))
      : 0,
  };
}

function parseEveryString(every) {
  if (!every) return 0;
  const match = every.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 0;
  const val = parseInt(match[1]);
  return val * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
}
