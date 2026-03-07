export function formatDuration(ms) {
  if (!ms) return '\u2014'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
}

export function formatTokens(n) {
  if (!n && n !== 0) return '\u2014'
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 1000000).toFixed(2)}M`
}

export function timeAgo(ms) {
  if (!ms) return '\u2014'
  const diff = Date.now() - ms
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export function timeUntil(ms) {
  if (!ms) return '\u2014'
  const diff = ms - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 60000) return 'in <1m'
  if (diff < 3600000) return `in ${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `in ${Math.floor(diff / 3600000)}h`
  return `in ${Math.floor(diff / 86400000)}d`
}

export function formatSchedule(schedule) {
  if (!schedule) return '\u2014'
  if (schedule.kind === 'every') {
    const ms = schedule.everyMs
    if (ms) {
      if (ms < 60000) return `Every ${ms / 1000}s`
      if (ms < 3600000) return `Every ${ms / 60000}m`
      if (ms < 86400000) return `Every ${ms / 3600000}h`
      return `Every ${(ms / 86400000).toFixed(1)}d`
    }
    return `Every ${schedule.every || '?'}`
  }
  if (schedule.kind === 'cron') return `Cron: ${schedule.expr}`
  if (schedule.kind === 'once' || schedule.kind === 'at') {
    const d = new Date(schedule.at || schedule.atIso)
    return `Once: ${d.toLocaleString()}`
  }
  return JSON.stringify(schedule)
}

export function getStatusColor(status) {
  switch (status) {
    case 'ok': case 'success': return 'text-success'
    case 'error': case 'failed': return 'text-error'
    case 'running': return 'text-running'
    default: return 'text-gray-400'
  }
}
