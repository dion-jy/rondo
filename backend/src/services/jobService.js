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

  // Token economy: burning rate, by-model breakdown, projections, cost estimates
  // Cost per million tokens: Sonnet $3 input / $15 output, Opus $15 input / $75 output
  const MODEL_COSTS = {
    'sonnet': { input: 3, output: 15 },
    'opus': { input: 15, output: 75 },
  };

  const byModel = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let oldestRunTs = Infinity;
  let newestRunTs = 0;

  for (const [, runs] of allRunsMap) {
    for (const r of runs) {
      const model = r.model || 'unknown';
      if (!byModel[model]) {
        byModel[model] = { runs: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0 };
      }
      byModel[model].runs++;
      const input = r.usage?.input_tokens || 0;
      const output = r.usage?.output_tokens || 0;
      const total = r.usage?.total_tokens || (input + output);
      byModel[model].totalTokens += total;
      byModel[model].inputTokens += input;
      byModel[model].outputTokens += output;
      totalInputTokens += input;
      totalOutputTokens += output;
      if (r.ts && r.ts < oldestRunTs) oldestRunTs = r.ts;
      if (r.ts && r.ts > newestRunTs) newestRunTs = r.ts;
    }
  }

  // Calculate burning rate from 7d window (more stable than 24h)
  const hoursIn7d = tokenCount7d > 0 ? Math.max((now - (now - week)) / 3600000, 1) : 1;
  const tokensPerHour7d = tokenCount7d / hoursIn7d;
  const burningRate = {
    perHour: Math.round(tokensPerHour7d),
    perDay: Math.round(tokensPerHour7d * 24),
    perWeek: Math.round(tokenCount7d),
  };

  const projectedMonthly = Math.round(burningRate.perDay * 30);

  // Cost estimate based on model breakdown
  let costEstimate = { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' };
  for (const [model, data] of Object.entries(byModel)) {
    const modelLower = model.toLowerCase();
    let rates = MODEL_COSTS.sonnet; // default to sonnet rates
    if (modelLower.includes('opus')) rates = MODEL_COSTS.opus;
    else if (modelLower.includes('sonnet')) rates = MODEL_COSTS.sonnet;

    costEstimate.inputCost += (data.inputTokens / 1_000_000) * rates.input;
    costEstimate.outputCost += (data.outputTokens / 1_000_000) * rates.output;
  }
  costEstimate.totalCost = costEstimate.inputCost + costEstimate.outputCost;
  costEstimate.inputCost = Math.round(costEstimate.inputCost * 100) / 100;
  costEstimate.outputCost = Math.round(costEstimate.outputCost * 100) / 100;
  costEstimate.totalCost = Math.round(costEstimate.totalCost * 100) / 100;

  // Projected monthly cost
  const historyDays = totalRuns > 0 && oldestRunTs < Infinity
    ? Math.max((newestRunTs - oldestRunTs) / 86400000, 1)
    : 1;
  const projectedMonthlyCost = Math.round((costEstimate.totalCost / historyDays) * 30 * 100) / 100;

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
    burningRate,
    byModel,
    projectedMonthly,
    costEstimate,
    projectedMonthlyCost,
  };
}

export function getConflicts(hours = 24) {
  const events = getTimeline(hours);
  const conflicts = [];
  const gaps = [];

  // Detect overlaps: each event has a duration = timeoutSeconds or 120s default
  const intervals = events.map(e => ({
    jobId: e.jobId,
    jobName: e.jobName,
    start: e.time,
    end: e.time + (e.timeoutSeconds || 120) * 1000,
  }));

  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      // Overlap if a.start < b.end && b.start < a.end
      if (a.start < b.end && b.start < a.end) {
        // Use the later start as the conflict time
        const conflictTime = Math.max(a.start, b.start);
        // Check if we already have a conflict at this exact time with these jobs
        const existing = conflicts.find(c =>
          c.time === conflictTime &&
          c.jobs.some(j2 => j2.id === a.jobId) &&
          c.jobs.some(j2 => j2.id === b.jobId)
        );
        if (!existing) {
          conflicts.push({
            time: conflictTime,
            jobs: [
              { id: a.jobId, name: a.jobName },
              { id: b.jobId, name: b.jobName },
            ],
            type: 'overlap',
          });
        }
      }
    }
  }

  // Detect gaps: periods > 2 hours where nothing is scheduled
  if (intervals.length > 0) {
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const now = Date.now();
    const windowEnd = now + hours * 3600000;
    const TWO_HOURS = 2 * 3600000;

    // Merge overlapping intervals to find covered periods
    const merged = [{ start: sorted[0].start, end: sorted[0].end }];
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      if (sorted[i].start <= last.end) {
        last.end = Math.max(last.end, sorted[i].end);
      } else {
        merged.push({ start: sorted[i].start, end: sorted[i].end });
      }
    }

    // Check gap from now to first event
    if (merged[0].start - now > TWO_HOURS) {
      gaps.push({
        start: now,
        end: merged[0].start,
        durationMs: merged[0].start - now,
      });
    }

    // Check gaps between merged intervals
    for (let i = 1; i < merged.length; i++) {
      const gapStart = merged[i - 1].end;
      const gapEnd = merged[i].start;
      if (gapEnd - gapStart > TWO_HOURS) {
        gaps.push({
          start: gapStart,
          end: gapEnd,
          durationMs: gapEnd - gapStart,
        });
      }
    }

    // Check gap from last event to window end
    const lastEnd = merged[merged.length - 1].end;
    if (windowEnd - lastEnd > TWO_HOURS) {
      gaps.push({
        start: lastEnd,
        end: windowEnd,
        durationMs: windowEnd - lastEnd,
      });
    }
  } else {
    // No events at all — entire window is a gap
    const now = Date.now();
    const windowEnd = now + hours * 3600000;
    gaps.push({
      start: now,
      end: windowEnd,
      durationMs: hours * 3600000,
    });
  }

  return { conflicts, gaps };
}

export function getSuggestions() {
  const jobs = getJobs().map(enrichJob);
  const allRunsMap = getAllRuns();
  const suggestions = [];

  for (const job of jobs) {
    // Jobs that consistently fail
    if (job.consecutiveErrors > 0) {
      suggestions.push({
        type: 'failing_job',
        severity: job.consecutiveErrors >= 3 ? 'high' : 'medium',
        message: `"${job.name}" has ${job.consecutiveErrors} consecutive error(s). Check its configuration or target.`,
        jobId: job.id,
        details: { consecutiveErrors: job.consecutiveErrors },
      });
    }

    // Jobs with schedule errors
    if (job.state?.lastError && job.state.lastError.includes('schedule')) {
      suggestions.push({
        type: 'schedule_error',
        severity: 'high',
        message: `"${job.name}" has a schedule-related error.`,
        jobId: job.id,
        details: { error: job.state.lastError },
      });
    }

    // Disabled jobs that might need attention
    if (!job.enabled) {
      const runs = allRunsMap.get(job.id) || [];
      const hasRecentRuns = runs.some(r => r.ts && r.ts > Date.now() - 7 * 86400000);
      suggestions.push({
        type: 'disabled_job',
        severity: 'low',
        message: `"${job.name}" is disabled.${hasRecentRuns ? ' It had recent activity — consider re-enabling or removing it.' : ' Consider removing it if no longer needed.'}`,
        jobId: job.id,
        details: { hasRecentRuns },
      });
    }

    // Jobs that always succeed and could be run less frequently
    if (job.enabled && job.scheduleKind === 'recurring') {
      const runs = allRunsMap.get(job.id) || [];
      if (runs.length >= 10) {
        const recent = runs.slice(0, 20);
        const allSuccess = recent.every(r => r.status === 'ok');
        if (allSuccess) {
          suggestions.push({
            type: 'reduce_frequency',
            severity: 'low',
            message: `"${job.name}" has succeeded in all recent runs. Consider reducing frequency to save tokens.`,
            jobId: job.id,
            details: { recentRunCount: recent.length, allSuccess: true },
          });
        }
      }
    }
  }

  // Gaps where new tasks could be scheduled
  const { gaps } = getConflicts(24);
  for (const gap of gaps) {
    if (gap.durationMs > 4 * 3600000) {
      suggestions.push({
        type: 'schedule_gap',
        severity: 'low',
        message: `${Math.round(gap.durationMs / 3600000)}h gap from ${new Date(gap.start).toISOString()} to ${new Date(gap.end).toISOString()}. Consider scheduling tasks here.`,
        details: { start: gap.start, end: gap.end, durationMs: gap.durationMs },
      });
    }
  }

  return { suggestions };
}

function parseEveryString(every) {
  if (!every) return 0;
  const match = every.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 0;
  const val = parseInt(match[1]);
  return val * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
}
