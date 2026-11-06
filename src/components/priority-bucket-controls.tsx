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

const segment = (selected: boolean) =>
  `rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
    selected ? "border-atb-navy bg-atb-navy text-white" : "border-zinc-300 bg-white text-atb-navy hover:border-atb-navy/60"
  }`;

// Staff priority (1 = most urgent) and which month to plan the request for.
export function PriorityBucketControls({
  requestId,
  currentPriority,
  currentBucket,
  disabled,
}: {
  requestId: string;
  currentPriority: number | null;
  currentBucket: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();

  const [priority, setPriority] = useState<number | null>(currentPriority);
  const [priorityReason, setPriorityReason] = useState("");
  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const [bucket, setBucketValue] = useState<string | null>(currentBucket);
  const [bucketReason, setBucketReason] = useState("");
  const [bucketBusy, setBucketBusy] = useState(false);
  const [bucketError, setBucketError] = useState<string | null>(null);

  const priorityChanged = priority !== null && priority !== currentPriority;
  const needsPriorityReason = currentPriority !== null && priority !== null && priority < currentPriority;
  const bucketChanged = bucket !== null && bucket !== currentBucket;
  const needsBucketReason = bucketChanged && bucket === "this_month";

  async function handleSavePriority() {
    if (priority === null) return;
    setPriorityBusy(true);
    setPriorityError(null);
    const result = await setStaffPriority({ requestId, newPriority: priority, reason: priorityReason });
    setPriorityBusy(false);
    if (!result.ok) {
      setPriorityError(result.message);
      return;
    }
    setPriorityReason("");
    router.refresh();
  }

  async function handleSaveBucket() {
    if (!bucket) return;
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
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-atb-navy">
          Staff priority <span className="font-normal text-zinc-500">(1 = most urgent)</span>
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Staff priority">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-pressed={priority === n}
              onClick={() => {
                setPriority(n);
                setPriorityError(null);
              }}
              className={`${segment(priority === n)} w-10 disabled:opacity-50`}
            >
              {n}
            </button>
          ))}
        </div>
        {priorityChanged && (
          <div className="space-y-2">
            {needsPriorityReason && (
              <input
                value={priorityReason}
                onChange={(e) => setPriorityReason(e.target.value)}
                placeholder="Why is this more urgent now? (required)"
                className="h-9 w-full rounded-md border border-input px-2 text-sm"
              />
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSavePriority} disabled={priorityBusy}>
                {priorityBusy ? "Saving…" : `Set priority ${priority}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPriority(currentPriority)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {priorityError && <p className="text-xs text-destructive">{priorityError}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-atb-navy">Plan for</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Plan for">
          {BUCKET_OPTIONS.map((b) => (
            <button
              key={b.value}
              type="button"
              disabled={disabled}
              aria-pressed={bucket === b.value}
              onClick={() => {
                setBucketValue(b.value);
                setBucketError(null);
              }}
              className={`${segment(bucket === b.value)} disabled:opacity-50`}
            >
              {b.label}
            </button>
          ))}
        </div>
        {bucketChanged && (
          <div className="space-y-2">
            {needsBucketReason && (
              <input
                value={bucketReason}
                onChange={(e) => setBucketReason(e.target.value)}
                placeholder="Why does this need to happen this month? (required)"
                className="h-9 w-full rounded-md border border-input px-2 text-sm"
              />
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveBucket} disabled={bucketBusy}>
                {bucketBusy ? "Saving…" : "Save plan"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBucketValue(currentBucket)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {bucketError && <p className="text-xs text-destructive">{bucketError}</p>}
      </div>
    </div>
  );
}
