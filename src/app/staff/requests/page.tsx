import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { REQUEST_LINE_CATEGORIES, URGENCY_OPTIONS } from "@/lib/requests";
import { suggestedPriorityScore } from "@/lib/priority-score";
import { getSelectedSite } from "@/lib/site";

export const instant = false;

const CATEGORY_LABELS = new Map<string, string>(REQUEST_LINE_CATEGORIES.map((c) => [c.value, c.label]));
const URGENCY_LABELS = new Map<string, string>(URGENCY_OPTIONS.map((u) => [u.value, u.label]));
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

type BoardRequest = {
  id: string;
  code: string;
  org_name: string;
  status: string;
  bucket: string | null;
  staff_priority: number | null;
  partner_urgency: string | null;
  people_served: number | null;
  created_at: string;
  needed_by: string | null;
};

function columnKey(status: string, bucket: string | null): string {
  if (status === "submitted" || status === "needs_info") return "new";
  if (status === "scheduled") {
    if (bucket === "this_month") return "this_month";
    if (bucket === "next_month") return "next_month";
    return "later";
  }
  if (status === "matched" || status === "partially_matched" || status === "in_prep") return "in_progress";
  if (status === "ready_for_pickup") return "ready";
  return "done";
}

const COLUMN_DEFS = [
  { key: "new", title: "New" },
  { key: "this_month", title: "This month" },
  { key: "next_month", title: "Next month" },
  { key: "later", title: "Later" },
  { key: "in_progress", title: "In progress" },
  { key: "ready", title: "Ready" },
  { key: "done", title: "Done / Declined" },
] as const;

export default async function StaffRequestsPage() {
  const supabase = createAdminClient();
  const site = await getSelectedSite();

  let requestsQuery = supabase
    .from("requests")
    .select(
      "id, code, org_name, status, bucket, staff_priority, partner_urgency, people_served, created_at, needed_by"
    )
    .order("created_at", { ascending: true });
  if (site) requestsQuery = requestsQuery.eq("site_id", site);
  const { data: requestsData, error: requestsError } = await requestsQuery;

  if (requestsError) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-destructive">
        Could not load the planning board right now. Try reloading the page.
      </div>
    );
  }

  const requests: BoardRequest[] = requestsData ?? [];
  const requestIds = requests.map((r) => r.id);
  const orgNames = [...new Set(requests.map((r) => r.org_name))];

  const [linesRes, devicesRes] = await Promise.all([
    requestIds.length
      ? supabase.from("request_lines").select("request_id, device_category, quantity").in("request_id", requestIds)
      : Promise.resolve({ data: [] as { request_id: string; device_category: string; quantity: number }[], error: null }),
    orgNames.length
      ? supabase
          .from("devices")
          .select("deployment_partner, deployment_date")
          .in("deployment_partner", orgNames)
          .not("deployment_date", "is", null)
      : Promise.resolve({ data: [] as { deployment_partner: string | null; deployment_date: string | null }[], error: null }),
  ]);

  const linesByRequest = new Map<string, { device_category: string; quantity: number }[]>();
  for (const line of linesRes.data ?? []) {
    const list = linesByRequest.get(line.request_id) ?? [];
    list.push(line);
    linesByRequest.set(line.request_id, list);
  }

  const currentYear = new Date().getFullYear();
  const placedThisYearByOrg = new Map<string, number>();
  for (const d of devicesRes.data ?? []) {
    if (!d.deployment_partner || !d.deployment_date) continue;
    if (new Date(d.deployment_date).getFullYear() !== currentYear) continue;
    placedThisYearByOrg.set(d.deployment_partner, (placedThisYearByOrg.get(d.deployment_partner) ?? 0) + 1);
  }

  const columns = COLUMN_DEFS.map((def) => ({ ...def, requests: [] as BoardRequest[] }));
  const columnsByKey = new Map<string, (typeof columns)[number]>(columns.map((c) => [c.key, c]));
  for (const r of requests) columnsByKey.get(columnKey(r.status, r.bucket))!.requests.push(r);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
        <h1 className="text-2xl font-bold">Planning board</h1>
        <p className="text-sm text-muted-foreground">
          {requests.length} request{requests.length === 1 ? "" : "s"}. Suggested score is a hint only — it is
          never applied automatically.
        </p>
        </div>
        <Link
          href="/staff/requests/new"
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:border-zinc-400"
        >
          New request from an email
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div key={column.key} className="flex w-64 flex-shrink-0 flex-col gap-2">
            <h2 className="flex items-center justify-between text-sm font-semibold text-zinc-600">
              {column.title}
              <span className="text-xs font-normal text-muted-foreground">{column.requests.length}</span>
            </h2>
            <div className="flex flex-col gap-2">
              {column.requests.length === 0 && (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Nothing here.</p>
              )}
              {column.requests.map((r) => {
                const lines = linesByRequest.get(r.id) ?? [];
                const deviceSummary = lines.length
                  ? lines
                      .map((l) => `${l.quantity}× ${CATEGORY_LABELS.get(l.device_category) ?? l.device_category}`)
                      .join(", ")
                  : "No devices listed";
                const score = suggestedPriorityScore({
                  partnerUrgency: r.partner_urgency as "low" | "medium" | "high" | null,
                  neededBy: r.needed_by,
                  peopleServed: r.people_served,
                  createdAt: r.created_at,
                  devicesPlacedThisYear: placedThisYearByOrg.get(r.org_name) ?? 0,
                }).total;

                return (
                  <Link
                    key={r.id}
                    href={`/staff/requests/${r.code}`}
                    className="flex flex-col gap-1 rounded-lg border bg-white p-3 text-sm shadow-sm transition-colors hover:border-zinc-400"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                        Suggested: {score}
                      </span>
                    </div>
                    <p className="font-semibold">{r.org_name}</p>
                    <p className="text-xs text-muted-foreground">{deviceSummary}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Needed by {r.needed_by ? DATE_FORMAT.format(new Date(`${r.needed_by}T00:00:00`)) : "Not set"}
                      </span>
                      <span>{r.partner_urgency ? URGENCY_LABELS.get(r.partner_urgency) : "No urgency set"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Staff priority: {r.staff_priority ?? "Not set"}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
