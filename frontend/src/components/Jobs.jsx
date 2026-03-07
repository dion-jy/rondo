import { useState, useMemo } from 'react'
import { useFetch } from '../hooks/useApi'
import { timeAgo, timeUntil, formatDuration } from '../utils/format'
import StatusBadge from './common/StatusBadge'
import LoadingSpinner from './common/LoadingSpinner'
import EmptyState from './common/EmptyState'
import JobDetail from './JobDetail'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'errors', label: 'Errors' },
]

export default function Jobs() {
  const { data: jobs, loading, error } = useFetch('/api/jobs')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedJobId, setSelectedJobId] = useState(null)

  const filtered = useMemo(() => {
    if (!jobs) return []
    let list = [...jobs]

    // Apply text search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(j =>
        j.name.toLowerCase().includes(q) ||
        (j.scheduleLabel && j.scheduleLabel.toLowerCase().includes(q))
      )
    }

    // Apply filter
    switch (filter) {
      case 'active':
        list = list.filter(j => j.enabled)
        break
      case 'disabled':
        list = list.filter(j => !j.enabled)
        break
      case 'errors':
        list = list.filter(j => j.consecutiveErrors > 0)
        break
    }

    return list
  }, [jobs, search, filter])

  if (loading) return <LoadingSpinner message="Loading jobs..." />

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
          Failed to load jobs: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Jobs</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              placeholder="Search jobs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg-card py-2 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-accent sm:w-64"
            />
          </div>

          {/* Filter buttons */}
          <div className="flex gap-1 rounded-lg border border-border bg-bg-card p-1">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f.key
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

      {/* Job count */}
      <p className="mb-4 text-xs text-gray-500">
        {filtered.length} job{filtered.length !== 1 ? 's' : ''}
        {filter !== 'all' && ` (${filter})`}
        {search && ` matching "${search}"`}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description={
            search || filter !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'No jobs have been created yet.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onClick={() => setSelectedJobId(job.id)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedJobId && (
        <JobDetail
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>
  )
}

function JobCard({ job, onClick }) {
  const lastRun = job.lastRun
  const hasErrors = job.consecutiveErrors > 0

  return (
    <button
      onClick={onClick}
      className="group w-full cursor-pointer rounded-lg border border-border bg-bg-card p-5 text-left transition-all hover:border-accent/40 hover:bg-bg-hover"
    >
      {/* Top row: name + badges */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="truncate text-sm font-semibold text-gray-100 group-hover:text-accent-hover">
              {job.name}
            </h3>
            {job.enabled ? (
              <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                Active
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-gray-500/15 px-2 py-0.5 text-xs font-medium text-gray-400">
                Disabled
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {job.scheduleLabel || '\u2014'}
          </p>
        </div>

        {hasErrors && (
          <span className="shrink-0 rounded-full bg-error/15 px-2.5 py-1 text-xs font-bold text-error">
            {job.consecutiveErrors} error{job.consecutiveErrors !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Bottom row: next run + last run */}
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-3">
        {/* Next run */}
        <div className="text-xs text-gray-400">
          <span className="text-gray-500">Next: </span>
          <span className={job.enabled ? 'text-accent-hover' : 'text-gray-500'}>
            {job.enabled ? timeUntil(job.nextRunAtMs) : 'paused'}
          </span>
        </div>

        {/* Last run */}
        {lastRun ? (
          <div className="flex items-center gap-2 text-xs">
            <StatusBadge status={lastRun.status} />
            <span className="text-gray-500">{timeAgo(lastRun.ts)}</span>
            <span className="text-gray-600">{formatDuration(lastRun.durationMs)}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-600">No runs yet</span>
        )}
      </div>
    </button>
  )
}
