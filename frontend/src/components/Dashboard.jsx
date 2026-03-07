import { useState } from 'react';
import { useFetch } from '../hooks/useApi';
import { formatDuration, formatTokens, timeAgo } from '../utils/format';
import LoadingSpinner from './common/LoadingSpinner';
import EmptyState from './common/EmptyState';
import StatCard from './common/StatCard';
import StatusBadge from './common/StatusBadge';

function SeverityIcon({ severity }) {
  if (severity === 'high') {
    return (
      <svg className="h-5 w-5 shrink-0 text-error" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    );
  }
  if (severity === 'medium') {
    return (
      <svg className="h-5 w-5 shrink-0 text-warning" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5 shrink-0 text-running" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  );
}

function severityBorderClass(severity) {
  const colors = {
    high: 'border-l-error',
    medium: 'border-l-warning',
    low: 'border-l-running',
  };
  return colors[severity] || 'border-l-gray-500';
}

function SuggestionsPanel({ suggestions }) {
  const [expanded, setExpanded] = useState(false);

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  const visible = expanded ? suggestions : suggestions.slice(0, 3);
  const hasMore = suggestions.length > 3;

  return (
    <div className="rounded-lg border border-border bg-bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-200">Suggestions</h2>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
          {suggestions.length}
        </span>
      </div>
      <div className="divide-y divide-border">
        {visible.map((s, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 border-l-2 px-5 py-3 ${severityBorderClass(s.severity)}`}
          >
            <SeverityIcon severity={s.severity} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200">{s.message}</p>
              {s.jobId && (
                <p className="mt-0.5 text-xs text-gray-500">
                  Job: {s.jobId}
                </p>
              )}
            </div>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                s.severity === 'high'
                  ? 'bg-error/15 text-error'
                  : s.severity === 'medium'
                    ? 'bg-warning/15 text-warning'
                    : 'bg-running/15 text-running'
              }`}
            >
              {s.severity}
            </span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-border px-5 py-2 text-center text-xs font-medium text-accent hover:text-accent-hover transition-colors"
        >
          {expanded ? 'Show less' : `Show ${suggestions.length - 3} more`}
        </button>
      )}
    </div>
  );
}

function RecentActivity({ jobs }) {
  const runs = (jobs || [])
    .filter((j) => j.lastRun && j.lastRun.ts)
    .map((j) => ({
      jobName: j.name || j.id,
      status: j.lastRun.status || (j.lastRun.error ? 'error' : 'ok'),
      duration: j.lastRun.durationMs,
      ts: j.lastRun.ts,
      model: j.lastRun.model || j.model || null,
    }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5);

  if (runs.length === 0) {
    return (
      <EmptyState
        icon="--"
        title="No recent activity"
        description="Job executions will appear here once they run."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-card">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-200">Recent Activity</h2>
      </div>
      <div className="divide-y divide-border">
        {runs.map((run, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-bg-hover"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-200">
                {run.jobName}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {timeAgo(run.ts)}
                {run.model && ` \u00B7 ${run.model}`}
              </p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-gray-400">
              {formatDuration(run.duration)}
            </span>
            <StatusBadge status={run.status} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, loading: statsLoading, error: statsError } = useFetch('/api/jobs/stats');
  const { data: jobs, loading: jobsLoading } = useFetch('/api/jobs');
  const { data: suggestionsData, loading: sugLoading } = useFetch('/api/jobs/suggestions');

  const loading = statsLoading || jobsLoading || sugLoading;

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  if (statsError) {
    return (
      <EmptyState
        icon="!"
        title="Failed to load dashboard"
        description={`Error: ${statsError}`}
      />
    );
  }

  if (!stats) {
    return (
      <EmptyState
        icon="?"
        title="No data available"
        description="The API returned no stats. Make sure the backend is running."
      />
    );
  }

  const successColor = stats.successRate >= 90 ? 'success' : stats.successRate >= 70 ? 'warning' : 'error';
  const burnRate = stats.burningRate?.perDay ?? 0;

  return (
    <div className="space-y-6">
      {/* Top row: stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Jobs"
          value={stats.enabled ?? 0}
          subtitle={`${stats.totalJobs ?? 0} total`}
          color="accent"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Success Rate"
          value={`${stats.successRate ?? 0}%`}
          subtitle={`${stats.successRuns ?? 0} / ${stats.totalRuns ?? 0} runs`}
          color={successColor}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Runs Today"
          value={stats.runCount24h ?? 0}
          subtitle={`${stats.runCount7d ?? 0} this week`}
          color="default"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          }
        />
        <StatCard
          label="Token Burn Rate"
          value={formatTokens(burnRate)}
          subtitle="per day"
          color="warning"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-2 1-3 .5 1.5 1 2 1 3a3 3 0 01.12 1.62z" clipRule="evenodd" />
            </svg>
          }
        />
      </div>

      {/* Middle: suggestions */}
      <SuggestionsPanel suggestions={suggestionsData?.suggestions} />

      {/* Bottom: recent activity */}
      <RecentActivity jobs={jobs} />
    </div>
  );
}
