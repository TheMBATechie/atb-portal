import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
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
import { MatchPanel, type PanelDevice, type PanelLine, type PanelReserved } from "@/components/match-panel";
import { matchLine, type Candidate, type MatchDevice, type MatchLine } from "@/lib/matching";
import { loadMatchableDevices } from "@/lib/match-data";
import { HandoffPanel } from "@/components/handoff-panel";
import { FeedbackList } from "@/components/feedback-form";
import { StaffFeedback } from "@/components/staff-feedback";

const GROUP_TITLES = [
  { key: "ready", title: "Ready For Deployment" },
  { key: "qa", title: "In QA" },
  { key: "techPrep", title: "Technical Prep" },
  { key: "hold", title: "On hold" },
] as const;

function toPanelDevice(d: MatchDevice, flags: string[] = []): PanelDevice {
  return {
    id: d.id,
    label: d.device_model ? `${d.device_type} · ${d.device_model}` : d.device_type,
    status: d.status,
    grade: d.grade_letter,
    location: d.location,
    flags,
  };
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

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

export default async function StaffRequestDetailPage({
  params,
  searchParams,
}: PageProps<"/staff/requests/[code]">) {
  await connection(); // always render per request (uses today's date)
  const { code } = await params;
  const sp = await searchParams;
  const includeHolds = sp.holds === "1";
  const includeHeld = sp.held === "1";
  const supabase = createAdminClient();

  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select(
      "id, code, partner_id, org_name, contact_name, contact_email, purpose, purpose_detail, use_type, people_served, needed_by, late_impact, partner_urgency, urgency_reason, allow_partial, allow_substitutes, setup, setup_notes, status, bucket, staff_priority, decline_message, created_at"
    )
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (requestError || !request) notFound();

  const [linesRes, partnerHistoryRes, deviceHistoryRes, logRes, matchableDevices, reservedRes] = await Promise.all([
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
    loadMatchableDevices(),
    supabase.from("devices").select("id, reserved_line_id").eq("reserved_request_id", request.id),
  ]);

  const { data: feedbackRows } = await supabase
    .from("request_feedback")
    .select("id, source, rating, body, created_at")
    .eq("request_id", request.id)
    .order("created_at", { ascending: false });
  const feedback = feedbackRows ?? [];

  const lines = linesRes.data ?? [];
  const decisionLog = logRes.data ?? [];
  const reservedLineById = new Map((reservedRes.data ?? []).map((d) => [d.id, d.reserved_line_id as string | null]));
  const canMatch = !["declined", "delivered", "partially_delivered", "closed"].includes(request.status);
  const today = todayIso();

  // Request codes for devices held elsewhere (only loaded when that toggle is on).
  const heldIds = includeHeld
    ? [
        ...new Set(
          matchableDevices
            .map((d) => d.reserved_request_id)
            .filter((id): id is string => !!id && id !== request.id)
        ),
      ]
    : [];
  const { data: heldRequests } = heldIds.length
    ? await supabase.from("requests").select("id, code").in("id", heldIds)
    : { data: [] as { id: string; code: string }[] };
  const heldByCode = new Map((heldRequests ?? []).map((r) => [r.id, r.code]));

  const panelLines: PanelLine[] = lines.map((line) => {
    const m = matchLine(
      line as MatchLine,
      { id: request.id, purpose: request.purpose, allow_substitutes: request.allow_substitutes },
      matchableDevices,
      { includeHolds, includeHeldElsewhere: includeHeld, today }
    );
    const reservedOnLine = [...reservedLineById.values()].filter((l) => l === line.id).length;
    const open: Candidate[] = m.candidates.filter((c) => !c.reservedHere);
    const stillNeeded = Math.max(0, line.quantity - reservedOnLine);
    return {
      lineId: line.id,
      title: `${line.quantity}× ${labelFor(REQUEST_LINE_CATEGORIES, line.device_category)}${
        line.os_pref !== "any" ? ` · ${labelFor(OS_PREF_OPTIONS, line.os_pref)}${line.os_firm ? " (required)" : ""}` : ""
      } · grade ${line.min_grade} or better`,
      summary: m.summary,
      stillNeeded,
      groups: GROUP_TITLES.map((g) => ({
        key: g.key,
        title: g.title,
        devices: open
          .filter((c) => c.readiness === g.key)
          .map((c) =>
            toPanelDevice(
              c.device,
              c.flags.map((f) =>
                f === "Held by another request"
                  ? `Held by ${heldByCode.get(c.device.reserved_request_id ?? "") ?? "another request"}`
                  : f
              )
            )
          ),
      })),
      preselected: open.filter((c) => !c.heldElsewhere).slice(0, stillNeeded).map((c) => c.device.id),
    };
  });

  const panelReserved: PanelReserved[] = matchableDevices
    .filter((d) => d.reserved_request_id === request.id)
    .sort((a, b) => a.readiness_rank - b.readiness_rank || a.id.localeCompare(b.id))
    .map((d) => ({ ...toPanelDevice(d), lineId: reservedLineById.get(d.id) ?? lines[0]?.id ?? "" }));

  // A failed QA since the last reservation means staff should pick a replacement.
  const lastReplacementNote = decisionLog.find(
    (e) => e.action === "note" && (e.detail ?? "").startsWith("Needs a replacement")
  );
  const lastReserve = decisionLog.find((e) => e.action === "reserve");
  const needsReplacement =
    !!lastReplacementNote && (!lastReserve || lastReserve.created_at < lastReplacementNote.created_at);

  const toggleHref = (holds: boolean, held: boolean) => {
    const q = [holds && "holds=1", held && "held=1"].filter(Boolean).join("&");
    return `/staff/requests/${request.code}${q ? `?${q}` : ""}`;
  };
  const partnerHistory = partnerHistoryRes.data ?? [];
  const deviceHistory = deviceHistoryRes.data ?? [];

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
          <h1 className="text-2xl font-bold">
            {request.partner_id ? (
              <Link href={`/staff/partners/${request.partner_id}`} className="hover:underline">
                {request.org_name}
              </Link>
            ) : (
              request.org_name
            )}
          </h1>
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

      {needsReplacement && canMatch && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {lastReplacementNote?.detail}. Pick a replacement below.
        </div>
      )}

      <MatchPanel
        requestId={request.id}
        lines={panelLines}
        reserved={panelReserved}
        includeHolds={includeHolds}
        holdsToggleHref={toggleHref(!includeHolds, includeHeld)}
        includeHeld={includeHeld}
        heldToggleHref={toggleHref(includeHolds, !includeHeld)}
        allowSubstitutes={request.allow_substitutes}
        canEdit={canMatch}
      />

      <HandoffPanel
        requestId={request.id}
        requestCode={request.code}
        readyDevices={panelReserved
          .filter((d) => d.status === "Ready For Deployment")
          .map((d) => ({ id: d.id, label: d.label, location: d.location }))}
        notReadyCount={panelReserved.filter((d) => d.status !== "Ready For Deployment").length}
      />

      <section className="space-y-4 rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Feedback</h2>
        <FeedbackList items={feedback} />
        <div className="border-t pt-4">
          <StaffFeedback requestId={request.id} />
        </div>
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
