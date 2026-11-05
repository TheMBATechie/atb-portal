"use client";

import { useState } from "react";

export type PickItem = {
  id: string;
  label: string;
  status: string;
  location: string | null;
  accessories: string;
};

// Packing aid only: ticks are kept on this screen, not saved.
export function PicklistChecklist({ items }: { items: PickItem[] }) {
  const [packed, setPacked] = useState<Set<string>>(new Set());
  const readyCount = items.filter((i) => i.status === "Ready For Deployment").length;

  function toggle(id: string) {
    setPacked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Packed {packed.size} of {readyCount} ready device{readyCount === 1 ? "" : "s"}.
      </p>
      <ul className="space-y-2">
        {items.map((item) => {
          const ready = item.status === "Ready For Deployment";
          return (
            <li key={item.id}>
              <label
                className={`flex items-start gap-3 rounded-lg border bg-white p-3 ${ready ? "" : "opacity-50"}`}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-5"
                  disabled={!ready}
                  checked={packed.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="space-y-1 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{item.id}</span>
                    <span className="font-medium">{item.label}</span>
                  </span>
                  <span className="block">
                    Shelf <span className="font-semibold">{item.location ?? "not set"}</span> · Pack:{" "}
                    {item.accessories}
                  </span>
                  {!ready && <span className="block text-xs">Not ready yet ({item.status})</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
