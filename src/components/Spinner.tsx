export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={`inline-block h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white ${className ?? ""}`}
      role="status"
      aria-label="טוען"
    />
  );
}
