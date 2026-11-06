"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Result = { ok: true } | { ok: false; message: string };

// Rating 1–5 + note. Used by partners on /status and by staff on the request page.
export function FeedbackForm({
  onSubmit,
  prompt,
  ratingRequired,
  thanks,
}: {
  onSubmit: (input: { rating: number | null; body: string }) => Promise<Result>;
  prompt: string;
  ratingRequired: boolean;
  thanks: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (ratingRequired && !rating) {
      setError("Pick a rating from 1 to 5.");
      return;
    }
    if (!body.trim()) {
      setError("Write a short note.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onSubmit({ rating, body });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(true);
    setRating(null);
    setBody("");
    router.refresh();
  }

  if (done) return <p className="text-sm font-medium text-emerald-700">{thanks}</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm">{prompt}</p>
      <div className="flex flex-wrap items-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={rating === n}
            onClick={() => setRating(rating === n ? null : n)}
            className={`h-9 w-9 rounded-full border text-sm ${
              rating === n ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white hover:border-zinc-400"
            }`}
          >
            {n}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">1 = not well, 5 = very well</span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="How are the devices being used? Anything we should know?"
        className="min-h-20 w-full rounded-md border px-2 py-1.5 text-sm"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={busy} onClick={handleSubmit}>
        {busy ? "Sending…" : "Send feedback"}
      </Button>
    </div>
  );
}

export function FeedbackList({
  items,
}: {
  items: { id: number; source: string; rating: number | null; body: string; created_at: string; code?: string }[];
}) {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No feedback yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={f.id} className="space-y-1 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-700">
              {f.source === "partner" ? "Partner" : "Staff"}
            </span>
            {f.rating && <span aria-label={`${f.rating} out of 5`}>{"★".repeat(f.rating) + "☆".repeat(5 - f.rating)}</span>}
            {f.code && <span className="font-mono">{f.code}</span>}
            <span>{fmt.format(new Date(f.created_at))}</span>
          </p>
          <p>{f.body}</p>
        </li>
      ))}
    </ul>
  );
}
