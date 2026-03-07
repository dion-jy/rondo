const BORDER_COLORS = {
  default: 'from-gray-500 to-gray-700',
  success: 'from-success to-emerald-600',
  error: 'from-error to-red-600',
  warning: 'from-warning to-amber-600',
  accent: 'from-accent to-indigo-600',
};

const TREND_ARROWS = {
  up: (
    <svg className="h-3.5 w-3.5 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 12V4M4 7l4-4 4 4" />
    </svg>
  ),
  down: (
    <svg className="h-3.5 w-3.5 text-error" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 4v8M4 9l4 4 4-4" />
    </svg>
  ),
  neutral: (
    <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8h10" />
    </svg>
  ),
};

export default function StatCard({ label, value, subtitle, trend, icon, color = 'default' }) {
  const borderGradient = BORDER_COLORS[color] || BORDER_COLORS.default;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-bg-card">
      <div className={`h-1 bg-gradient-to-r ${borderGradient}`} />
      <div className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            {label}
          </p>
          {icon && (
            <span className="text-lg opacity-50">{icon}</span>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-100">
            {value}
          </span>
          {trend && TREND_ARROWS[trend]}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
