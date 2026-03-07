import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useFetch } from '../hooks/useApi'
import { formatDuration } from '../utils/format'
import LoadingSpinner from './common/LoadingSpinner'
import EmptyState from './common/EmptyState'

const HOUR_WIDTH_PX = 120
const ROW_HEIGHT_PX = 48
const DEFAULT_TIMEOUT_S = 120
const CONFLICT_GAP_THRESHOLD_MS = 2 * 3600 * 1000 // 2 hours

function getWindowBounds(dayOffset, hours) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 0, 0, 0, 0)
  const end = new Date(start.getTime() + hours * 3600 * 1000)
  return { start, end, durationMs: end - start }
}

function pct(timeMs, startMs, durationMs) {
  return ((timeMs - startMs) / durationMs) * 100
}

function formatHour(h) {
  return `${String(h % 24).padStart(2, '0')}:00`
}

function formatTime(ms) {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Minimap strip ──────────────────────────────────────────────────────
function Minimap({ events, conflicts, gaps, startMs, durationMs }) {
  return (
    <div className="relative h-6 w-full overflow-hidden rounded bg-bg-primary/60 border border-border">
      {/* Gap regions */}
      {gaps.map((g, i) => {
        const left = Math.max(0, pct(g.start, startMs, durationMs))
        const right = Math.min(100, pct(g.end, startMs, durationMs))
        const width = right - left
        if (width <= 0) return null
        return (
          <div
            key={`gap-${i}`}
            className="absolute top-0 h-full bg-warning/15"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        )
      })}
      {/* Event bars */}
      {events.map((ev, i) => {
        const left = pct(ev.time, startMs, durationMs)
        const widthPct = ((ev.timeoutSeconds || DEFAULT_TIMEOUT_S) * 1000 / durationMs) * 100
        if (left + widthPct < 0 || left > 100) return null
        return (
          <div
            key={`ev-${i}`}
            className="absolute top-1 h-4 rounded-sm bg-accent/80"
            style={{
              left: `${Math.max(0, left)}%`,
              width: `${Math.min(widthPct, 100 - Math.max(0, left))}%`,
              minWidth: '2px',
            }}
          />
        )
      })}
      {/* Conflict markers */}
      {conflicts.map((c, i) => {
        const left = pct(c.time, startMs, durationMs)
        if (left < 0 || left > 100) return null
        return (
          <div
            key={`c-${i}`}
            className="absolute top-0 h-full w-0.5 bg-error"
            style={{ left: `${left}%` }}
          />
        )
      })}
      {/* Now line */}
      {(() => {
        const nowPct = pct(Date.now(), startMs, durationMs)
        if (nowPct < 0 || nowPct > 100) return null
        return (
          <div
            className="absolute top-0 h-full w-px bg-error"
            style={{ left: `${nowPct}%` }}
          />
        )
      })()}
    </div>
  )
}

// ── Tooltip ────────────────────────────────────────────────────────────
function Tooltip({ event, x, y, containerRect }) {
  if (!event) return null
  const durationMs = (event.timeoutSeconds || DEFAULT_TIMEOUT_S) * 1000
  const left = Math.min(x - (containerRect?.left || 0), (containerRect?.width || 400) - 220)
  const top = y - (containerRect?.top || 0) - 80
  return (
    <div
      className="pointer-events-none absolute z-50 w-52 rounded-lg border border-border bg-bg-card p-3 shadow-xl"
      style={{ left: `${Math.max(0, left)}px`, top: `${Math.max(0, top)}px` }}
    >
      <p className="truncate text-sm font-semibold text-gray-100">{event.jobName}</p>
      <p className="mt-1 text-xs text-gray-400">
        {formatTime(event.time)}
      </p>
      <p className="text-xs text-gray-400">
        Est. duration: {formatDuration(durationMs)}
      </p>
      <p className="text-xs text-gray-400 capitalize">
        Kind: {event.kind || 'scheduled'}
      </p>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────
export default function Calendar() {
  const [dayOffset, setDayOffset] = useState(0) // 0 = today, 1 = tomorrow
  const [hoursRange, setHoursRange] = useState(24)
  const [now, setNow] = useState(Date.now())
  const [tooltip, setTooltip] = useState(null)
  const containerRef = useRef(null)
  const gridRef = useRef(null)

  // Tick every 60s to update "now" line
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const { start, end, durationMs } = useMemo(
    () => getWindowBounds(dayOffset, hoursRange),
    [dayOffset, hoursRange]
  )
  const startMs = start.getTime()
  const endMs = end.getTime()
  const apiHours = hoursRange + (dayOffset * 24)

  const { data: timeline, loading: tlLoading, error: tlError } = useFetch(
    `/api/jobs/timeline?hours=${apiHours}`
  )
  const { data: conflictData, loading: cfLoading, error: cfError } = useFetch(
    `/api/jobs/conflicts?hours=${apiHours}`
  )
  const { data: allJobs, loading: jobsLoading, error: jobsError } = useFetch('/api/jobs')

  const loading = tlLoading || cfLoading || jobsLoading
  const error = tlError || cfError || jobsError

  // Filter events to window
  const events = useMemo(() => {
    if (!timeline) return []
    return timeline.filter(ev => ev.time >= startMs && ev.time < endMs)
  }, [timeline, startMs, endMs])

  // Enabled jobs only
  const enabledJobs = useMemo(() => {
    if (!allJobs) return []
    return allJobs.filter(j => j.enabled)
  }, [allJobs])

  // Group events by jobId for swim lanes
  const laneMap = useMemo(() => {
    const map = new Map()
    for (const job of enabledJobs) {
      map.set(job.id, { job, events: [] })
    }
    for (const ev of events) {
      if (map.has(ev.jobId)) {
        map.get(ev.jobId).events.push(ev)
      } else {
        map.set(ev.jobId, {
          job: { id: ev.jobId, name: ev.jobName, state: 'ok' },
          events: [ev],
        })
      }
    }
    return map
  }, [enabledJobs, events])

  const lanes = useMemo(() => Array.from(laneMap.values()), [laneMap])

  // Conflicts & gaps within window
  const conflicts = useMemo(() => {
    if (!conflictData?.conflicts) return []
    return conflictData.conflicts.filter(c => c.time >= startMs && c.time < endMs)
  }, [conflictData, startMs, endMs])

  const gaps = useMemo(() => {
    if (!conflictData?.gaps) return []
    return conflictData.gaps
      .filter(g => g.durationMs >= CONFLICT_GAP_THRESHOLD_MS)
      .filter(g => g.end > startMs && g.start < endMs)
      .map(g => ({
        start: Math.max(g.start, startMs),
        end: Math.min(g.end, endMs),
        durationMs: g.durationMs,
      }))
  }, [conflictData, startMs, endMs])

  // Hour labels
  const hourLabels = useMemo(() => {
    const labels = []
    for (let i = 0; i < hoursRange; i++) {
      const h = (start.getHours() + i) % 24
      labels.push(h)
    }
    return labels
  }, [hoursRange, start])

  // Now position
  const nowPct = useMemo(() => pct(now, startMs, durationMs), [now, startMs, durationMs])
  const nowInView = nowPct >= 0 && nowPct <= 100

  // Scroll to now on mount / day change
  useEffect(() => {
    if (!gridRef.current || !nowInView) return
    const gridWidth = hoursRange * HOUR_WIDTH_PX
    const scrollTarget = (nowPct / 100) * gridWidth - gridRef.current.clientWidth / 3
    gridRef.current.scrollLeft = Math.max(0, scrollTarget)
  }, [nowInView, nowPct, hoursRange, dayOffset])

  const handleBarHover = useCallback((ev, event) => {
    const rect = containerRef.current?.getBoundingClientRect()
    setTooltip({ event, x: ev.clientX, y: ev.clientY, containerRect: rect })
  }, [])

  const handleBarLeave = useCallback(() => setTooltip(null), [])

  // ── Date label ──
  const dateLabel = useMemo(() => {
    const d = new Date(start)
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }, [start])

  // ── Render ──
  if (loading) return <LoadingSpinner message="Loading schedule..." />
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-error/30 bg-error/10 p-4">
          <p className="text-sm text-error">Failed to load schedule data: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-xs text-gray-400 underline hover:text-gray-200"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (enabledJobs.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon="📅"
          title="No active jobs"
          description="Enable some jobs to see them on the schedule timeline."
        />
      </div>
    )
  }

  const totalGridWidth = hoursRange * HOUR_WIDTH_PX

  return (
    <div className="flex flex-col gap-4 p-6" ref={containerRef}>
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-gray-100">Schedule Overview</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Day selector */}
          <div className="flex rounded-lg border border-border bg-bg-card">
            {[
              { label: 'Today', value: 0 },
              { label: 'Tomorrow', value: 1 },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setDayOffset(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dayOffset === opt.value
                    ? 'bg-accent text-white'
                    : 'text-gray-400 hover:bg-bg-hover hover:text-gray-200'
                } ${opt.value === 0 ? 'rounded-l-lg' : 'rounded-r-lg'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Hours range */}
          <div className="flex rounded-lg border border-border bg-bg-card">
            {[12, 24, 48].map((h, i, arr) => (
              <button
                key={h}
                onClick={() => setHoursRange(h)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  hoursRange === h
                    ? 'bg-accent text-white'
                    : 'text-gray-400 hover:bg-bg-hover hover:text-gray-200'
                } ${i === 0 ? 'rounded-l-lg' : ''} ${i === arr.length - 1 ? 'rounded-r-lg' : ''}`}
              >
                {h}h
              </button>
            ))}
          </div>
          {/* Date badge */}
          <span className="text-xs text-gray-500">{dateLabel}</span>
        </div>
      </div>

      {/* ── Now indicator text ── */}
      {nowInView && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-block h-2 w-2 rounded-full bg-error animate-pulse" />
          Now: {formatTime(now)}
        </div>
      )}

      {/* ── Minimap ── */}
      <Minimap
        events={events}
        conflicts={conflicts}
        gaps={gaps}
        startMs={startMs}
        durationMs={durationMs}
      />

      {/* ── Timeline grid ── */}
      <div className="relative rounded-lg border border-border bg-bg-card overflow-hidden">
        {/* Tooltip overlay */}
        {tooltip && (
          <Tooltip
            event={tooltip.event}
            x={tooltip.x}
            y={tooltip.y}
            containerRect={containerRef.current?.getBoundingClientRect()}
          />
        )}

        <div className="flex">
          {/* ── Fixed job name column ── */}
          <div className="flex-shrink-0 border-r border-border bg-bg-card z-10">
            {/* Header spacer */}
            <div className="h-8 border-b border-border px-3 flex items-center">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Jobs
              </span>
            </div>
            {/* Job name rows */}
            {lanes.map(lane => (
              <div
                key={lane.job.id}
                className="flex items-center border-b border-border/50 px-3"
                style={{ height: `${ROW_HEIGHT_PX}px` }}
              >
                <span
                  className="max-w-[140px] truncate text-xs font-medium text-gray-300"
                  title={lane.job.name}
                >
                  {lane.job.name}
                </span>
              </div>
            ))}
          </div>

          {/* ── Scrollable timeline area ── */}
          <div className="flex-1 overflow-x-auto" ref={gridRef}>
            <div style={{ width: `${totalGridWidth}px`, minWidth: '100%' }}>
              {/* Hour labels row */}
              <div className="relative flex h-8 border-b border-border">
                {hourLabels.map((h, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 border-r border-border/30 px-1 flex items-end pb-1"
                    style={{ width: `${HOUR_WIDTH_PX}px` }}
                  >
                    <span className="text-[10px] text-gray-500">{formatHour(h)}</span>
                  </div>
                ))}
              </div>

              {/* Swim lane rows */}
              <div className="relative">
                {/* Past-time dimming overlay */}
                {nowInView && (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 z-[1] bg-black/15"
                    style={{ width: `${nowPct}%` }}
                  />
                )}

                {/* Gap regions */}
                {gaps.map((g, i) => {
                  const left = Math.max(0, pct(g.start, startMs, durationMs))
                  const right = Math.min(100, pct(g.end, startMs, durationMs))
                  const width = right - left
                  if (width <= 0) return null
                  return (
                    <div
                      key={`gap-${i}`}
                      className="pointer-events-none absolute inset-y-0 z-[1]"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <div
                        className="h-full w-full opacity-10"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(45deg, #fbbf24 0, #fbbf24 4px, transparent 4px, transparent 12px)',
                        }}
                      />
                    </div>
                  )
                })}

                {/* Conflict markers */}
                {conflicts.map((c, i) => {
                  const leftPct = pct(c.time, startMs, durationMs)
                  if (leftPct < 0 || leftPct > 100) return null
                  return (
                    <div
                      key={`conf-${i}`}
                      className="absolute inset-y-0 z-[3] flex flex-col items-center"
                      style={{ left: `${leftPct}%` }}
                      title={`Conflict: ${c.jobs?.map(j => j.name).join(', ')}`}
                    >
                      <div className="h-full w-px bg-error/40" />
                      <div className="absolute top-0 -translate-x-1/2 rounded bg-error/90 px-1 py-0.5 text-[9px] font-bold text-white">
                        !
                      </div>
                    </div>
                  )
                })}

                {/* Now line */}
                {nowInView && (
                  <div
                    className="pointer-events-none absolute inset-y-0 z-[4]"
                    style={{ left: `${nowPct}%` }}
                  >
                    <div
                      className="h-full w-px"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(to bottom, #f87171 0, #f87171 6px, transparent 6px, transparent 12px)',
                      }}
                    />
                  </div>
                )}

                {/* Vertical hour gridlines */}
                {hourLabels.map((_, i) => (
                  <div
                    key={`vline-${i}`}
                    className="pointer-events-none absolute inset-y-0 border-r border-border/20"
                    style={{ left: `${(i / hoursRange) * 100}%` }}
                  />
                ))}

                {/* Job rows */}
                {lanes.map(lane => (
                  <div
                    key={lane.job.id}
                    className="relative border-b border-border/30"
                    style={{ height: `${ROW_HEIGHT_PX}px` }}
                  >
                    {lane.events.map((ev, ei) => {
                      const leftPct = pct(ev.time, startMs, durationMs)
                      const durS = ev.timeoutSeconds || DEFAULT_TIMEOUT_S
                      const widthPct = (durS * 1000 / durationMs) * 100
                      const isError = lane.job.state === 'error' || lane.job.state === 'failed'
                      const clampedLeft = Math.max(0, leftPct)
                      const clampedWidth = Math.min(widthPct, 100 - clampedLeft)
                      if (clampedWidth <= 0) return null
                      return (
                        <div
                          key={ei}
                          className={`absolute top-2 z-[2] flex cursor-pointer items-center overflow-hidden rounded px-1.5 transition-opacity ${
                            isError
                              ? 'bg-error/70 hover:bg-error/90'
                              : 'bg-accent/70 hover:bg-accent/90'
                          }`}
                          style={{
                            left: `${clampedLeft}%`,
                            width: `${Math.max(clampedWidth, 0.3)}%`,
                            height: `${ROW_HEIGHT_PX - 16}px`,
                          }}
                          onMouseEnter={e => handleBarHover(e, ev)}
                          onMouseMove={e => handleBarHover(e, ev)}
                          onMouseLeave={handleBarLeave}
                        >
                          <span className="truncate text-[10px] font-medium text-white/90">
                            {ev.jobName}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span>
          <span className="inline-block mr-1.5 h-2 w-2 rounded-sm bg-accent/70" />
          {events.length} scheduled event{events.length !== 1 ? 's' : ''}
        </span>
        {conflicts.length > 0 && (
          <span>
            <span className="inline-block mr-1.5 h-2 w-2 rounded-sm bg-error/70" />
            {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
          </span>
        )}
        {gaps.length > 0 && (
          <span>
            <span className="inline-block mr-1.5 h-2 w-2 rounded-sm bg-warning/40" />
            {gaps.length} gap{gaps.length !== 1 ? 's' : ''} ({'>'} 2h)
          </span>
        )}
        <span>{lanes.length} active job{lanes.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Mobile fallback (simplified list) ── */}
      <div className="block sm:hidden mt-2">
        <p className="text-xs text-gray-500 mb-2 italic">Scroll the timeline above, or view the list below:</p>
        <div className="flex flex-col gap-1">
          {events
            .sort((a, b) => a.time - b.time)
            .map((ev, i) => {
              const durS = ev.timeoutSeconds || DEFAULT_TIMEOUT_S
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded border border-border/50 bg-bg-primary/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-accent" />
                    <span className="truncate text-xs text-gray-200">{ev.jobName}</span>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-[10px] text-gray-400">{formatTime(ev.time)}</span>
                    <span className="ml-2 text-[10px] text-gray-600">{formatDuration(durS * 1000)}</span>
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
