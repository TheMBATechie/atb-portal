// Shown while a page loads its data (used by loading.tsx files).
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-4 py-2" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="h-7 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
      <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
    </div>
  );
}
