import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server-admin";
import {
  NEEDS_OPTIONS,
  OS_PREF_OPTIONS,
  PURPOSE_OPTIONS,
  REQUEST_LINE_CATEGORIES,
  SETUP_OPTIONS,
  USE_TYPE_OPTIONS,
  staffStatusLabel,
} from "@/lib/requests";
import { accessoriesFor } from "@/lib/devices";
import { FlagConcern } from "@/components/flag-concern";

export const instant = false;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DATETIME_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function labelFor(options: readonly { value: string; label: string }[], value: string | null): string {
  if (!value) return "Not answered";
  return options.find((o) => o.value === value)?.label ?? value;
}

// Read-only view for volunteers: what did the partner ask for, and does what's set aside fit?
export default async function VolunteerRequestPage({ params }: PageProps<"/volunteer/requests/[code]">) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, code, org_name, status, bucket, purpose, purpose_detail, use_type, people_served, needed_by, allow_substitutes, setup, setup_notes"
    )
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!request) notFound();

  const [linesRes, devicesRes, concernsRes] = await Promise.all([
    supabase.from("request_lines").select("id, device_category, quantity, os_pref, os_firm, needs, min_grade, notes").eq("request_id", request.id),
    supabase
      .from("devices")
      .select("id, device_type, device_model, status, grade_letter, location, accessories")
      .eq("reserved_request_id", request.id)
      .order("location"),
    supabase
      .from("decision_log")
      .select("id, actor, detail, reason, created_at")
      .eq("request_id", request.id)
      .eq("action", "note")
      .like("detail", "Volunteer concern%")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const lines = linesRes.data ?? [];
  const devices = devicesRes.data ?? [];
  const concerns = concernsRes.data ?? [];
  const needed = lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <div className="space-y-5">
      <Link href="/volunteer" className="text-sm text-zinc-600 hover:underline">
        &larr; Work queue
      </Link>

      <section className="space-y-1 rounded-xl border bg-white p-4">
        <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-atb-navy">{request.code}</span>
          <span className="rounded-full bg-atb-peach px-2 py-0.5 text-xs font-semibold text-atb-navy">
            {staffStatusLabel(request.status, request.bucket)}
          </span>
          {request.needed_by && <span>Needed by {DATE_FORMAT.format(new Date(`${request.needed_by}T00:00:00`))}</span>}
        </p>
        <h1 className="text-2xl text-atb-navy">{request.org_name}</h1>
        <p className="text-sm text-zinc-600">
          {labelFor(PURPOSE_OPTIONS, request.purpose)}
          {request.purpose_detail ? ` — ${request.purpose_detail}` : ""}
          {request.use_type ? ` · ${labelFor(USE_TYPE_OPTIONS, request.use_type)}` : ""}
          {request.people_served ? ` · about ${request.people_served} people` : ""}
        </p>
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="text-lg text-atb-navy">What they asked for</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="rounded-lg bg-zinc-50 p-3">
              <p className="font-semibold text-atb-navy">
                {l.quantity}× {labelFor(REQUEST_LINE_CATEGORIES, l.device_category)}
              </p>
              <p className="text-zinc-600">
                {l.os_pref === "any" ? "Any OS" : `${labelFor(OS_PREF_OPTIONS, l.os_pref)} ${l.os_firm ? "only" : "preferred"}`}
                {" · "}grade {l.min_grade} or better
                {l.needs.filter((n: string) => n !== "other").length > 0 &&
                  ` · must have: ${l.needs
                    .filter((n: string) => n !== "other")
                    .map((n: string) => labelFor(NEEDS_OPTIONS, n).toLowerCase())
                    .join(", ")}`}
              </p>
              {l.notes && <p className="text-zinc-600">{l.notes}</p>}
            </li>
          ))}
        </ul>
        <p className="text-sm text-zinc-600">
          Setup: <span className="text-atb-navy">{labelFor(SETUP_OPTIONS, request.setup)}</span>
          {request.setup_notes ? ` — ${request.setup_notes}` : ""}
        </p>
        <p className="text-sm text-zinc-600">
          Substitutes: <span className="text-atb-navy">{request.allow_substitutes ? "similar devices OK" : "exact match only"}</span>
        </p>
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg text-atb-navy">
            Set aside ({devices.length} of {needed})
          </h2>
          {devices.length > 0 && (
            <Link href={`/volunteer/picklist/${request.code}`} className="text-sm font-medium text-atb-green hover:underline">
              Pick list &rarr;
            </Link>
          )}
        </div>
        {devices.length === 0 ? (
          <p className="text-sm text-zinc-600">Nothing is set aside for this request yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {devices.map((d) => (
              <li key={d.id} className="py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-atb-navy">{d.id}</span>
                  <span className="font-medium text-atb-navy">
                    {d.device_type}
                    {d.device_model ? ` · ${d.device_model}` : ""}
                  </span>
                </div>
                <p className="text-xs text-zinc-600">
                  {d.status} · Grade {d.grade_letter ?? "?"} · Shelf {d.location ?? "—"} · Pack: {accessoriesFor(d)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="text-lg text-atb-navy">Something not right?</h2>
        <p className="text-sm text-zinc-600">
          If a device doesn&apos;t fit what the partner asked for, tell staff. They decide whether to swap it. You can
          also flag a single device from the work queue.
        </p>
        <FlagConcern requestId={request.id} />
        {concerns.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Recent flags</p>
            <ul className="space-y-2 text-sm">
              {concerns.map((c) => (
                <li key={c.id}>
                  <span className="font-medium text-atb-navy">{c.actor}</span>{" "}
                  <span className="text-zinc-500">{DATETIME_FORMAT.format(new Date(c.created_at))}</span>
                  <p className="text-zinc-600">
                    {c.detail?.startsWith("Volunteer concern about ") && `${c.detail.slice("Volunteer concern about ".length)}: `}
                    {c.reason}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
