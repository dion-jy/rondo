export default function EmptyState({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-bg-card px-6 py-16 text-center">
      {icon && (
        <span className="mb-4 text-4xl opacity-40">{icon}</span>
      )}
      <h3 className="text-lg font-medium text-gray-200">
        {title || 'No data'}
      </h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          {description}
        </p>
      )}
    </div>
  );
}
