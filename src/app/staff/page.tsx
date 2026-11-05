import { createAdminClient } from "@/lib/supabase/server-admin";
import { DEVICE_STATUSES, isDeviceCategory } from "@/lib/devices";

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

  const [devicesRes, requestsRes] = await Promise.all([
    supabase.from("devices").select("status, device_category, reserved_request_id, import_flags"),
    supabase.from("requests").select("status"),
  ]);

  if (devicesRes.error || requestsRes.error) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-destructive">
        Could not load the overview right now. Try reloading the page.
      </div>
    );
  }

  const devices = devicesRes.data ?? [];
  const requests = requestsRes.data ?? [];

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

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 font-semibold">Requests by status</h2>
          {requestRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {requestRows.map(([status, count]) => (
                <li key={status} className="flex justify-between">
                  <span className="capitalize">{status.replace(/_/g, " ")}</span>
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
