const CONFIG = {
  ok: {
    label: 'OK',
    bg: 'bg-success/15',
    text: 'text-success',
    dot: 'bg-success',
  },
  error: {
    label: 'Error',
    bg: 'bg-error/15',
    text: 'text-error',
    dot: 'bg-error',
  },
  running: {
    label: 'Running',
    bg: 'bg-running/15',
    text: 'text-running',
    dot: 'bg-running',
  },
  disabled: {
    label: 'Disabled',
    bg: 'bg-gray-500/15',
    text: 'text-gray-400',
    dot: 'bg-gray-500',
  },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const cfg = CONFIG[status] || CONFIG.disabled;
  const sizeClasses = size === 'md'
    ? 'px-3 py-1 text-sm'
    : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${cfg.bg} ${cfg.text} ${sizeClasses}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
