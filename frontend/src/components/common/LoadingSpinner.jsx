export default function LoadingSpinner({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-border" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" />
      </div>
      {message && (
        <p className="mt-4 text-sm text-gray-400">{message}</p>
      )}
    </div>
  );
}
