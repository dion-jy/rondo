import { useState, useMemo } from 'react'
import { useFetch } from '../hooks/useApi'
import { formatDuration, formatTokens } from '../utils/format'
import StatusBadge from './common/StatusBadge'
import LoadingSpinner from './common/LoadingSpinner'
import EmptyState from './common/EmptyState'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'ok', label: 'Success' },
  { key: 'error', label: 'Error' },
]

const PAGE_SIZE = 50

export default function Executions() {
  const { data: jobs, loading, error } = useFetch('/api/jobs')
  const [statusFilter, setStatusFilter] = useState('all')
  const [jobFilter, setJobFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [expandedIdx, setExpandedIdx] = useState(null)

  // Flatten all recentRuns from all jobs into a single sorted list
  const allRuns = useMemo(() => {
    if (!jobs) return []
    const entries = []
    for (const job of jobs) {
      if (!job.recentRuns) continue
      for (const run of job.recentRuns) {
        entries.push({
          ...run,
          jobName: job.name,
          jobId: job.id,
        })
      }
    }
    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0))
    return entries
  }, [jobs])

  // Unique job names for the filter dropdown
  const jobNames = useMemo(() => {
    if (!jobs) return []
    return [...new Set(jobs.map(j => j.name))].sort()
  }, [jobs])

  // Apply filters
  const filtered = useMemo(() => {
    let list = allRuns

    if (statusFilter !== 'all') {
      list = list.filter(r => {
        if (statusFilter === 'ok') return r.status === 'ok' || r.status === 'success'
        return r.status === 'error' || r.status === 'failed'
      })
    }

    if (jobFilter) {
      list = list.filter(r => r.jobName === jobFilter)
    }

    return list
  }, [allRuns, statusFilter, jobFilter])

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  if (loading) return <LoadingSpinner message="Loading execution log..." />

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
          Failed to load executions: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Execution Log</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Job name filter */}
          <select
            value={jobFilter}
            onChange={e => {
              setJobFilter(e.target.value)
              setVisibleCount(PAGE_SIZE)
            }}
            className="rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-accent"
          >
            <option value="">All Jobs</option>
            {jobNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          {/* Status filter */}
          <div className="flex gap-1 rounded-lg border border-border bg-bg-card p-1">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => {
                  setStatusFilter(f.key)
                  setVisibleCount(PAGE_SIZE)
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === f.key
                    ? 'bg-accent text-white'
                    : 'text-gray-400 hover:bg-bg-hover hover:text-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Count */}
      <p className="mb-4 text-xs text-gray-500">
        {filtered.length} execution{filtered.length !== 1 ? 's' : ''}
        {statusFilter !== 'all' && ` (${statusFilter})`}
        {jobFilter && ` for ${jobFilter}`}
      </p>

      {/* Entries */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No executions found"
          description={
            statusFilter !== 'all' || jobFilter
              ? 'Try adjusting your filters.'
              : 'No jobs have been executed yet.'
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((run, idx) => (
            <ExecutionCard
              key={`${run.jobId}-${run.ts}-${idx}`}
              run={run}
              isExpanded={expandedIdx === idx}
              onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            />
          ))}

          {hasMore && (
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="w-full rounded-lg border border-border bg-bg-card py-3 text-sm font-medium text-gray-400 transition-colors hover:border-accent/40 hover:bg-bg-hover hover:text-gray-200"
            >
              Load more ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ExecutionCard({ run, isExpanded, onToggle }) {
  const totalTokens = run.usage
    ? (run.usage.inputTokens || 0) + (run.usage.outputTokens || 0)
    : null

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4 transition-colors hover:bg-bg-hover">
      {/* Top row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Timestamp */}
        <span className="whitespace-nowrap text-xs font-medium text-gray-300">
          {run.ts ? formatTimestamp(run.ts) : '\u2014'}
        </span>

        {/* Job name */}
        <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-hover">
          {run.jobName}
        </span>

        {/* Status */}
        <StatusBadge status={run.status} />

        {/* Duration */}
        <span className="text-xs text-gray-500">
          {formatDuration(run.durationMs)}
        </span>

        {/* Model + provider */}
        {run.model && (
          <span className="text-xs text-gray-500">
            {run.model}
          </span>
        )}

        {/* Tokens */}
        {totalTokens != null && (
          <span className="text-xs text-gray-500">
            {formatTokens(totalTokens)} tokens
          </span>
        )}
      </div>

      {/* Summary */}
      {run.summary && (
        <button
          onClick={onToggle}
          className="mt-2 w-full text-left"
        >
          <p
            className={`text-xs leading-relaxed text-gray-400 ${
              isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-1'
            }`}
          >
            {run.summary}
          </p>
          {!isExpanded && run.summary.length > 80 && (
            <span className="mt-0.5 inline-block text-xs text-accent-hover">
              show more
            </span>
          )}
        </button>
      )}
    </div>
  )
}

function formatTimestamp(ms) {
  const d = new Date(ms)
  const month = d.toLocaleString('en', { month: 'short' })
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${month} ${day}, ${h}:${m}:${s}`
}
