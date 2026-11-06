"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { flagConcern } from "@/app/volunteer/actions";

// "This doesn't look right": sends a note to staff on the request. Doesn't change any reservation.
export function FlagConcern({
  requestId,
  deviceId,
  onDone,
}: {
  requestId: string;
  deviceId?: string;
  onDone?: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    const result = await flagConcern({ requestId, deviceId, message: text });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
    setText("");
    setTimeout(() => onDone?.(), 1500);
  }

  if (sent) return <p className="text-sm font-medium text-atb-green">Thanks. Staff will see this on the request.</p>;

  return (
    <div className="space-y-2 rounded-md border bg-zinc-50 p-2 text-sm">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          deviceId
            ? "What doesn't match the request? e.g. no webcam, but they asked for one."
            : "What doesn't look right about this request or its devices?"
        }
        className="min-h-16 w-full rounded-md border border-input bg-white px-2 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !text.trim()} onClick={send}>
          {busy ? "Sending…" : "Send to staff"}
        </Button>
        {onDone && (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
