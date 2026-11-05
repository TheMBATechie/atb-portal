import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server-admin";
import {
  NEEDS_OPTIONS,
  OS_PREF_OPTIONS,
  PURPOSE_OPTIONS,
  REQUEST_LINE_CATEGORIES,
  SETUP_OPTIONS,
  URGENCY_OPTIONS,
  USE_TYPE_OPTIONS,
  requestStatusLabel,
} from "@/lib/requests";
import { suggestedPriorityScore } from "@/lib/priority-score";
import { PriorityBucketControls } from "@/components/priority-bucket-controls";
import { DeclineDeferControls } from "@/components/decline-defer-controls";

export const instant = false;

function labelFor(options: readonly { value: string; label: string }[], value: string | null): string {
  if (!value) return "Not answered";
  return options.find((o) => o.value === value)?.label ?? value;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DATETIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function fmtDate(value: string | null): string {
  if (!value) return "Not set";
  return DATE_FORMAT.format(new Date(`${value}T00:00:00`));
}

export default async function StaffRequestDetailPage({ params }: PageProps<"/staff/requests/[code]">) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select(
      "id, code, partner_id, org_name, contact_name, contact_email, purpose, purpose_detail, use_type, people_served, needed_by, late_impact, partner_urgency, urgency_reason, allow_partial, allow_substitutes, setup, setup_notes, status, bucket, staff_priority, decline_message, created_at"
    )
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (requestError || !request) notFound();

  const [linesRes, partnerHistoryRes, deviceHistoryRes, logRes] = await Promise.all([
    supabase
      .from("request_lines")
      .select("id, device_category, quantity, os_pref, os_firm, needs, min_grade")
      .eq("request_id", request.id),
    request.partner_id
      ? supabase
          .from("requests")
          .select("id, code, status, bucket")
          .eq("partner_id", request.partner_id)
          .neq("id", request.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({
          data: [] as { id: string; code: string; status: string; bucket: string | null }[],
          error: null,
        }),
    supabase
      .from("devices")
      .select("id, device_type, device_model, deployment_date")
      .eq("deployment_partner", request.org_name)
      .order("deployment_date", { ascending: false }),
    supabase
      .from("decision_log")
      .select("id, actor, action, from_value, to_value, detail, reason, created_at")
      .eq("request_id", request.id)
      .order("created_at", { ascending: false }),
  ]);

  const lines = linesRes.data ?? [];
  const partnerHistory = partnerHistoryRes.data ?? [];
  const deviceHistory = deviceHistoryRes.data ?? [];
  const decisionLog = logRes.data ?? [];

  const currentYear = new Date().getFullYear();
  const devicesPlacedThisYear = deviceHistory.filter(
    (d) => d.deployment_date && new Date(d.deployment_date).getFullYear() === currentYear
  ).length;

  const score = suggestedPriorityScore({
    partnerUrgency: request.partner_urgency as "low" | "medium" | "high" | null,
    neededBy: request.needed_by,
    peopleServed: request.people_served,
    createdAt: request.created_at,
    devicesPlacedThisYear,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-muted-foreground">{request.code}</p>
          <h1 className="text-2xl font-bold">{request.org_name}</h1>
          <p className="text-sm text-muted-foreground">{requestStatusLabel(request.status, request.bucket)}</p>
        </div>
        <Link href="/staff/requests" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to planning board
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">Answers</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Contact</dt>
            <dd>{request.contact_name || "Not given"} &middot; {request.contact_email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Purpose</dt>
            <dd>
              {labelFor(PURPOSE_OPTIONS, request.purpose)}
              {request.purpose_detail ? ` — ${request.purpose_detail}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Use type</dt>
            <dd>{labelFor(USE_TYPE_OPTIONS, request.use_type)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">People served</dt>
            <dd>{request.people_served ?? "Not given"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Needed by</dt>
            <dd>{fmtDate(request.needed_by)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Late impact</dt>
            <dd>{request.late_impact || "Not given"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Partner urgency</dt>
            <dd>
              {labelFor(URGENCY_OPTIONS, request.partner_urgency)}
              {request.urgency_reason ? ` — ${request.urgency_reason}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Partial OK?</dt>
            <dd>{request.allow_partial ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Substitutes OK?</dt>
            <dd>{request.allow_substitutes ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Setup</dt>
            <dd>
              {labelFor(SETUP_OPTIONS, request.setup)}
              {request.setup_notes ? ` — ${request.setup_notes}` : ""}
            </dd>
          </div>
        </dl>

        <h3 className="mt-4 mb-2 text-sm font-semibold">Devices requested</h3>
        <ul className="space-y-1 text-sm">
          {lines.map((line) => (
            <li key={line.id}>
              {line.quantity}× {labelFor(REQUEST_LINE_CATEGORIES, line.device_category)}
              {line.os_pref !== "any" && (
                <>
                  {" "}
                  &middot; {labelFor(OS_PREF_OPTIONS, line.os_pref)}
                  {line.os_firm ? " (required)" : " (preferred)"}
                </>
              )}
              {line.needs.length > 0 && (
                <> &middot; {line.needs.map((n: string) => labelFor(NEEDS_OPTIONS, n)).join(", ")}</>
              )}{" "}
              &middot; min grade {line.min_grade}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">Partner history</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Other requests</h3>
            {partnerHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other requests from this partner.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {partnerHistory.map((r) => (
                  <li key={r.id}>
                    <Link href={`/staff/requests/${r.code}`} className="hover:underline">
                      {r.code}
                    </Link>
                    {" — "}
                    {requestStatusLabel(r.status, r.bucket)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              Devices placed with this partner ({devicesPlacedThisYear} this year)
            </h3>
            {deviceHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No devices placed with this partner yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {deviceHistory.map((d) => (
                  <li key={d.id}>
                    <span className="font-mono text-xs">{d.id}</span> &middot; {d.device_type}
                    {d.device_model ? ` (${d.device_model})` : ""} &middot; {fmtDate(d.deployment_date)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 font-semibold">Suggested priority score</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          A hint only — never applied automatically. Total: <span className="font-semibold">{score.total}</span>
        </p>
        <ul className="space-y-0.5 text-sm">
          {score.breakdown.map((item) => (
            <li key={item.label} className="flex justify-between">
              <span>{item.label}</span>
              <span className={item.points < 0 ? "text-destructive" : ""}>
                {item.points >= 0 ? "+" : ""}
                {item.points}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <PriorityBucketControls
        requestId={request.id}
        currentPriority={request.staff_priority}
        currentBucket={request.bucket}
      />

      <DeclineDeferControls requestId={request.id} status={request.status} declineMessage={request.decline_message} />

      <section className="rounded-lg border border-dashed bg-zinc-50 p-4">
        <h2 className="font-semibold text-zinc-500">Match devices</h2>
        <p className="text-sm text-muted-foreground">Coming in Stage 4.</p>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">Decision log</h2>
        {decisionLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decisions logged yet.</p>
        ) : (
          <ol className="space-y-3 border-l pl-4 text-sm">
            {decisionLog.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-zinc-400" />
                <p>
                  <span className="font-medium">{entry.actor}</span>{" "}
                  <span className="text-muted-foreground">{entry.action.replace(/_/g, " ")}</span>
                  {(entry.from_value || entry.to_value) && (
                    <>
                      {" "}
                      {entry.from_value ? `from ${entry.from_value} ` : ""}
                      {entry.to_value ? `to ${entry.to_value}` : ""}
                    </>
                  )}
                </p>
                {entry.detail && <p className="text-muted-foreground">{entry.detail}</p>}
                {entry.reason && <p className="italic text-muted-foreground">Reason: {entry.reason}</p>}
                <p className="text-xs text-muted-foreground">{DATETIME_FORMAT.format(new Date(entry.created_at))}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
