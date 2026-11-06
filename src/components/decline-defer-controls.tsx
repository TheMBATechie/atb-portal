"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { declineRequest, deferRequest } from "@/app/staff/requests/actions";

// Ask the partner for more information, or decline the request. Both need a message.
export function DeclineDeferControls({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"decline" | "defer" | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "decline" | "defer") {
    setBusy(kind);
    setError(null);
    const result = kind === "decline" ? await declineRequest({ requestId, message }) : await deferRequest({ requestId, message });
    setBusy(null);
    setConfirmDecline(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message to the partner. They'll see it when they check their request."
        className="min-h-20 w-full rounded-md border border-input px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!confirmDecline ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => run("defer")} disabled={busy !== null}>
            {busy === "defer" ? "Saving…" : "Ask for more info"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmDecline(true)} disabled={busy !== null}>
            Decline…
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-destructive/30 bg-red-50 p-3 text-sm">
          <p>Decline this request? The partner will see your message. Any devices set aside for it go back to the pool.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => run("decline")} disabled={busy !== null}>
              {busy === "decline" ? "Saving…" : "Yes, decline"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDecline(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
