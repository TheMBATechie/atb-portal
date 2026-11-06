import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getSelectedSite } from "@/lib/site";
import { VolunteerQueue, type QueueGroup, type QueueRow } from "@/components/volunteer-queue";

export const instant = false;

const ZONES = [
  { status: "Quality Assurance Zone", title: "Quality Assurance Zone" },
  { status: "Technical Prep Zone", title: "Technical Prep Zone" },
  { status: "Ready For Deployment", title: "Ready For Deployment" },
] as const;
const BACKLOG_LIMIT = 25;

type DeviceRow = {
  id: string;
  device_type: string;
  device_model: string | null;
  status: string;
  grade_letter: string | null;
  location: string | null;
  reserved_request_id: string | null;
};
type RequestRow = { id: string; code: string; org_name: string; staff_priority: number | null; needed_by: string | null };

function toRow(d: DeviceRow, r?: RequestRow): QueueRow {
  return {
    id: d.id,
    label: d.device_model ? `${d.device_type} · ${d.device_model}` : d.device_type,
    status: d.status,
    location: d.location,
    grade: d.grade_letter,
    request: r ? { id: r.id, code: r.code, org: r.org_name } : undefined,
  };
}

export default async function VolunteerQueuePage({ searchParams }: PageProps<"/volunteer">) {
  const sp = await searchParams;
  const tab = sp.tab === "backlog" ? "backlog" : "reserved";
  const showAll = sp.all === "1";
  const supabase = createAdminClient();
  const site = await getSelectedSite();
  const columns = "id, device_type, device_model, status, grade_letter, location, reserved_request_id";

  let reservedQuery = supabase
    .from("devices")
    .select(columns)
    .in("status", ZONES.map((z) => z.status))
    .not("reserved_request_id", "is", null);
  let backlogQuery = supabase
    .from("devices")
    .select(columns)
    .in("status", ["Quality Assurance Zone", "Technical Prep Zone"])
    .is("reserved_request_id", null)
    .order("id");
  if (site) {
    reservedQuery = reservedQuery.eq("site_id", site);
    backlogQuery = backlogQuery.eq("site_id", site);
  }
  const [reservedRes, backlogRes] = await Promise.all([reservedQuery, backlogQuery]);

  if (reservedRes.error || backlogRes.error) {
    return (
      <p className="rounded-lg border bg-white p-4 text-sm text-destructive">
        Could not load the work queue right now. Try reloading the page.
      </p>
    );
  }

  const reserved: DeviceRow[] = reservedRes.data ?? [];
  const backlog: DeviceRow[] = backlogRes.data ?? [];

  const requestIds = [...new Set(reserved.map((d) => d.reserved_request_id!))];
  const { data: requestsData } = requestIds.length
    ? await supabase.from("requests").select("id, code, org_name, staff_priority, needed_by").in("id", requestIds)
    : { data: [] as RequestRow[] };
  const requestById = new Map((requestsData ?? []).map((r) => [r.id, r as RequestRow]));

  // Most important request first: staff priority (1 = highest), then soonest needed-by, then shelf.
  reserved.sort((a, b) => {
    const ra = requestById.get(a.reserved_request_id!);
    const rb = requestById.get(b.reserved_request_id!);
    return (
      (ra?.staff_priority ?? 99) - (rb?.staff_priority ?? 99) ||
      (ra?.needed_by ?? "9999").localeCompare(rb?.needed_by ?? "9999") ||
      (ra?.code ?? "").localeCompare(rb?.code ?? "") ||
      (a.location ?? "~").localeCompare(b.location ?? "~")
    );
  });

  const count = (rows: DeviceRow[], status: string) => rows.filter((d) => d.status === status).length;

  const groups: QueueGroup[] =
    tab === "reserved"
      ? ZONES.map((z) => ({
          key: z.status,
          title: z.title,
          rows: reserved
            .filter((d) => d.status === z.status)
            .map((d) => toRow(d, requestById.get(d.reserved_request_id!))),
        }))
      : ZONES.slice(0, 2).map((z) => {
          const all = backlog.filter((d) => d.status === z.status);
          const shown = showAll ? all : all.slice(0, BACKLOG_LIMIT);
          return {
            key: z.status,
            title: z.title,
            rows: shown.map((d) => toRow(d)),
            hiddenCount: all.length - shown.length,
            showAllHref: "/volunteer?tab=backlog&all=1",
          };
        });

  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-center text-sm font-semibold ${
      active ? "bg-atb-navy text-white" : "text-atb-navy hover:bg-zinc-100"
    }`;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl text-atb-navy">What should I work on?</h1>
        <p className="text-sm text-zinc-600">
          Tick devices and use the buttons at the bottom. Tap a request code to see what the partner asked for.
        </p>
      </div>

      {/* Summary strip: devices set aside for partners */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={count(reserved, "Quality Assurance Zone")} label="to QA" />
        <Stat value={count(reserved, "Technical Prep Zone")} label="in prep" />
        <Stat value={count(reserved, "Ready For Deployment")} label="ready to pack" />
      </div>

      <nav className="flex gap-1 rounded-lg border bg-white p-1" aria-label="Queue">
        <Link href="/volunteer" className={tabClass(tab === "reserved")} aria-current={tab === "reserved" ? "page" : undefined}>
          For requests ({reserved.length})
        </Link>
        <Link
          href="/volunteer?tab=backlog"
          className={tabClass(tab === "backlog")}
          aria-current={tab === "backlog" ? "page" : undefined}
        >
          Backlog ({backlog.length})
        </Link>
      </nav>

      {tab === "reserved" && reserved.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white p-4 text-sm text-zinc-600">
          Nothing is set aside for a request right now.{" "}
          <Link href="/volunteer?tab=backlog" className="font-medium text-atb-green hover:underline">
            Work on the backlog
          </Link>
          .
        </p>
      ) : (
        <VolunteerQueue key={tab} groups={groups} />
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border bg-white px-2 py-2.5">
      <p className="font-heading text-2xl font-extrabold text-atb-navy">{value}</p>
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}
