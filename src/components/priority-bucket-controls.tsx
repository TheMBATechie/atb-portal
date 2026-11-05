"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setBucket, setStaffPriority } from "@/app/staff/requests/actions";

const BUCKET_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "next_month", label: "Next month" },
  { value: "later", label: "Later" },
] as const;

export function PriorityBucketControls({
  requestId,
  currentPriority,
  currentBucket,
}: {
  requestId: string;
  currentPriority: number | null;
  currentBucket: string | null;
}) {
  const router = useRouter();

  const [priority, setPriority] = useState(currentPriority ? String(currentPriority) : "");
  const [priorityReason, setPriorityReason] = useState("");
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const [bucket, setBucketValue] = useState(currentBucket ?? "");
  const [bucketReason, setBucketReason] = useState("");
  const [bucketBusy, setBucketBusy] = useState(false);
  const [bucketError, setBucketError] = useState<string | null>(null);

  const priorityNum = Number(priority);
  const needsPriorityReason =
    currentPriority !== null && Number.isInteger(priorityNum) && priorityNum < currentPriority;
  const needsBucketReason = bucket === "this_month";

  async function handleSavePriority() {
    if (!priority) {
      setPriorityError("Choose a priority.");
      return;
    }
    setPriorityBusy(true);
    setPriorityError(null);
    const result = await setStaffPriority({ requestId, newPriority: Number(priority), reason: priorityReason });
    setPriorityBusy(false);
    if (!result.ok) {
      setPriorityError(result.message);
      return;
    }
    setPriorityReason("");
    router.refresh();
  }

  async function handleSaveBucket() {
    if (!bucket) {
      setBucketError("Choose a bucket.");
      return;
    }
    setBucketBusy(true);
    setBucketError(null);
    const result = await setBucket({
      requestId,
      newBucket: bucket as "this_month" | "next_month" | "later",
      reason: bucketReason,
    });
    setBucketBusy(false);
    if (!result.ok) {
      setBucketError(result.message);
      return;
    }
    setBucketReason("");
    router.refresh();
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-3 font-semibold">Priority &amp; schedule</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Staff priority (1 = highest, currently {currentPriority ?? "not set"})
          </label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9 w-full rounded-md border px-2 text-sm">
            <option value="">Not set</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {needsPriorityReason && (
            <input
              value={priorityReason}
              onChange={(e) => setPriorityReason(e.target.value)}
              placeholder="Why are you raising this request's priority?"
              className="h-9 w-full rounded-md border px-2 text-sm"
            />
          )}
          {priorityError && <p className="text-xs text-destructive">{priorityError}</p>}
          <Button size="sm" onClick={handleSavePriority} disabled={priorityBusy}>
            {priorityBusy ? "Saving…" : "Save priority"}
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Bucket (currently {currentBucket ?? "not scheduled"})
          </label>
          <select value={bucket} onChange={(e) => setBucketValue(e.target.value)} className="h-9 w-full rounded-md border px-2 text-sm">
            <option value="">Choose a bucket…</option>
            {BUCKET_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          {needsBucketReason && (
            <input
              value={bucketReason}
              onChange={(e) => setBucketReason(e.target.value)}
              placeholder="Why is this moving to This month?"
              className="h-9 w-full rounded-md border px-2 text-sm"
            />
          )}
          {bucketError && <p className="text-xs text-destructive">{bucketError}</p>}
          <Button size="sm" onClick={handleSaveBucket} disabled={bucketBusy}>
            {bucketBusy ? "Saving…" : "Save bucket"}
          </Button>
        </div>
      </div>
    </section>
  );
}
