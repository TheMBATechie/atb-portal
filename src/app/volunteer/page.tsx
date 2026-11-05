import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { DeviceIdTag } from "@/components/device-id-tag";
import { DeviceAdvanceButton } from "@/components/device-advance-button";

export const instant = false;

const ZONES = ["Quality Assurance Zone", "Technical Prep Zone", "Ready For Deployment"] as const;
const BACKLOG_ZONES = ["Quality Assurance Zone", "Technical Prep Zone"] as const;
const BACKLOG_LIMIT = 20;
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

type QueueDevice = {
  id: string;
  device_type: string;
  device_model: string | null;
  status: string;
  grade_letter: string | null;
  location: string | null;
  reserved_request_id: string | null;
};
type QueueRequest = {
  id: string;
  code: string;
  org_name: string;
  staff_priority: number | null;
  needed_by: string | null;
};

function DeviceCard({ device, request }: { device: QueueDevice; request?: QueueRequest }) {
  return (
    <li className="space-y-3 rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <DeviceIdTag id={device.id} />
        <span className="font-medium">{device.device_type}</span>
        {device.device_model && <span className="text-muted-foreground">{device.device_model}</span>}
      </div>
      <p className="text-sm text-muted-foreground">
        Shelf <span className="font-medium text-zinc-800">{device.location ?? "not set"}</span> · Grade{" "}
        {device.grade_letter ?? "?"}
      </p>
      {request && (
        <p className="rounded bg-emerald-50 px-2 py-1 text-sm text-emerald-900">
          For <span className="font-mono">{request.code}</span> · {request.org_name}
          {request.needed_by && ` · needed by ${DATE_FORMAT.format(new Date(`${request.needed_by}T00:00:00`))}`}
        </p>
      )}
      {device.status === "Ready For Deployment" ? (
        request && (
          <Link href={`/volunteer/picklist/${request.code}`} className="text-sm font-medium text-sky-700 hover:underline">
            Ready. Open the pick list for {request.code} &rarr;
          </Link>
        )
      ) : (
        <DeviceAdvanceButton deviceId={device.id} status={device.status} />
      )}
    </li>
  );
}

export default async function VolunteerQueuePage({ searchParams }: PageProps<"/volunteer">) {
  const showAll = (await searchParams).all === "1";
  const supabase = createAdminClient();
  const columns = "id, device_type, device_model, status, grade_letter, location, reserved_request_id";

  const [reservedRes, backlogRes] = await Promise.all([
    supabase.from("devices").select(columns).in("status", [...ZONES]).not("reserved_request_id", "is", null),
    supabase
      .from("devices")
      .select(columns)
      .in("status", [...BACKLOG_ZONES])
      .is("reserved_request_id", null)
      .order("id"),
  ]);

  if (reservedRes.error || backlogRes.error) {
    return (
      <p className="rounded-lg border bg-white p-4 text-sm text-destructive">
        Could not load the work queue right now. Try reloading the page.
      </p>
    );
  }

  const reserved: QueueDevice[] = reservedRes.data ?? [];
  const backlog: QueueDevice[] = backlogRes.data ?? [];

  const requestIds = [...new Set(reserved.map((d) => d.reserved_request_id!))];
  const { data: requestsData } = requestIds.length
    ? await supabase.from("requests").select("id, code, org_name, staff_priority, needed_by").in("id", requestIds)
    : { data: [] as QueueRequest[] };
  const requestById = new Map((requestsData ?? []).map((r) => [r.id, r as QueueRequest]));

  // Most important request first: staff priority (1 = highest), then soonest needed-by.
  const sortKey = (d: QueueDevice) => {
    const r = requestById.get(d.reserved_request_id!);
    return [r?.staff_priority ?? 99, r?.needed_by ?? "9999-12-31", d.id] as const;
  };
  reserved.sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]) || ka[2].localeCompare(kb[2]);
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">What should I work on?</h1>
        <p className="text-sm text-muted-foreground">
          Devices set aside for a partner come first, most urgent at the top. Then the general backlog.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Set aside for a request ({reserved.length})</h2>
        {reserved.length === 0 && (
          <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-muted-foreground">
            Nothing is set aside right now. Work on the backlog below.
          </p>
        )}
        {ZONES.map((zone) => {
          const devices = reserved.filter((d) => d.status === zone);
          if (devices.length === 0) return null;
          return (
            <div key={zone} className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">
                {zone} ({devices.length})
              </h3>
              <ul className="space-y-2">
                {devices.map((d) => (
                  <DeviceCard key={d.id} device={d} request={requestById.get(d.reserved_request_id!)} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Backlog (not set aside yet)</h2>
        {BACKLOG_ZONES.map((zone) => {
          const all = backlog.filter((d) => d.status === zone);
          const devices = showAll ? all : all.slice(0, BACKLOG_LIMIT);
          return (
            <div key={zone} className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">
                {zone} ({all.length})
              </h3>
              {all.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing waiting here.</p>
              ) : (
                <ul className="space-y-2">
                  {devices.map((d) => (
                    <DeviceCard key={d.id} device={d} />
                  ))}
                </ul>
              )}
              {!showAll && all.length > BACKLOG_LIMIT && (
                <Link href="/volunteer?all=1" className="text-sm text-sky-700 hover:underline">
                  Show all {all.length}
                </Link>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
