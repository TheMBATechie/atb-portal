"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  reallocateDevices,
  releaseDevices,
  reserveDevices,
  setAllowSubstitutes,
  swapDevice,
} from "@/app/staff/requests/actions";

export type PanelDevice = {
  id: string;
  label: string; // e.g. "Laptop (Windows) · Dell"
  status: string;
  grade: string | null;
  location: string | null;
  flags: string[];
};

export type PanelLine = {
  lineId: string;
  title: string; // e.g. "15× Laptop · Windows (required)"
  summary: string;
  stillNeeded: number;
  groups: { key: string; title: string; devices: PanelDevice[] }[];
  preselected: string[];
};

export type PanelReserved = PanelDevice & { lineId: string };

export function MatchPanel({
  requestId,
  lines,
  reserved,
  includeHolds,
  holdsToggleHref,
  includeHeld,
  heldToggleHref,
  allowSubstitutes,
  canEdit,
}: {
  requestId: string;
  lines: PanelLine[];
  reserved: PanelReserved[];
  includeHolds: boolean;
  holdsToggleHref: string;
  includeHeld: boolean;
  heldToggleHref: string;
  allowSubstitutes: boolean;
  canEdit: boolean;
}) {
  return (
    <section className="space-y-4 rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Match devices</h2>
        <span className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <Link href={holdsToggleHref} scroll={false} className="hover:underline">
            {includeHolds ? "Hide devices on hold" : "Show devices on hold"}
          </Link>
          <Link href={heldToggleHref} scroll={false} className="hover:underline">
            {includeHeld ? "Hide devices held by other requests" : "Show devices held by other requests"}
          </Link>
        </span>
      </div>
      {canEdit && <SubstitutesControl requestId={requestId} allowed={allowSubstitutes} />}
      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          This request is closed or declined, so devices can&apos;t be reserved for it.
        </p>
      )}

      <ReservedList requestId={requestId} reserved={reserved} lines={lines} canEdit={canEdit} />

      {lines.map((line) => (
        <LineMatcher key={`${line.lineId}-${includeHolds}-${includeHeld}-${allowSubstitutes}-${reserved.length}`} requestId={requestId} line={line} canEdit={canEdit} />
      ))}
    </section>
  );
}

function FlagBadges({ device }: { device: PanelDevice }) {
  return (
    <>
      {device.flags.map((f) => (
        <span
          key={f}
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            f.startsWith("Substitute")
              ? "bg-amber-100 text-amber-800"
              : f.startsWith("Held by")
                ? "bg-red-100 text-red-800"
                : "bg-atb-peach text-atb-navy"
          }`}
        >
          {f}
        </span>
      ))}
    </>
  );
}

function DeviceText({ device }: { device: PanelDevice }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono text-xs">{device.id}</span>
      <span>{device.label}</span>
      <span className="text-xs text-muted-foreground">
        Grade {device.grade ?? "?"} · {device.location ?? "No shelf"}
      </span>
      <FlagBadges device={device} />
    </span>
  );
}

function LineMatcher({ requestId, line, canEdit }: { requestId: string; line: PanelLine; canEdit: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(line.preselected));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moveReason, setMoveReason] = useState("");

  const heldIds = new Set(
    line.groups.flatMap((g) => g.devices).filter((d) => d.flags.some((f) => f.startsWith("Held by"))).map((d) => d.id)
  );
  const selectedHeld = [...selected].filter((id) => heldIds.has(id));

  async function handleReallocate() {
    setBusy(true);
    setError(null);
    const result = await reallocateDevices({
      toRequestId: requestId,
      toLineId: line.lineId,
      deviceIds: selectedHeld,
      reason: moveReason,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSelected(new Set());
    setMoveReason("");
    router.refresh();
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleReserve() {
    setBusy(true);
    setError(null);
    const result = await reserveDevices({ requestId, lineId: line.lineId, deviceIds: [...selected] });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  const total = line.groups.reduce((n, g) => n + g.devices.length, 0);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <h3 className="text-sm font-semibold">{line.title}</h3>
        <p className="text-sm">{line.summary}</p>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No other devices fit this line right now.</p>
      ) : (
        line.groups
          .filter((g) => g.devices.length > 0)
          .map((group) => (
            <div key={group.key}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title} ({group.devices.length})
              </h4>
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {group.devices.map((d) => (
                  <li key={d.id}>
                    <label className="flex items-start gap-2 rounded px-1 py-0.5 text-sm hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.has(d.id)}
                        disabled={!canEdit}
                        onChange={() => toggle(d.id)}
                      />
                      <DeviceText device={d} />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {canEdit && total > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={handleReserve} disabled={busy || selected.size === 0}>
            {busy ? "Reserving…" : `Reserve selected (${selected.size})`}
          </Button>
          <span className="text-xs text-muted-foreground">
            {line.stillNeeded > 0 ? `${line.stillNeeded} still needed for this line.` : "This line is fully covered."}
          </span>
        </div>
      )}
      {canEdit && selectedHeld.length > 0 && (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <p>
            {selectedHeld.length} ticked device{selectedHeld.length === 1 ? " is" : "s are"} set aside for another
            request. <strong>Reserve</strong> will be blocked. If this request is more urgent, move{" "}
            {selectedHeld.length === 1 ? "it" : "them"} here instead. The other request will be told to pick a
            replacement.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={moveReason}
              onChange={(e) => setMoveReason(e.target.value)}
              placeholder="Why is this more urgent? (required)"
              className="h-8 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm"
            />
            <Button size="sm" variant="destructive" disabled={busy} onClick={handleReallocate}>
              {busy ? "Moving…" : `Move ${selectedHeld.length} to this request`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReservedList({
  requestId,
  reserved,
  lines,
  canEdit,
}: {
  requestId: string;
  reserved: PanelReserved[];
  lines: PanelLine[];
  canEdit: boolean;
}) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
      <h3 className="mb-2 text-sm font-semibold">Set aside for this request ({reserved.length})</h3>
      {reserved.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing reserved yet. Tick devices below and click Reserve.</p>
      ) : (
        <ul className="space-y-2">
          {reserved.map((d) => (
            <ReservedRow
              key={d.id}
              requestId={requestId}
              device={d}
              swapOptions={(lines.find((l) => l.lineId === d.lineId) ?? lines[0])?.groups.flatMap((g) => g.devices) ?? []}
              lineId={lines.some((l) => l.lineId === d.lineId) ? d.lineId : lines[0]?.lineId}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReservedRow({
  requestId,
  device,
  swapOptions,
  lineId,
  canEdit,
}: {
  requestId: string;
  device: PanelReserved;
  swapOptions: PanelDevice[];
  lineId: string | undefined;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "release" | "swap">("idle");
  const [reason, setReason] = useState("");
  const [swapTo, setSwapTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMode("idle");
    setReason("");
    setSwapTo("");
    router.refresh();
  }

  return (
    <li className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <DeviceText device={device} />
          <span className="text-xs text-muted-foreground">({device.status})</span>
        </span>
        {canEdit && mode === "idle" && (
          <span className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setMode("swap")} disabled={!lineId}>
              Swap
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("release")}>
              Release
            </Button>
          </span>
        )}
      </div>

      {mode === "release" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you releasing this device?"
            className="h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
          />
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run(() => releaseDevices({ requestId, deviceIds: [device.id], reason }))}
          >
            {busy ? "Releasing…" : "Release"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      )}

      {mode === "swap" && lineId && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={swapTo}
            onChange={(e) => setSwapTo(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
          >
            <option value="">Choose a device to swap in…</option>
            {swapOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.label} · {o.status} · Grade {o.grade ?? "?"}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={busy || !swapTo}
            onClick={() =>
              run(() => swapDevice({ requestId, lineId, oldDeviceId: device.id, newDeviceId: swapTo }))
            }
          >
            {busy ? "Swapping…" : "Swap"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}

function SubstitutesControl({ requestId, allowed }: { requestId: string; allowed: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(allow: boolean) {
    setBusy(true);
    setError(null);
    const result = await setAllowSubstitutes({ requestId, allow, reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditing(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-md bg-zinc-50 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Substitutes (lower grade, or desktop for laptop):{" "}
          <span className="font-medium">{allowed ? "allowed" : "not allowed"}</span>
        </span>
        {!editing &&
          (allowed ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(false)}>
              Turn off
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Allow substitutes…
            </Button>
          ))}
      </div>
      {editing && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? e.g. Partner OK'd a grade C laptop by phone"
            className="h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
          />
          <Button size="sm" disabled={busy} onClick={() => save(true)}>
            {busy ? "Saving…" : "Allow"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
