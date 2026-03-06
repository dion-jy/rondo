import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const API = '/api/jobs';

function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch {}
    };
    ws.onclose = () => setTimeout(() => { wsRef.current = null; }, 3000);
    wsRef.current = ws;
    return () => ws.close();
  }, []);
}

function StatusBadge({ status }) {
  const label = status === 'ok' ? 'success' : status;
  const cls = status === 'ok' ? 'success' : status === 'error' ? 'failed' : status === 'running' ? 'running' : 'disabled';
  return <span className={`status ${cls}`}>{label}</span>;
}

function formatDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(n) {
  if (!n) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function timeUntil(ms) {
  if (!ms) return '—';
  const diff = ms - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 60000) return 'in <1m';
  if (diff < 3600000) return `in ${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `in ${Math.floor(diff / 3600000)}h`;
  return `in ${Math.floor(diff / 86400000)}d`;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ stats, jobs }) {
  if (!stats) return null;
  const failedJobs = jobs.filter(j => j.lastRun?.status === 'error' || j.consecutiveErrors > 0);

  return (
    <div className="dashboard">
      <div className="stats-grid">
        <StatCard label="Total Jobs" value={stats.totalJobs} sub={`${stats.enabled} active / ${stats.disabled} disabled`} />
        <StatCard label="Success Rate" value={`${stats.successRate}%`} sub={`${stats.successRuns} ok / ${stats.errorRuns} errors`} cls={stats.successRate >= 90 ? 'good' : stats.successRate >= 70 ? 'warn' : 'bad'} />
        <StatCard label="Runs (24h)" value={stats.runCount24h} sub={`${stats.runCount7d} this week`} />
        <StatCard label="Avg Duration" value={formatDuration(stats.avgDurationMs)} sub={`across ${stats.totalRuns} runs`} />
        <StatCard label="Tokens (24h)" value={formatTokens(stats.tokenCount24h)} sub={`${formatTokens(stats.tokenCount7d)} this week`} />
        <StatCard label="Daily Burn" value={`${Math.round(stats.estimatedDailySessionSeconds / 60)}min`} sub={`~${formatTokens(stats.estimatedDailyTokens)} tokens/day`} />
      </div>

      {failedJobs.length > 0 && (
        <div className="alert-section">
          <h3>Failed Jobs</h3>
          {failedJobs.map(j => (
            <div key={j.id} className="alert-row">
              <span className="alert-name">{j.name}</span>
              <StatusBadge status="error" />
              <span className="alert-detail">
                {j.consecutiveErrors > 0 && `${j.consecutiveErrors} consecutive errors`}
                {j.lastRun?.summary && ` — ${j.lastRun.summary}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, cls }) {
  return (
    <div className={`stat-card ${cls || ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

// ─── Job List ─────────────────────────────────────────────────────────────────

function JobList({ jobs, onSelectJob }) {
  return (
    <div className="section">
      <h2>Cron Jobs ({jobs.length})</h2>
      <div className="job-list">
        {jobs.map(job => (
          <div key={job.id} className={`job-card ${!job.enabled ? 'disabled' : ''} ${job.consecutiveErrors > 0 ? 'has-errors' : ''}`} onClick={() => onSelectJob(job)}>
            <div className="job-header">
              <div className="job-title-row">
                <span className="job-name">{job.name}</span>
                <span className={`schedule-badge ${job.scheduleKind}`}>{job.scheduleLabel}</span>
              </div>
              <div className="job-status-row">
                {!job.enabled && <StatusBadge status="disabled" />}
                {job.lastRun && <StatusBadge status={job.lastRun.status} />}
              </div>
            </div>
            <div className="job-detail-row">
              {job.payload?.message && (
                <span className="job-message">{job.payload.message.slice(0, 80)}{job.payload.message.length > 80 ? '...' : ''}</span>
              )}
            </div>
            <div className="job-meta">
              <span className="meta-item">
                <span className="meta-label">Last:</span> {job.lastRun ? timeAgo(job.lastRun.ts) : 'never'}
              </span>
              <span className="meta-item">
                <span className="meta-label">Next:</span> {job.enabled ? timeUntil(job.nextRunAtMs) : '—'}
              </span>
              {job.lastRun?.durationMs && (
                <span className="meta-item">
                  <span className="meta-label">Duration:</span> {formatDuration(job.lastRun.durationMs)}
                </span>
              )}
              {job.lastRun?.model && (
                <span className="meta-item">
                  <span className="meta-label">Model:</span> {job.lastRun.model}
                </span>
              )}
              {job.delivery?.channel && (
                <span className="meta-item delivery-badge">{job.delivery.channel}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Job Detail Modal ─────────────────────────────────────────────────────────

function JobDetail({ jobId, onClose }) {
  const [job, setJob] = useState(null);
  useEffect(() => {
    fetch(`${API}/${jobId}`).then(r => r.json()).then(setJob).catch(() => {});
  }, [jobId]);

  if (!job) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{job.name}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="detail-grid">
          <div className="detail-item"><span className="detail-label">Schedule</span><span>{job.scheduleLabel}</span></div>
          <div className="detail-item"><span className="detail-label">Status</span><StatusBadge status={job.enabled ? (job.lastRun?.status || 'ok') : 'disabled'} /></div>
          <div className="detail-item"><span className="detail-label">Next Run</span><span>{job.enabled ? timeUntil(job.nextRunAtMs) : 'disabled'}</span></div>
          <div className="detail-item"><span className="detail-label">Timeout</span><span>{job.timeoutSeconds ? `${job.timeoutSeconds}s` : 'default'}</span></div>
          {job.delivery?.channel && <div className="detail-item"><span className="detail-label">Delivery</span><span>{job.delivery.channel}{job.delivery.to ? ` → ${job.delivery.to}` : ''}</span></div>}
        </div>
        {job.payload?.message && (
          <div className="detail-message">
            <span className="detail-label">Message</span>
            <pre>{job.payload.message}</pre>
          </div>
        )}
        <div className="detail-runs">
          <h4>Run History ({job.allRuns?.length || 0})</h4>
          <div className="runs-table">
            {(job.allRuns || []).slice(0, 50).map((r, i) => (
              <div key={i} className="run-row">
                <span className="run-time">{new Date(r.ts).toLocaleString()}</span>
                <StatusBadge status={r.status} />
                <span className="run-duration">{formatDuration(r.durationMs)}</span>
                <span className="run-model">{r.model || ''}</span>
                <span className="run-tokens">{r.usage ? `${formatTokens(r.usage.total_tokens)} tok` : ''}</span>
                <span className="run-summary">{r.summary?.slice(0, 60) || ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 24h Timeline ─────────────────────────────────────────────────────────────

function Timeline({ timeline }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const now = new Date();
  const currentHour = now.getHours();

  const slotMap = useMemo(() => {
    const map = {};
    for (let h = 0; h < 24; h++) map[h] = [];
    for (const evt of timeline) {
      const d = new Date(evt.time);
      const today = new Date();
      // Only show events within next 24h
      if (d.getTime() - Date.now() > 86400000) continue;
      const h = d.getHours();
      map[h].push(evt);
    }
    return map;
  }, [timeline]);

  const maxInSlot = Math.max(1, ...Object.values(slotMap).map(s => s.length));

  return (
    <div className="section">
      <h2>24-Hour Timeline</h2>
      <div className="timeline-24h">
        {hours.map(h => {
          const events = slotMap[h] || [];
          const isEmpty = events.length === 0;
          const isPast = h < currentHour;
          const isCurrent = h === currentHour;
          return (
            <div key={h} className={`timeline-slot ${isEmpty ? 'empty' : ''} ${isPast ? 'past' : ''} ${isCurrent ? 'current' : ''}`}>
              <div className="slot-hour">{String(h).padStart(2, '0')}:00</div>
              <div className="slot-bar-container">
                <div className="slot-bar" style={{ width: `${(events.length / maxInSlot) * 100}%` }} />
              </div>
              <div className="slot-events">
                {events.slice(0, 5).map((evt, i) => (
                  <div key={i} className={`slot-event ${evt.kind}`} title={`${evt.jobName} @ ${new Date(evt.time).toLocaleTimeString()}`}>
                    <span className="event-time">{new Date(evt.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                    <span className="event-name">{evt.jobName}</span>
                    {evt.timeoutSeconds && <span className="event-timeout">{evt.timeoutSeconds}s</span>}
                  </div>
                ))}
                {events.length > 5 && <span className="slot-overflow">+{events.length - 5} more</span>}
              </div>
              {isEmpty && <div className="slot-idle">idle</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Execution Log ────────────────────────────────────────────────────────────

function Executions({ jobs }) {
  const allRuns = useMemo(() => {
    const runs = [];
    for (const job of jobs) {
      for (const r of (job.recentRuns || [])) {
        runs.push({ ...r, jobName: job.name, jobId: job.id });
      }
    }
    return runs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }, [jobs]);

  return (
    <div className="section">
      <h2>Recent Executions</h2>
      {allRuns.length === 0 && <p className="muted">No executions yet</p>}
      <div className="exec-list">
        {allRuns.map((r, i) => (
          <div key={i} className="exec-row">
            <span className="exec-time">{r.ts ? new Date(r.ts).toLocaleString() : '—'}</span>
            <span className="exec-job">{r.jobName}</span>
            <StatusBadge status={r.status} />
            <span className="exec-duration">{formatDuration(r.durationMs)}</span>
            <span className="exec-model">{r.model || ''}</span>
            <span className="exec-tokens">{r.usage ? formatTokens(r.usage.total_tokens) : ''}</span>
            <span className="exec-summary">{r.summary?.slice(0, 80) || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Token Economy ────────────────────────────────────────────────────────────

function TokenEconomy({ stats, jobs }) {
  if (!stats) return null;

  const jobBurn = useMemo(() => {
    return jobs
      .filter(j => j.enabled)
      .map(j => {
        const timeout = j.timeoutSeconds || 120;
        const s = j.schedule;
        let runsPerDay = 0;
        if (s?.kind === 'every') {
          const ms = s.everyMs || parseEvery(s.every);
          if (ms > 0) runsPerDay = 86400000 / ms;
        }
        const avgTokens = j.recentRuns?.length
          ? j.recentRuns.reduce((sum, r) => sum + (r.usage?.total_tokens || 0), 0) / j.recentRuns.length
          : 0;
        return {
          name: j.name,
          runsPerDay: Math.round(runsPerDay * 10) / 10,
          dailySessionMinutes: Math.round((runsPerDay * timeout) / 60 * 10) / 10,
          avgTokensPerRun: Math.round(avgTokens),
          estimatedDailyTokens: Math.round(runsPerDay * avgTokens),
          model: j.lastRun?.model || '—',
        };
      })
      .filter(j => j.runsPerDay > 0)
      .sort((a, b) => b.estimatedDailyTokens - a.estimatedDailyTokens);
  }, [jobs]);

  return (
    <div className="section">
      <h2>Token Economy</h2>
      <div className="stats-grid narrow">
        <StatCard label="Est. Daily Session" value={`${Math.round(stats.estimatedDailySessionSeconds / 60)}min`} sub="based on timeoutSeconds" />
        <StatCard label="Est. Daily Tokens" value={formatTokens(stats.estimatedDailyTokens)} sub="extrapolated from 7d avg" />
        <StatCard label="7-Day Total" value={formatTokens(stats.tokenCount7d)} sub={`${stats.runCount7d} runs`} />
        <StatCard label="All-Time Tokens" value={formatTokens(stats.totalTokens)} sub={`${stats.totalRuns} total runs`} />
      </div>

      <h3 className="subsection-title">Per-Job Burn Rate</h3>
      <div className="burn-table">
        <div className="burn-header">
          <span>Job</span>
          <span>Model</span>
          <span>Runs/Day</span>
          <span>Session/Day</span>
          <span>Avg Tokens</span>
          <span>Daily Tokens</span>
        </div>
        {jobBurn.map((j, i) => (
          <div key={i} className="burn-row">
            <span className="burn-name">{j.name}</span>
            <span className="burn-model">{j.model}</span>
            <span>{j.runsPerDay}</span>
            <span>{j.dailySessionMinutes}min</span>
            <span>{formatTokens(j.avgTokensPerRun)}</span>
            <span className="burn-tokens">{formatTokens(j.estimatedDailyTokens)}</span>
          </div>
        ))}
        {jobBurn.length === 0 && <p className="muted">No recurring jobs with run data</p>}
      </div>
    </div>
  );
}

function parseEvery(every) {
  if (!every) return 0;
  const m = every.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return 0;
  return parseInt(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
}

// ─── App ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'executions', label: 'Executions' },
  { key: 'tokens', label: 'Tokens' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [jobs, setJobs] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [jobsRes, tlRes, statsRes] = await Promise.all([
        fetch(API),
        fetch(`${API}/timeline?hours=24`),
        fetch(`${API}/stats`),
      ]);
      setJobs(await jobsRes.json());
      setTimeline(await tlRes.json());
      setStats(await statsRes.json());
      setLastUpdate(new Date());
    } catch (e) { console.error('Fetch error:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useWebSocket((msg) => {
    if (msg.type === 'jobs' || msg.type === 'runs' || msg.type === 'connected') {
      refresh();
    }
  });

  if (loading) {
    return (
      <div className="app">
        <div className="header"><h1>Rondo</h1></div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 60 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <h1>Rondo</h1>
          <span className="header-sub">AI Productivity Control Tower</span>
        </div>
        {lastUpdate && (
          <span className="last-update">Updated {lastUpdate.toLocaleTimeString()}</span>
        )}
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <Dashboard stats={stats} jobs={jobs} />}
      {tab === 'jobs' && <JobList jobs={jobs} onSelectJob={(j) => setSelectedJob(j.id)} />}
      {tab === 'timeline' && <Timeline timeline={timeline} />}
      {tab === 'executions' && <Executions jobs={jobs} />}
      {tab === 'tokens' && <TokenEconomy stats={stats} jobs={jobs} />}

      {selectedJob && <JobDetail jobId={selectedJob} onClose={() => setSelectedJob(null)} />}
    </div>
  );
}
