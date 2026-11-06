"use client";

import { useRouter } from "next/navigation";
import { setSite } from "@/app/site/actions";

export function SiteSwitcher({
  sites,
  selected,
}: {
  sites: { id: string; name: string; city: string | null }[];
  selected: string | null;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="sr-only sm:not-sr-only">Site</span>
      <select
        value={selected ?? "all"}
        onChange={async (e) => {
          await setSite(e.target.value);
          router.refresh();
        }}
        className="h-8 rounded-md border bg-white px-1.5 text-xs text-zinc-800"
      >
        {sites.length > 1 && <option value="all">All sites</option>}
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.city ?? s.name}
          </option>
        ))}
        {sites.length <= 1 && <option value="all">All sites</option>}
      </select>
    </label>
  );
}
