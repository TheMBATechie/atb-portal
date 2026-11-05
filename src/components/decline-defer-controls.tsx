"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { declineRequest, deferRequest } from "@/app/staff/requests/actions";

export function DeclineDeferControls({
  requestId,
  status,
  declineMessage,
}: {
  requestId: string;
  status: string;
  declineMessage: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"decline" | "defer" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDecline() {
    setBusy("decline");
    setError(null);
    const result = await declineRequest({ requestId, message });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("");
    router.refresh();
  }

  async function handleDefer() {
    setBusy("defer");
    setError(null);
    const result = await deferRequest({ requestId, message });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("");
    router.refresh();
  }

  if (status === "declined") {
    return (
      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-1 font-semibold">Decline / defer</h2>
        <p className="text-sm text-muted-foreground">This request was declined. {declineMessage}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-3 font-semibold">Decline / defer</h2>
      <div className="space-y-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message to the partner (required for either action)"
          className="h-20 w-full rounded-md border px-2 py-1.5 text-sm"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleDefer} disabled={busy !== null}>
            {busy === "defer" ? "Saving…" : "Defer (ask for more info)"}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDecline} disabled={busy !== null}>
            {busy === "decline" ? "Saving…" : "Decline"}
          </Button>
        </div>
      </div>
    </section>
  );
}
