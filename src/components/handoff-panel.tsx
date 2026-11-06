"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmHandoff } from "@/app/staff/requests/actions";

export type HandoffDevice = { id: string; label: string; location: string | null };

export function HandoffPanel({
  requestId,
  requestCode,
  readyDevices,
  notReadyCount,
}: {
  requestId: string;
  requestCode: string;
  readyDevices: HandoffDevice[];
  notReadyCount: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(readyDevices.map((d) => d.id)));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await confirmHandoff({ requestId, deviceIds: [...selected] });
    setBusy(false);
    setConfirming(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  if (readyDevices.length === 0 && notReadyCount === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg text-atb-navy">Hand over to partner</h2>
        <Link href={`/volunteer/picklist/${requestCode}`} className="text-sm text-atb-green hover:underline">
          Open pick list &rarr;
        </Link>
      </div>
      {notReadyCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {notReadyCount} set-aside device{notReadyCount === 1 ? " is" : "s are"} still being prepared.
        </p>
      )}
      {readyDevices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No devices are Ready For Deployment yet.</p>
      ) : (
        <>
          <ul className="space-y-1">
            {readyDevices.map((d) => (
              <li key={d.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                  <span className="font-mono text-xs">{d.id}</span>
                  <span>{d.label}</span>
                  <span className="text-xs text-muted-foreground">{d.location ?? "No shelf"}</span>
                </label>
              </li>
            ))}
          </ul>
          {!confirming ? (
            <Button size="sm" disabled={selected.size === 0} onClick={() => setConfirming(true)}>
              Confirm handoff ({selected.size})
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border bg-zinc-50 p-3 text-sm">
              <p>
                Mark {selected.size} device{selected.size === 1 ? "" : "s"} as Deployed to this partner today? This
                updates the inventory and can&apos;t be undone here.
              </p>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={handleConfirm}>
                  {busy ? "Saving…" : "Yes, handed over"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
