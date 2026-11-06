"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resolveConcerns } from "@/app/staff/requests/actions";

export function ResolveConcerns({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await resolveConcerns({ requestId, note });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Mark resolved…
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did you do? e.g. swapped ATB-26-5243 for a model with a webcam (optional)"
        className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Mark resolved"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
