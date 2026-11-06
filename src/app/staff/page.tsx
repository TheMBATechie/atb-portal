import { createAdminClient } from "@/lib/supabase/server-admin";
import { DEVICE_STATUSES, isDeviceCategory } from "@/lib/devices";
import { getSelectedSite } from "@/lib/site";
import Link from "next/link";
import { staffStatusLabel } from "@/lib/requests";

export const instant = false;

type PipelineRow = {
  status: string;
  laptop: number;
  desktop: number;
  tablet: number;
  other: number;
  total: number;
  reserved: number;
};

function emptyRow(status: string): PipelineRow {
  return { status, laptop: 0, desktop: 0, tablet: 0, other: 0, total: 0, reserved: 0 };
}

const REQUEST_STATUS_ORDER = [
  "submitted",
  "needs_info",
  "scheduled",
  "matched",
  "partially_matched",
  "in_prep",
  "ready_for_pickup",
  "delivered",
  "partially_delivered",
  "closed",
  "declined",
];

export default async function StaffOverviewPage() {
  const supabase = createAdminClient();
  const site = await getSelectedSite();
  let devicesQuery = supabase.from("devices").select("status, device_category, reserved_request_id, import_flags");
  let requestsQuery = supabase
    .from("requests")
    .select("code, org_name, status, bucket, staff_priority, needed_by")
    .order("staff_priority", { ascending: true, nullsFirst: false });
  if (site) {
    devicesQuery = devicesQuery.eq("site_id", site);
    requestsQuery = requestsQuery.eq("site_id", site);
  }

  const [devicesRes, requestsRes] = await Promise.all([devicesQuery, requestsQuery]);

  if (devicesRes.error || requestsRes.error) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-destructive">
        Could not load the overview right now. Try reloading the page.
      </div>
    );
  }

  const devices = devicesRes.data ?? [];
  const requests = requestsRes.data ?? [];
  // This month's plan: requests staff put in the "This month" bucket that aren't finished yet.
  const thisMonth = requests.filter(
    (r) => r.bucket === "this_month" && !["delivered", "partially_delivered", "closed", "declined"].includes(r.status)
  );
  const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

  // Reservation is NOT a status (PLAN.md section 4) — a reserved device still
  // shows under its real status row; "reserved" is a separate column.
  const pipeline = new Map<string, PipelineRow>();
  for (const status of DEVICE_STATUSES) pipeline.set(status, emptyRow(status));

  for (const d of devices) {
    let row = pipeline.get(d.status);
    if (!row) {
      row = emptyRow(d.status);
      pipeline.set(d.status, row);
    }
    const category = isDeviceCategory(d.device_category) ? d.device_category : "other";
    row[category] += 1;
    row.total += 1;
    if (d.reserved_request_id) row.reserved += 1;
  }

  const knownStatuses = new Set<string>(DEVICE_STATUSES);
  const pipelineRows = [
    ...DEVICE_STATUSES.map((status) => pipeline.get(status)!),
    // devices.status has no DB check constraint — surface anything unexpected
    // instead of silently dropping it.
    ...[...pipeline.values()].filter((row) => !knownStatuses.has(row.status)),
  ];

  const totalDevices = devices.length;
  const totalReserved = pipelineRows.reduce((sum, row) => sum + row.reserved, 0);

  const requestCounts = new Map<string, number>();
  for (const r of requests) {
    requestCounts.set(r.status, (requestCounts.get(r.status) ?? 0) + 1);
  }
  const requestRows = [
    ...REQUEST_STATUS_ORDER.filter((s) => requestCounts.has(s)).map(
      (s) => [s, requestCounts.get(s)!] as const
    ),
    ...[...requestCounts.entries()].filter(([s]) => !REQUEST_STATUS_ORDER.includes(s)),
  ];

  const flagCounts = new Map<string, number>();
  for (const d of devices) {
    for (const flag of d.import_flags ?? []) {
      flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
    }
  }
  const flagRows = [...flagCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {totalDevices} devices tracked &middot; {totalReserved} currently reserved
        </p>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">Device pipeline</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 text-right font-medium">Laptop</th>
                <th className="px-2 py-1.5 text-right font-medium">Desktop</th>
                <th className="px-2 py-1.5 text-right font-medium">Tablet</th>
                <th className="px-2 py-1.5 text-right font-medium">Other</th>
                <th className="px-2 py-1.5 text-right font-medium">Total</th>
                <th className="px-2 py-1.5 text-right font-medium">Reserved</th>
              </tr>
            </thead>
            <tbody>
              {pipelineRows.map((row) => (
                <tr key={row.status} className="border-b last:border-0">
                  <td className="px-2 py-1.5">{row.status}</td>
                  <td className="px-2 py-1.5 text-right">{row.laptop}</td>
                  <td className="px-2 py-1.5 text-right">{row.desktop}</td>
                  <td className="px-2 py-1.5 text-right">{row.tablet}</td>
                  <td className="px-2 py-1.5 text-right">{row.other}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{row.total}</td>
                  <td className="px-2 py-1.5 text-right">{row.reserved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">This month&apos;s plan ({thisMonth.length})</h2>
          <Link href="/staff/requests" className="text-sm text-muted-foreground hover:underline">
            Planning board &rarr;
          </Link>
        </div>
        {thisMonth.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing planned for this month yet. Move requests to &quot;This month&quot; on the planning board.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {thisMonth.map((r) => (
              <li key={r.code} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <Link href={`/staff/requests/${r.code}`} className="font-mono text-xs hover:underline">
                    {r.code}
                  </Link>{" "}
                  <span className="font-medium">{r.org_name}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {staffStatusLabel(r.status, r.bucket)}
                  {r.staff_priority ? ` · priority ${r.staff_priority}` : ""}
                  {r.needed_by ? ` · needed by ${shortDate.format(new Date(`${r.needed_by}T00:00:00`))}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 font-semibold">Requests by status</h2>
          {requestRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {requestRows.map(([status, count]) => (
                <li key={status} className="flex justify-between">
                  <span>{status === "scheduled" ? "Planned" : staffStatusLabel(status, null)}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 font-semibold">Data issues found on import</h2>
          {flagRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No import issues flagged in this data set.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {flagRows.map(([flag, count]) => (
                <li key={flag} className="flex justify-between">
                  <span className="capitalize">{flag.replace(/_/g, " ")}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
