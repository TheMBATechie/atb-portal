"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { advanceDevice, advanceDevices } from "@/app/volunteer/actions";
import { FlagConcern } from "@/components/flag-concern";

export type QueueRow = {
  id: string;
  label: string;
  status: string;
  location: string | null;
  grade: string | null;
  request?: { id: string; code: string; org: string };
};

export type QueueGroup = { key: string; title: string; rows: QueueRow[]; hiddenCount?: number; showAllHref?: string };

const TECH_PREP = "Technical Prep Zone";
const QA = "Quality Assurance Zone";
const READY = "Ready For Deployment";

// Compact, check-and-go work queue. Tick devices, then use the bar at the bottom.
export function VolunteerQueue({ groups }: { groups: QueueGroup[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const allRows = groups.flatMap((g) => g.rows);
  const statusOf = new Map(allRows.map((r) => [r.id, r.status]));
  const selectedPrep = [...selected].filter((id) => statusOf.get(id) === TECH_PREP);
  const selectedQa = [...selected].filter((id) => statusOf.get(id) === QA);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(rows: QueueRow[]) {
    const ids = rows.filter((r) => r.status !== READY).map((r) => r.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function runBulk(ids: string[], qaResult?: "Pass" | "Pass with Approved Limitation") {
    setBusy(true);
    setMessage(null);
    const result = await advanceDevices({ deviceIds: ids, qaResult });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    const verb = qaResult ? "passed QA" : "moved to QA";
    setMessage(
      result.failed.length
        ? {
            tone: "error",
            text: `${result.done} ${verb}. ${result.failed.length} couldn't be updated (someone may have moved them): ${result.failed.join(", ")}.`,
          }
        : { tone: "ok", text: `${result.done} device${result.done === 1 ? "" : "s"} ${verb}.` }
    );
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-28">
      {message && (
        <p
          role="status"
          className={`rounded-lg p-3 text-sm ${
            message.tone === "ok" ? "bg-atb-green/10 text-atb-green" : "bg-red-50 text-destructive"
          }`}
        >
          {message.text}
        </p>
      )}

      {groups.map((group) => {
        const selectable = group.rows.filter((r) => r.status !== READY);
        const allOn = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
        return (
          <section key={group.key} className="overflow-hidden rounded-xl border bg-white">
            <header className="flex items-center justify-between gap-2 border-b bg-zinc-50 px-3 py-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-atb-navy">
                {selectable.length > 0 && (
                  <input
                    type="checkbox"
                    className="size-5 accent-atb-navy"
                    checked={allOn}
                    onChange={() => toggleGroup(group.rows)}
                    aria-label={`Select all in ${group.title}`}
                  />
                )}
                {group.title}
                <span className="font-normal text-zinc-500">({group.rows.length + (group.hiddenCount ?? 0)})</span>
              </label>
            </header>
            {group.rows.length === 0 ? (
              <p className="px-3 py-3 text-sm text-zinc-500">Nothing here right now.</p>
            ) : (
              <ul className="divide-y">
                {group.rows.map((row) => (
                  <Row key={row.id} row={row} checked={selected.has(row.id)} onToggle={() => toggle(row.id)} />
                ))}
              </ul>
            )}
            {group.showAllHref && (group.hiddenCount ?? 0) > 0 && (
              <Link href={group.showAllHref} className="block border-t px-3 py-2 text-sm font-medium text-atb-green hover:underline">
                Show {group.hiddenCount} more
              </Link>
            )}
          </section>
        );
      })}

      {/* Sticky bulk-action bar */}
      {selected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 px-4 pt-3 shadow-[0_-4px_16px_rgba(24,30,75,0.08)] backdrop-blur"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
            <span className="mr-auto text-sm font-semibold text-atb-navy">{selected.size} selected</span>
            {selectedPrep.length > 0 && (
              <Button disabled={busy} onClick={() => runBulk(selectedPrep)}>
                Move {selectedPrep.length} to QA
              </Button>
            )}
            {selectedQa.length > 0 && (
              <>
                <Button disabled={busy} onClick={() => runBulk(selectedQa, "Pass")}>
                  QA Pass {selectedQa.length}
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => runBulk(selectedQa, "Pass with Approved Limitation")}>
                  Pass with limitation
                </Button>
              </>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          {busy && <p className="mx-auto mt-1 max-w-2xl text-xs text-zinc-500">Saving…</p>}
        </div>
      )}
    </div>
  );
}

function Row({ row, checked, onToggle }: { row: QueueRow; checked: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState<"none" | "fail" | "flag">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = row.status === READY;

  async function fail() {
    setBusy(true);
    setError(null);
    const result = await advanceDevice({ deviceId: row.id, qaResult: "Fail" });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen("none");
    router.refresh();
  }

  return (
    <li className={`px-3 py-2.5 ${checked ? "bg-atb-blush/60" : ""}`}>
      <div className="flex items-start gap-3">
        {ready ? (
          <span className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        ) : (
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-atb-navy"
            checked={checked}
            onChange={onToggle}
            aria-label={`Select ${row.id}`}
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-atb-navy">{row.id}</span>
            <span className="font-medium text-atb-navy">{row.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
            <span>
              Shelf <span className="font-semibold text-atb-navy">{row.location ?? "—"}</span>
            </span>
            <span>Grade {row.grade ?? "?"}</span>
            {row.request && (
              <Link
                href={`/volunteer/requests/${row.request.code}`}
                className="rounded-full bg-atb-peach px-2 py-0.5 font-medium text-atb-navy hover:underline"
                title="See what this partner asked for"
              >
                {row.request.code} · {row.request.org}
              </Link>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {ready && row.request && (
            <Link href={`/volunteer/picklist/${row.request.code}`} className="text-xs font-medium text-atb-green hover:underline">
              Pick list
            </Link>
          )}
          {row.status === QA && (
            <button
              type="button"
              onClick={() => setOpen(open === "fail" ? "none" : "fail")}
              className="text-xs font-medium text-destructive hover:underline"
            >
              QA Fail…
            </button>
          )}
          {row.request && (
            <button
              type="button"
              onClick={() => setOpen(open === "flag" ? "none" : "flag")}
              className="text-xs font-medium text-zinc-600 hover:underline"
            >
              Flag
            </button>
          )}
        </div>
      </div>

      {open === "fail" && (
        <div className="mt-2 ml-8 space-y-2 rounded-md border border-destructive/30 bg-red-50 p-2 text-sm">
          <p>
            Mark {row.id} as failed QA? It moves to Hold - Troubleshooting
            {row.request ? ` and is released from ${row.request.code}, so staff can pick a replacement` : ""}.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={busy} onClick={fail}>
              {busy ? "Saving…" : "Yes, it failed"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen("none")}>
              Cancel
            </Button>
          </div>
          {error && <p className="text-destructive">{error}</p>}
        </div>
      )}

      {open === "flag" && row.request && (
        <div className="mt-2 ml-8">
          <FlagConcern requestId={row.request.id} deviceId={row.id} onDone={() => setOpen("none")} />
        </div>
      )}
    </li>
  );
}
