"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { draftThankYou } from "@/app/staff/impact/actions";

export function ThankYouDraft({ donor }: { donor: string }) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleDraft() {
    setBusy(true);
    setNote(null);
    const result = await draftThankYou(donor);
    setBusy(false);
    if (!result.ok) {
      setNote(result.message);
      return;
    }
    setDraft(result.draft);
    setNote(
      result.usedAi
        ? "Draft written from the numbers above. Please read and edit before sending."
        : "AI was unavailable, so here's a starter draft from the numbers above. Edit before sending."
    );
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote("Couldn't copy automatically. Select the text and copy it by hand.");
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(`Thank you from Atlanta Tech Bank`)}&body=${encodeURIComponent(draft)}`;

  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Thank-you letter</h2>
        <Button size="sm" variant="outline" disabled={busy} onClick={handleDraft}>
          {busy ? "Drafting…" : draft ? "Draft again" : "Draft thank-you"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Uses only the totals on this page. Recipient names are never included.
      </p>
      {note && <p className="text-sm text-zinc-700">{note}</p>}
      {draft && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-64 w-full rounded-md border px-3 py-2 text-sm leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <a href={mailto} className="text-sm text-sky-700 hover:underline">
              Open in email
            </a>
            <span className="text-xs text-muted-foreground">You&apos;ll add the donor&apos;s email address.</span>
          </div>
        </>
      )}
    </section>
  );
}
