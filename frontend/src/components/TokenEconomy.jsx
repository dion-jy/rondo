import { useMemo } from 'react'
import { useFetch } from '../hooks/useApi'
import { formatTokens, formatDuration } from '../utils/format'
import StatCard from './common/StatCard'
import LoadingSpinner from './common/LoadingSpinner'
import EmptyState from './common/EmptyState'

// Colors for the model breakdown bars
const BAR_COLORS = [
  'bg-accent',
  'bg-success',
  'bg-warning',
  'bg-running',
  'bg-error',
  'bg-purple-500',
  'bg-cyan-400',
  'bg-orange-400',
]

export default function TokenEconomy() {
  const { data: stats, loading, error } = useFetch('/api/jobs/stats')
  const { data: jobs } = useFetch('/api/jobs')

  if (loading) return <LoadingSpinner message="Loading token economics..." />

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
          Failed to load stats: {error}
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-6">
        <EmptyState title="No data" description="Token usage data is not available yet." />
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-100">Token Economy</h1>

      {/* Top stats row */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Tokens Used"
          value={formatTokens(stats.totalTokens)}
          subtitle={`${stats.totalRuns || 0} total runs`}
          color="accent"
        />
        <StatCard
          label="Daily Burn Rate"
          value={`${formatTokens(stats.burningRate?.perDay || 0)}/day`}
          subtitle={`${formatTokens(stats.burningRate?.perHour || 0)}/hr`}
          color="warning"
        />
        <StatCard
          label="Estimated Monthly"
          value={formatTokens(stats.projectedMonthly)}
          subtitle="At current rate"
          color="default"
        />
        <StatCard
          label="Monthly Cost"
          value={formatCurrency(stats.projectedMonthlyCost)}
          subtitle={stats.costEstimate
            ? `In: ${formatCurrency(stats.costEstimate.inputCost)} / Out: ${formatCurrency(stats.costEstimate.outputCost)}`
            : undefined}
          color="success"
        />
      </div>

      {/* Model breakdown */}
      <ModelBreakdown byModel={stats.byModel} />

      {/* Per-job burn rate */}
      <PerJobBurnRate jobs={jobs} stats={stats} />

      {/* Cost projection */}
      <CostProjection stats={stats} />
    </div>
  )
}

function ModelBreakdown({ byModel }) {
  const models = useMemo(() => {
    if (!byModel) return []
    return Object.entries(byModel)
      .map(([name, data]) => ({
        name,
        runs: data.runs || 0,
        totalTokens: data.totalTokens || 0,
        inputTokens: data.inputTokens || 0,
        outputTokens: data.outputTokens || 0,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens)
  }, [byModel])

  const maxTokens = models.length > 0 ? models[0].totalTokens : 1
  const totalTokens = models.reduce((s, m) => s + m.totalTokens, 0) || 1

  if (models.length === 0) return null

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Model Breakdown
      </h2>
      <div className="rounded-lg border border-border bg-bg-card p-5">
        <div className="space-y-4">
          {models.map((model, idx) => {
            const pct = ((model.totalTokens / totalTokens) * 100).toFixed(1)
            const barWidth = ((model.totalTokens / maxTokens) * 100).toFixed(1)
            const colorClass = BAR_COLORS[idx % BAR_COLORS.length]

            return (
              <div key={model.name}>
                {/* Label row */}
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${colorClass}`} />
                    <span className="font-medium text-gray-200">{model.name}</span>
                    <span className="text-gray-500">{model.runs} runs</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400">{formatTokens(model.totalTokens)}</span>
                    <span className="w-12 text-right font-medium text-gray-300">{pct}%</span>
                  </div>
                </div>
                {/* Bar */}
                <div className="h-2 overflow-hidden rounded-full bg-bg-primary">
                  <div
                    className={`h-full rounded-full ${colorClass} transition-all duration-500`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PerJobBurnRate({ jobs, stats }) {
  const jobRows = useMemo(() => {
    if (!jobs || !stats) return []

    const rows = []
    for (const job of jobs) {
      if (!job.enabled || !job.recentRuns || job.recentRuns.length === 0) continue

      // Calculate avg tokens per run
      let totalTokens = 0
      let tokenRuns = 0
      for (const run of job.recentRuns) {
        if (run.usage) {
          totalTokens += (run.usage.inputTokens || 0) + (run.usage.outputTokens || 0)
          tokenRuns++
        }
      }
      const avgTokensPerRun = tokenRuns > 0 ? Math.round(totalTokens / tokenRuns) : 0
      if (avgTokensPerRun === 0) continue

      // Estimate runs per day from schedule
      const runsPerDay = estimateRunsPerDay(job)
      const dailyTokens = Math.round(avgTokensPerRun * runsPerDay)

      // Rough cost estimate: assume blended rate
      // Use stats costEstimate to derive per-token cost
      const perTokenCost = stats.totalTokens > 0 && stats.costEstimate
        ? stats.costEstimate.totalCost / stats.totalTokens
        : 0
      const dailyCost = dailyTokens * perTokenCost

      rows.push({
        name: job.name,
        scheduleLabel: job.scheduleLabel || '\u2014',
        avgTokensPerRun,
        dailyTokens,
        dailyCost,
      })
    }

    rows.sort((a, b) => b.dailyTokens - a.dailyTokens)
    return rows
  }, [jobs, stats])

  if (jobRows.length === 0) return null

  const topDailyTokens = jobRows[0]?.dailyTokens || 1

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Per-Job Burn Rate
      </h2>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-bg-primary">
            <tr className="border-b border-border text-gray-500">
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium">Schedule</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Avg Tokens/Run</th>
              <th className="px-4 py-3 font-medium">Est. Daily Tokens</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Daily Cost</th>
              <th className="w-32 px-4 py-3 font-medium">Usage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-bg-card">
            {jobRows.map((row, idx) => {
              const isTop = idx === 0 && jobRows.length > 1
              const barPct = ((row.dailyTokens / topDailyTokens) * 100).toFixed(1)

              return (
                <tr
                  key={row.name}
                  className={`transition-colors hover:bg-bg-hover ${
                    isTop ? 'border-l-2 border-l-warning' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-200">{row.name}</td>
                  <td className="px-4 py-3 text-gray-400">{row.scheduleLabel}</td>
                  <td className="hidden px-4 py-3 text-gray-400 sm:table-cell">
                    {formatTokens(row.avgTokensPerRun)}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {formatTokens(row.dailyTokens)}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-400 sm:table-cell">
                    {formatCurrency(row.dailyCost)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-bg-primary">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CostProjection({ stats }) {
  if (!stats.costEstimate && !stats.projectedMonthlyCost) return null

  const cost = stats.costEstimate || {}

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Cost Projection
      </h2>
      <div className="rounded-lg border border-border bg-bg-card p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          {/* Rate trajectory */}
          <div>
            <p className="text-xs text-gray-500">At current rate</p>
            <p className="mt-1 text-3xl font-bold text-gray-100">
              {formatCurrency(stats.projectedMonthlyCost)}
              <span className="ml-1 text-sm font-normal text-gray-500">/month</span>
            </p>
            <div className="mt-3 space-y-1.5">
              <CostRow
                label="Hourly"
                value={formatCurrency(stats.burningRate?.perHour
                  ? (stats.burningRate.perHour / (stats.totalTokens || 1)) * (cost.totalCost || 0)
                  : 0)}
              />
              <CostRow
                label="Daily"
                value={formatCurrency(stats.burningRate?.perDay
                  ? (stats.burningRate.perDay / (stats.totalTokens || 1)) * (cost.totalCost || 0)
                  : 0)}
              />
              <CostRow
                label="Weekly"
                value={formatCurrency(stats.burningRate?.perWeek
                  ? (stats.burningRate.perWeek / (stats.totalTokens || 1)) * (cost.totalCost || 0)
                  : 0)}
              />
            </div>
          </div>

          {/* Input vs Output breakdown */}
          <div className="min-w-[200px]">
            <p className="mb-3 text-xs text-gray-500">Cost Breakdown</p>
            <div className="space-y-3">
              <CostBreakdownBar
                label="Input Tokens"
                value={formatCurrency(cost.inputCost)}
                pct={cost.totalCost ? ((cost.inputCost || 0) / cost.totalCost * 100).toFixed(0) : 0}
                colorClass="bg-accent"
              />
              <CostBreakdownBar
                label="Output Tokens"
                value={formatCurrency(cost.outputCost)}
                pct={cost.totalCost ? ((cost.outputCost || 0) / cost.totalCost * 100).toFixed(0) : 0}
                colorClass="bg-success"
              />
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-300">Total to date</span>
                <span className="font-bold text-gray-100">
                  {formatCurrency(cost.totalCost)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CostRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-300">{value}</span>
    </div>
  )
}

function CostBreakdownBar({ label, value, pct, colorClass }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300">{value} ({pct}%)</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-primary">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function formatCurrency(n) {
  if (n == null || isNaN(n)) return '$0.00'
  if (n < 0.01 && n > 0) return '<$0.01'
  return `$${n.toFixed(2)}`
}

function estimateRunsPerDay(job) {
  // Try to estimate from schedule
  const schedule = job.schedule
  if (!schedule) return 1

  if (schedule.kind === 'every' && schedule.everyMs) {
    return 86400000 / schedule.everyMs
  }

  // For cron schedules, make a rough estimate from recent runs
  if (job.recentRuns && job.recentRuns.length >= 2) {
    const runs = job.recentRuns
    const newest = runs[0]?.ts
    const oldest = runs[runs.length - 1]?.ts
    if (newest && oldest && newest > oldest) {
      const spanMs = newest - oldest
      const spanDays = spanMs / 86400000
      if (spanDays > 0) {
        return runs.length / spanDays
      }
    }
  }

  // Fallback: assume once per day
  return 1
}
