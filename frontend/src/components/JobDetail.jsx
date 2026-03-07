import { useState, useEffect, useRef } from 'react'
import { useFetch } from '../hooks/useApi'
import { formatDuration, formatTokens, timeAgo, formatSchedule } from '../utils/format'
import StatusBadge from './common/StatusBadge'
import LoadingSpinner from './common/LoadingSpinner'

export default function JobDetail({ jobId, onClose }) {
  const { data: job, loading, error } = useFetch(`/api/jobs/${jobId}`)
  const overlayRef = useRef(null)

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Close on click outside
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12 backdrop-blur-sm sm:pt-20"
    >
      <div className="relative w-full max-w-3xl rounded-xl border border-border bg-bg-card shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-bg-hover hover:text-gray-200"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>

        {loading && (
          <div className="p-12">
            <LoadingSpinner message="Loading job details..." />
          </div>
        )}

        {error && (
          <div className="p-6">
            <div className="rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
              Failed to load job: {error}
            </div>
          </div>
        )}

        {job && <JobDetailContent job={job} />}
      </div>
    </div>
  )
}

function JobDetailContent({ job }) {
  return (
    <div className="divide-y divide-border">
      {/* Header */}
      <div className="p-6 pr-12">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-100">{job.name}</h2>
          {job.enabled ? (
            <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
              Active
            </span>
          ) : (
            <span className="rounded-full bg-gray-500/15 px-2.5 py-0.5 text-xs font-medium text-gray-400">
              Disabled
            </span>
          )}
        </div>
        {job.consecutiveErrors > 0 && (
          <p className="mt-2 text-xs text-error">
            {job.consecutiveErrors} consecutive error{job.consecutiveErrors !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        <InfoCell label="Schedule" value={job.scheduleLabel || formatSchedule(job.schedule)} />
        <InfoCell label="Session Target" value={job.sessionTarget || '\u2014'} />
        <InfoCell label="Delivery" value={job.delivery || '\u2014'} />
        <InfoCell
          label="Timeout"
          value={job.timeoutSeconds ? `${job.timeoutSeconds}s` : '\u2014'}
        />
        <InfoCell
          label="Created"
          value={job.createdAtMs ? new Date(job.createdAtMs).toLocaleDateString() : '\u2014'}
        />
        <InfoCell
          label="Updated"
          value={job.updatedAtMs ? timeAgo(job.updatedAtMs) : '\u2014'}
        />
      </div>

      {/* Payload */}
      {job.payload && (
        <div className="p-6">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
            Payload
          </h3>
          <div className="max-h-48 overflow-auto rounded-lg border border-border bg-bg-primary p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-300">
              {typeof job.payload === 'string'
                ? job.payload
                : job.payload.message || JSON.stringify(job.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Run history */}
      <div className="p-6">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">
          Run History
        </h3>
        {job.allRuns && job.allRuns.length > 0 ? (
          <RunHistoryTable runs={job.allRuns} />
        ) : (
          <p className="py-8 text-center text-sm text-gray-500">No runs recorded yet.</p>
        )}
      </div>
    </div>
  )
}

function InfoCell({ label, value }) {
  return (
    <div className="bg-bg-card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-200">{value}</p>
    </div>
  )
}

function RunHistoryTable({ runs }) {
  const [expandedIdx, setExpandedIdx] = useState(null)

  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-bg-primary">
          <tr className="border-b border-border text-gray-500">
            <th className="px-4 py-2.5 font-medium">Time</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Duration</th>
            <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Model</th>
            <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Tokens</th>
            <th className="px-4 py-2.5 font-medium">Summary</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {runs.map((run, idx) => {
            const isExpanded = expandedIdx === idx
            const totalTokens = run.usage
              ? (run.usage.inputTokens || 0) + (run.usage.outputTokens || 0)
              : null

            return (
              <tr
                key={idx}
                className="transition-colors hover:bg-bg-hover"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-gray-300">
                  {run.ts ? formatTimestamp(run.ts) : '\u2014'}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={run.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-gray-400">
                  {formatDuration(run.durationMs)}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-2.5 text-gray-400 sm:table-cell">
                  {run.model || '\u2014'}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-2.5 text-gray-400 sm:table-cell">
                  {totalTokens != null ? formatTokens(totalTokens) : '\u2014'}
                </td>
                <td className="max-w-[200px] px-4 py-2.5">
                  {run.summary ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedIdx(isExpanded ? null : idx)
                      }}
                      className="w-full text-left"
                    >
                      <span
                        className={`block text-gray-300 ${
                          isExpanded ? 'whitespace-pre-wrap' : 'truncate'
                        }`}
                      >
                        {run.summary}
                      </span>
                      {!isExpanded && run.summary.length > 60 && (
                        <span className="text-accent-hover">show more</span>
                      )}
                    </button>
                  ) : (
                    <span className="text-gray-600">\u2014</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
