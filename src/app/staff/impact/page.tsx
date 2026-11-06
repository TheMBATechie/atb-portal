import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { listDonors, loadDonorImpact } from "@/lib/donor-impact";
import { ThankYouDraft } from "@/components/thank-you-draft";

export const instant = false;

function Bars({ items }: { items: { name: string; count: number; href?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <p className="text-sm text-muted-foreground">None yet.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((i) => (
        <li key={i.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          <span className="truncate">{i.href ? <Link href={i.href} className="hover:underline">{i.name}</Link> : i.name}</span>
          <span className="tabular-nums text-muted-foreground">{i.count}</span>
          <span className="col-span-2 h-1.5 rounded bg-zinc-100">
            <span className="block h-1.5 rounded bg-sky-600" style={{ width: `${(i.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default async function ImpactPage({ searchParams }: PageProps<"/staff/impact">) {
  const raw = (await searchParams).donor;
  const donor = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const donors = await listDonors();
  const impact = donor ? await loadDonorImpact(donor) : null;

  // Link partner names to their history page.
  const partnerIds = new Map<string, string>();
  if (impact?.byPartner.length) {
    const { data } = await createAdminClient()
      .from("partners")
      .select("id, name")
      .in("name", impact.byPartner.map((p) => p.name));
    for (const p of data ?? []) partnerIds.set(p.name, p.id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Donor impact</h1>
        <p className="text-sm text-muted-foreground">
          Pick a donor to see where their devices went, then draft a thank-you.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-2 rounded-lg border bg-white p-4">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Donor</span>
          <select name="donor" defaultValue={donor} className="h-9 rounded-md border px-2 text-sm">
            <option value="" disabled>
              Choose a donor…
            </option>
            {donors.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.count} devices)
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Show impact</Button>
      </form>

      {donor && !impact && (
        <p className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">No devices found for that donor.</p>
      )}

      {impact && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Devices donated" value={impact.received} />
            <Stat label="Placed with partners" value={impact.placed} />
            <Stat label="Still being prepared" value={impact.inPipeline.reduce((n, p) => n + p.count, 0)} />
            <Stat label="Recycled" value={impact.recycled} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 font-semibold">Where they went</h2>
              <Bars
                items={impact.byPartner.map((p) => ({
                  ...p,
                  href: partnerIds.has(p.name) ? `/staff/partners/${partnerIds.get(p.name)}` : undefined,
                }))}
              />
            </section>
            <section className="space-y-4 rounded-lg border bg-white p-4">
              <div>
                <h2 className="mb-3 font-semibold">Areas served</h2>
                <Bars items={impact.byCategory} />
              </div>
              <div>
                <h2 className="mb-3 font-semibold">Device types donated</h2>
                <Bars items={impact.byType} />
              </div>
            </section>
          </div>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 font-semibold">Placed per month</h2>
            <Bars items={impact.byMonth.map((m) => ({ name: m.label, count: m.count }))} />
            {impact.inPipeline.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Still in the warehouse: {impact.inPipeline.map((p) => `${p.count} in ${p.status}`).join(", ")}.
              </p>
            )}
          </section>

          <ThankYouDraft key={impact.donor} donor={impact.donor} />
        </>
      )}
    </div>
  );
}
