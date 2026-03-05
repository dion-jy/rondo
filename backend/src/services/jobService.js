import { getDb, persist } from '../db.js';
import cronParser from 'cron-parser';

export function getAllJobs() {
  const db = getDb();
  return db.jobs.map(j => ({
    ...j,
    recent_executions: db.executions
      .filter(e => e.job_id === j.id)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, 5),
    next_runs: getNextRuns(j.expression, 5),
  }));
}

export function getJobById(id) {
  const db = getDb();
  const job = db.jobs.find(j => j.id === id);
  if (!job) return null;
  return {
    ...job,
    executions: db.executions.filter(e => e.job_id === id).sort((a, b) => b.started_at.localeCompare(a.started_at)),
    next_runs: getNextRuns(job.expression, 10),
  };
}

export function createJob({ name, expression, command, enabled = true }) {
  if (!name || !expression || !command) throw new Error('name, expression, command are required');
  validateExpression(expression);
  const db = getDb();
  const now = new Date().toISOString();
  const job = { id: db.nextJobId++, name, expression, command, enabled, created_at: now, updated_at: now };
  db.jobs.push(job);
  persist();
  return getJobById(job.id);
}

export function updateJob(id, { name, expression, command, enabled }) {
  const db = getDb();
  const job = db.jobs.find(j => j.id === id);
  if (!job) return null;
  if (expression) validateExpression(expression);
  if (name !== undefined) job.name = name;
  if (expression !== undefined) job.expression = expression;
  if (command !== undefined) job.command = command;
  if (enabled !== undefined) job.enabled = enabled;
  job.updated_at = new Date().toISOString();
  persist();
  return getJobById(id);
}

export function deleteJob(id) {
  const db = getDb();
  const idx = db.jobs.findIndex(j => j.id === id);
  if (idx === -1) return false;
  db.jobs.splice(idx, 1);
  db.executions = db.executions.filter(e => e.job_id !== id);
  persist();
  return true;
}

export function getSchedule(days = 7) {
  const db = getDb();
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  const events = [];

  for (const job of db.jobs.filter(j => j.enabled)) {
    try {
      const interval = cronParser.parseExpression(job.expression, { currentDate: now, endDate: end, iterator: true });
      let count = 0;
      while (count < 50) {
        try {
          const next = interval.next();
          if (next.done) break;
          events.push({ job_id: job.id, job_name: job.name, time: next.value.toISOString() });
          count++;
        } catch { break; }
      }
    } catch { /* skip */ }
  }
  return events.sort((a, b) => a.time.localeCompare(b.time));
}

function getNextRuns(expression, count) {
  try {
    const interval = cronParser.parseExpression(expression, { iterator: true });
    const runs = [];
    for (let i = 0; i < count; i++) {
      try {
        const next = interval.next();
        if (next.done) break;
        runs.push(next.value.toISOString());
      } catch { break; }
    }
    return runs;
  } catch { return []; }
}

function validateExpression(expr) {
  try { cronParser.parseExpression(expr); }
  catch { throw new Error(`Invalid cron expression: ${expr}`); }
}
