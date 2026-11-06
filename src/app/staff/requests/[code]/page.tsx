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
  staffStatusLabel,
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

export const instant = false;

const GROUP_TITLES = [
  { key: "ready", title: "Ready For Deployment" },
  { key: "qa", title: "In QA" },
  { key: "techPrep", title: "Technical Prep" },
  { key: "hold", title: "On hold" },
] as const;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DATETIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const LOG_PREVIEW = 6;

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

function labelFor(options: readonly { value: string; label: string }[], value: string | null): string {
  if (!value) return "Not answered";
  return options.find((o) => o.value === value)?.label ?? value;
}

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
      "id, code, site_id, partner_id, org_name, contact_name, contact_email, purpose, purpose_detail, use_type, people_served, needed_by, late_impact, partner_urgency, urgency_reason, allow_partial, allow_substitutes, setup, setup_notes, status, bucket, staff_priority, decline_message, created_at"
    )
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (requestError || !request) notFound();

  const [linesRes, partnerHistoryRes, deviceHistoryRes, logRes, matchableDevices, reservedRes, feedbackRes] =
    await Promise.all([
      supabase
        .from("request_lines")
        .select("id, device_category, quantity, os_pref, os_firm, needs, min_grade, notes")
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
        .select("id, device_type, deployment_date")
        .eq("deployment_partner", request.org_name)
        .eq("status", "Deployed"),
      supabase
        .from("decision_log")
        .select("id, actor, action, from_value, to_value, detail, reason, created_at")
        .eq("request_id", request.id)
        .order("created_at", { ascending: false }),
      loadMatchableDevices(request.site_id),
      supabase.from("devices").select("id, reserved_line_id").eq("reserved_request_id", request.id),
      supabase
        .from("request_feedback")
        .select("id, source, rating, body, created_at")
        .eq("request_id", request.id)
        .order("created_at", { ascending: false }),
    ]);

  const lines = linesRes.data ?? [];
  const decisionLog = logRes.data ?? [];
  const feedback = feedbackRes.data ?? [];
  const partnerHistory = partnerHistoryRes.data ?? [];
  const deviceHistory = deviceHistoryRes.data ?? [];
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
        line.os_pref !== "any" ? ` · ${labelFor(OS_PREF_OPTIONS, line.os_pref)}${line.os_firm ? " only" : " preferred"}` : ""
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

  // A failed QA (or reallocation) since the last reservation means staff should pick a replacement.
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

  const currentYear = Number(today.slice(0, 4));
  const devicesPlacedThisYear = deviceHistory.filter(
    (d) => d.deployment_date && Number(d.deployment_date.slice(0, 4)) === currentYear
  ).length;
  const byType = new Map<string, number>();
  for (const d of deviceHistory) byType.set(d.device_type, (byType.get(d.device_type) ?? 0) + 1);

  const score = suggestedPriorityScore({
    partnerUrgency: request.partner_urgency as "low" | "medium" | "high" | null,
    neededBy: request.needed_by,
    peopleServed: request.people_served,
    createdAt: request.created_at,
    devicesPlacedThisYear,
  });

  // ---- summary for the header and "next step" ----
  const needed = lines.reduce((n, l) => n + l.quantity, 0);
  const reservedCount = panelReserved.length;
  const readyCount = panelReserved.filter((d) => d.status === "Ready For Deployment").length;
  const daysLeft = request.needed_by
    ? Math.round(
        (new Date(`${request.needed_by}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000
      )
    : null;
  const deviceSummary = lines.map((l) => lineSummary(l)).join(", ");
  const next = nextStep({
    status: request.status,
    needed,
    reservedCount,
    readyCount,
    needsReplacement: needsReplacement && canMatch,
    replacementNote: lastReplacementNote?.detail ?? null,
    declineMessage: request.decline_message,
  });

  return (
    <div className="space-y-6">
      <Link href="/staff/requests" className="text-sm text-zinc-600 hover:underline">
        &larr; Planning board
      </Link>

      {/* Header */}
      <section className="space-y-5 rounded-xl border bg-white p-5 sm:p-6">
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-atb-navy">{request.code}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(request.status)}`}>
              {staffStatusLabel(request.status, request.bucket)}
            </span>
            <span>Received {fmtDate(request.created_at.slice(0, 10))}</span>
          </p>
          <h1 className="text-3xl text-atb-navy">
            {request.partner_id ? (
              <Link href={`/staff/partners/${request.partner_id}`} className="hover:underline">
                {request.org_name}
              </Link>
            ) : (
              request.org_name
            )}
          </h1>
        </div>

        <ul className="flex flex-wrap gap-2 text-sm">
          <Fact label="Needs">{deviceSummary || "No devices listed"}</Fact>
          <Fact label="Needed by" tone={daysLeft !== null && daysLeft <= 14 && canMatch ? "warn" : undefined}>
            {request.needed_by ? `${fmtDate(request.needed_by)}${canMatch ? daysLeftText(daysLeft) : ""}` : "No fixed date"}
          </Fact>
          <Fact label="Partner urgency">{labelFor(URGENCY_OPTIONS, request.partner_urgency)}</Fact>
          <Fact label="Staff priority">{request.staff_priority ?? "Not set"}</Fact>
          <Fact label="Planned for">{bucketLabel(request.bucket)}</Fact>
        </ul>

        {request.status !== "declined" && <Progress step={stageIndex(request.status)} />}
      </section>

      {/* Next step */}
      <section className={`rounded-xl border p-4 sm:p-5 ${NEXT_TONES[next.tone ?? "todo"]}`}>
        <p className="text-xs font-semibold tracking-wide text-zinc-600 uppercase">Next step</p>
        <p className="mt-1 font-heading text-lg font-bold text-atb-navy">{next.title}</p>
        {next.body && <p className="mt-1 text-sm text-atb-navy/80">{next.body}</p>}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {canMatch && (
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
          )}

          <HandoffPanel
            requestId={request.id}
            requestCode={request.code}
            readyDevices={panelReserved
              .filter((d) => d.status === "Ready For Deployment")
              .map((d) => ({ id: d.id, label: d.label, location: d.location }))}
            notReadyCount={panelReserved.filter((d) => d.status !== "Ready For Deployment").length}
          />

          <section className="rounded-xl border bg-white p-5">
            <h2 className="mb-4 text-lg text-atb-navy">Decision log</h2>
            {decisionLog.length === 0 ? (
              <p className="text-sm text-zinc-600">No decisions logged yet.</p>
            ) : (
              <>
                <LogList entries={decisionLog.slice(0, LOG_PREVIEW)} />
                {decisionLog.length > LOG_PREVIEW && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-atb-green hover:underline">
                      Show all {decisionLog.length} entries
                    </summary>
                    <div className="mt-4">
                      <LogList entries={decisionLog.slice(LOG_PREVIEW)} />
                    </div>
                  </details>
                )}
              </>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="min-w-0 space-y-6">
          {canMatch && (
            <section className="space-y-5 rounded-xl border bg-white p-5">
              <h2 className="text-lg text-atb-navy">Plan</h2>
              <PriorityBucketControls
                requestId={request.id}
                currentPriority={request.staff_priority}
                currentBucket={request.bucket}
              />
              <details className="rounded-md bg-zinc-50 p-3 text-sm">
                <summary className="cursor-pointer">
                  Suggested score: <span className="font-semibold">{score.total}</span>{" "}
                  <span className="text-zinc-500">(a hint only)</span>
                </summary>
                <ul className="mt-2 space-y-0.5">
                  {score.breakdown.map((item) => (
                    <li key={item.label} className="flex justify-between gap-3">
                      <span>{item.label}</span>
                      <span className={item.points < 0 ? "text-destructive" : ""}>
                        {item.points >= 0 ? "+" : ""}
                        {item.points}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-zinc-500">Never applied automatically. Staff priority is your call.</p>
              </details>
            </section>
          )}

          <section className="rounded-xl border bg-white p-5">
            <h2 className="mb-3 text-lg text-atb-navy">Request details</h2>
            <dl className="space-y-3 text-sm">
              <Detail label="Contact">
                {request.contact_name || "Not given"}
                <span className="block break-all text-zinc-600">{request.contact_email}</span>
              </Detail>
              <Detail label="Used for">
                {labelFor(PURPOSE_OPTIONS, request.purpose)}
                {request.purpose_detail ? ` — ${request.purpose_detail}` : ""}
              </Detail>
              {(request.use_type || request.people_served) && (
                <Detail label="People served">
                  {[
                    request.use_type ? labelFor(USE_TYPE_OPTIONS, request.use_type) : null,
                    request.people_served ? `about ${request.people_served} people` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Detail>
              )}
              <Detail label="Devices">
                <ul className="space-y-1">
                  {lines.map((line) => (
                    <li key={line.id}>
                      {lineSummary(line)}
                      {line.needs.filter((n: string) => n !== "other").length > 0 &&
                        ` · ${line.needs
                          .filter((n: string) => n !== "other")
                          .map((n: string) => labelFor(NEEDS_OPTIONS, n).toLowerCase())
                          .join(", ")}`}
                      {line.notes && <span className="block text-zinc-600">{line.notes}</span>}
                    </li>
                  ))}
                </ul>
              </Detail>
              {request.late_impact && <Detail label="If they arrive late">{request.late_impact}</Detail>}
              <Detail label="Delivery">
                {request.allow_partial ? "Send what's ready" : "Send all together"} ·{" "}
                {request.allow_substitutes ? "similar devices OK" : "exact match only"}
              </Detail>
              <Detail label="Setup">
                {labelFor(SETUP_OPTIONS, request.setup)}
                {request.setup_notes ? ` — ${request.setup_notes}` : ""}
              </Detail>
            </dl>
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="mb-3 text-lg text-atb-navy">Partner</h2>
            <p className="text-sm text-zinc-600">
              <span className="font-heading text-2xl font-extrabold text-atb-navy">{deviceHistory.length}</span> devices
              placed so far, {devicesPlacedThisYear} this year
            </p>
            {byType.size > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                {[...byType.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, n]) => `${n} ${t}`)
                  .join(" · ")}
              </p>
            )}
            <p className="mt-4 text-sm font-semibold text-atb-navy">Other requests</p>
            {partnerHistory.length === 0 ? (
              <p className="text-sm text-zinc-600">None.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {partnerHistory.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <Link href={`/staff/requests/${r.code}`} className="font-mono text-xs hover:underline">
                      {r.code}
                    </Link>
                    <span className="text-zinc-600">{staffStatusLabel(r.status, r.bucket)}</span>
                  </li>
                ))}
              </ul>
            )}
            {request.partner_id && (
              <Link
                href={`/staff/partners/${request.partner_id}`}
                className="mt-4 inline-block text-sm font-medium text-atb-green hover:underline"
              >
                Full partner history &rarr;
              </Link>
            )}
          </section>

          <section className="space-y-3 rounded-xl border bg-white p-5">
            <h2 className="text-lg text-atb-navy">Feedback</h2>
            <FeedbackList items={feedback} />
            <details>
              <summary className="cursor-pointer text-sm font-medium text-atb-green hover:underline">
                Log feedback from the partner
              </summary>
              <div className="mt-3">
                <StaffFeedback requestId={request.id} />
              </div>
            </details>
          </section>

          {canMatch && (
            <details className="rounded-xl border bg-white p-5">
              <summary className="cursor-pointer font-heading font-bold text-atb-navy">
                Decline or ask for more info
              </summary>
              <div className="mt-3">
                <DeclineDeferControls requestId={request.id} />
              </div>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type LineRow = { device_category: string; quantity: number; os_pref: string; os_firm: boolean };

function lineSummary(l: LineRow): string {
  const noun =
    l.device_category === "recommend"
      ? `device${l.quantity === 1 ? "" : "s"} (we recommend the type)`
      : `${labelFor(REQUEST_LINE_CATEGORIES, l.device_category).toLowerCase()}${l.quantity === 1 ? "" : "s"}`;
  const os = l.os_pref !== "any" ? ` · ${labelFor(OS_PREF_OPTIONS, l.os_pref)}${l.os_firm ? " only" : " preferred"}` : "";
  return `${l.quantity} ${noun}${os}`;
}

function daysLeftText(daysLeft: number | null): string {
  if (daysLeft === null) return "";
  if (daysLeft < 0) return ` · ${-daysLeft} day${daysLeft === -1 ? "" : "s"} late`;
  if (daysLeft === 0) return " · today";
  return ` · in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

const STAGES = ["Received", "Planned", "Matched", "Ready for pickup", "Delivered"];

function stageIndex(status: string): number {
  if (status === "submitted" || status === "needs_info") return 0;
  if (status === "scheduled") return 1;
  if (status === "matched" || status === "partially_matched" || status === "in_prep") return 2;
  if (status === "ready_for_pickup") return 3;
  return 4;
}

function Progress({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Request progress">
      {STAGES.map((label, i) => (
        <li key={label} className="space-y-1.5" aria-current={i === step ? "step" : undefined}>
          <span className={`block h-1.5 rounded-full ${i <= step ? "bg-atb-coral" : "bg-zinc-200"}`} />
          <span
            className={`block text-xs ${
              i === step ? "font-semibold text-atb-navy" : i < step ? "text-zinc-600" : "text-zinc-400"
            }`}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function statusTone(status: string): string {
  if (status === "declined") return "bg-zinc-200 text-zinc-700";
  if (status === "needs_info") return "bg-amber-100 text-amber-900";
  if (["ready_for_pickup", "delivered", "partially_delivered", "closed"].includes(status))
    return "bg-atb-green/15 text-atb-green";
  if (["matched", "partially_matched", "in_prep"].includes(status)) return "bg-atb-peach text-atb-navy";
  return "bg-atb-blush text-atb-navy";
}

function bucketLabel(bucket: string | null): string {
  if (bucket === "this_month") return "This month";
  if (bucket === "next_month") return "Next month";
  if (bucket === "later") return "Later";
  return "Not planned yet";
}

type NextTone = "todo" | "warn" | "done" | "stop";

const NEXT_TONES: Record<NextTone, string> = {
  todo: "border-atb-apricot bg-atb-blush",
  warn: "border-amber-300 bg-amber-50",
  done: "border-atb-green/30 bg-atb-green/5",
  stop: "border-zinc-300 bg-zinc-50",
};

function nextStep(x: {
  status: string;
  needed: number;
  reservedCount: number;
  readyCount: number;
  needsReplacement: boolean;
  replacementNote: string | null;
  declineMessage: string | null;
}): { title: string; body?: string; tone?: NextTone } {
  if (x.needsReplacement) {
    return {
      title: "Pick a replacement device",
      body: `${x.replacementNote}. Choose another device under Match devices.`,
      tone: "warn",
    };
  }
  const missing = Math.max(0, x.needed - x.reservedCount);
  switch (x.status) {
    case "submitted":
      return {
        title: "Review and plan this request",
        body: "Set a staff priority and the month to plan it for, or match devices right away.",
      };
    case "needs_info":
      return {
        title: "Waiting on the partner",
        body: "You asked for more information. When you hear back, plan the request or match devices.",
        tone: "warn",
      };
    case "scheduled":
      return { title: "Match devices", body: "Tick the devices to set aside under Match devices, then click Reserve." };
    case "partially_matched":
      return {
        title: `${missing} more device${missing === 1 ? "" : "s"} needed`,
        body: `${x.reservedCount} of ${x.needed} set aside. Reserve more below, or hand over what's ready if the partner accepts a partial delivery.`,
      };
    case "matched":
    case "in_prep":
      return {
        title: "Volunteers are preparing the devices",
        body: `${x.readyCount} of ${x.reservedCount} set-aside devices are ready. They appear under Hand over to partner as they pass QA.`,
      };
    case "ready_for_pickup":
      return {
        title: "Ready for pickup",
        body: "Share the pick list with a volunteer, then confirm the handoff when the partner collects.",
        tone: "done",
      };
    case "delivered":
    case "partially_delivered":
    case "closed":
      return {
        title: "Delivered",
        body: "Log the partner's feedback when you hear how the devices are working out.",
        tone: "done",
      };
    case "declined":
      return {
        title: "Declined",
        body: x.declineMessage ? `Message to the partner: ${x.declineMessage}` : undefined,
        tone: "stop",
      };
    default:
      return { title: staffStatusLabel(x.status, null) };
  }
}

function Fact({ label, tone, children }: { label: string; tone?: "warn"; children: React.ReactNode }) {
  return (
    <li className={`rounded-lg px-3 py-1.5 ${tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-zinc-50"}`}>
      <span className="block text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{label}</span>
      <span className="font-medium text-atb-navy">{children}</span>
    </li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-atb-navy">{children}</dd>
    </div>
  );
}

type LogEntry = {
  id: number;
  actor: string;
  action: string;
  from_value: string | null;
  to_value: string | null;
  detail: string | null;
  reason: string | null;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  create: "submitted the request",
  set_priority: "set priority",
  set_bucket: "planned it",
  set_status: "changed the status",
  reserve: "reserved",
  release: "released",
  swap: "swapped a device",
  reallocate: "reallocated devices",
  decline: "declined the request",
  device_status: "moved a device",
  fulfill: "handed over",
  note: "added a note",
};

function LogList({ entries }: { entries: LogEntry[] }) {
  return (
    <ol className="space-y-4 border-l-2 border-atb-cream pl-4 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute top-1.5 -left-[23px] size-3 rounded-full border-2 border-white bg-atb-coral" />
          <p>
            <span className="font-semibold text-atb-navy">{entry.actor}</span>{" "}
            <span className="text-zinc-600">{ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, " ")}</span>
            {(entry.from_value || entry.to_value) && (
              <span className="text-atb-navy">
                {" "}
                {entry.from_value ? `from ${entry.from_value.replace(/_/g, " ")} ` : ""}
                {entry.to_value ? `to ${entry.to_value.replace(/_/g, " ")}` : ""}
              </span>
            )}
          </p>
          {entry.detail && <p className="break-words text-zinc-600">{entry.detail}</p>}
          {entry.reason && <p className="text-zinc-600 italic">&ldquo;{entry.reason}&rdquo;</p>}
          <p className="text-xs text-zinc-400">{DATETIME_FORMAT.format(new Date(entry.created_at))}</p>
        </li>
      ))}
    </ol>
  );
}
