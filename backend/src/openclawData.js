import { readFileSync, readdirSync, watch, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';

const CRON_DIR = join(homedir(), '.openclaw', 'cron');
const JOBS_PATH = join(CRON_DIR, 'jobs.json');
const RUNS_DIR = join(CRON_DIR, 'runs');

export const emitter = new EventEmitter();

let cachedJobs = [];
let cachedRuns = new Map(); // jobId -> runs[]

export function loadJobs() {
  try {
    const raw = JSON.parse(readFileSync(JOBS_PATH, 'utf8'));
    cachedJobs = raw.jobs || [];
  } catch (e) {
    console.error('Failed to read jobs.json:', e.message);
    cachedJobs = [];
  }
  return cachedJobs;
}

export function loadRunsForJob(jobId) {
  const filePath = join(RUNS_DIR, `${jobId}.jsonl`);
  try {
    const lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    const runs = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    runs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    cachedRuns.set(jobId, runs);
    return runs;
  } catch {
    return [];
  }
}

export function loadAllRuns() {
  if (!existsSync(RUNS_DIR)) return;
  try {
    const files = readdirSync(RUNS_DIR).filter(f => f.endsWith('.jsonl'));
    for (const f of files) {
      const jobId = f.replace('.jsonl', '');
      loadRunsForJob(jobId);
    }
  } catch (e) {
    console.error('Failed to read runs dir:', e.message);
  }
}

export function getJobs() { return cachedJobs; }
export function getRuns(jobId) { return cachedRuns.get(jobId) || []; }
export function getAllRuns() { return cachedRuns; }

// Initial load
loadJobs();
loadAllRuns();

// Watch for changes
function startWatching() {
  try {
    watch(JOBS_PATH, { persistent: false }, () => {
      loadJobs();
      emitter.emit('update', { type: 'jobs' });
    });
  } catch (e) {
    console.error('Cannot watch jobs.json:', e.message);
  }

  try {
    if (existsSync(RUNS_DIR)) {
      watch(RUNS_DIR, { persistent: false, recursive: false }, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
          const jobId = filename.replace('.jsonl', '');
          loadRunsForJob(jobId);
          emitter.emit('update', { type: 'runs', jobId });
        }
      });
    }
  } catch (e) {
    console.error('Cannot watch runs dir:', e.message);
  }
}

startWatching();
