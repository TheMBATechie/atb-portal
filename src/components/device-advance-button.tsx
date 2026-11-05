"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { advanceDevice } from "@/app/volunteer/actions";
import type { QaResult } from "@/lib/devices";

export function DeviceAdvanceButton({ deviceId, status }: { deviceId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmFail, setConfirmFail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(qaResult?: QaResult) {
    setBusy(true);
    setError(null);
    const result = await advanceDevice({ deviceId, qaResult });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setConfirmFail(false);
    router.refresh();
  }

  if (status !== "Technical Prep Zone" && status !== "Quality Assurance Zone") return null;

  return (
    <div className="space-y-2">
      {status === "Technical Prep Zone" && (
        <Button className="h-11 w-full" disabled={busy} onClick={() => run()}>
          {busy ? "Saving…" : "Prep done: move to QA"}
        </Button>
      )}

      {status === "Quality Assurance Zone" && !confirmFail && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button className="h-11" disabled={busy} onClick={() => run("Pass")}>
            QA Pass
          </Button>
          <Button className="h-11" variant="outline" disabled={busy} onClick={() => run("Pass with Approved Limitation")}>
            Pass with limitation
          </Button>
          <Button className="h-11" variant="outline" disabled={busy} onClick={() => setConfirmFail(true)}>
            QA Fail
          </Button>
        </div>
      )}

      {confirmFail && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-red-50 p-2 text-sm">
          <p>
            Mark {deviceId} as failed? It goes to Hold - Troubleshooting and, if it was set aside for a request, staff
            will be asked to pick a replacement.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" className="h-10 flex-1" disabled={busy} onClick={() => run("Fail")}>
              {busy ? "Saving…" : "Yes, it failed"}
            </Button>
            <Button variant="ghost" className="h-10" onClick={() => setConfirmFail(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
