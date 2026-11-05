export function DeviceIdTag({ id }: { id: string }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
      {id}
    </span>
  );
}
