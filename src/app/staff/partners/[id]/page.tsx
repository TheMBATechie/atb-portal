import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { REQUEST_LINE_CATEGORIES, staffStatusLabel } from "@/lib/requests";
import { DeviceIdTag } from "@/components/device-id-tag";
import { FeedbackList } from "@/components/feedback-form";

export const instant = false;

const CATEGORY_LABELS = new Map<string, string>(REQUEST_LINE_CATEGORIES.map((c) => [c.value, c.label]));
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtDate = (d: string | null) => (d ? DATE_FORMAT.format(new Date(`${d}T00:00:00`)) : "—");

export default async function PartnerPage({ params }: PageProps<"/staff/partners/[id]">) {
  await connection(); // "this year" depends on today's date
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, primary_category, contact_name, contact_email, status")
    .eq("id", id)
    .maybeSingle();
  if (!partner) notFound();

  const [requestsRes, devicesRes] = await Promise.all([
    supabase
      .from("requests")
      .select("id, code, status, bucket, needed_by, created_at, request_lines(device_category, quantity)")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("devices")
      .select("id, device_type, device_model, deployment_date")
      .eq("deployment_partner", partner.name)
      .eq("status", "Deployed")
      .order("deployment_date", { ascending: false }),
  ]);
  const requests = requestsRes.data ?? [];
  const devices = devicesRes.data ?? [];

  const requestIds = requests.map((r) => r.id);
  const { data: feedbackRows } = requestIds.length
    ? await supabase
        .from("request_feedback")
        .select("id, request_id, source, rating, body, created_at")
        .in("request_id", requestIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const codeById = new Map(requests.map((r) => [r.id, r.code]));
  const feedback = (feedbackRows ?? []).map((f) => ({ ...f, code: codeById.get(f.request_id) }));

  const year = new Date().getFullYear();
  const thisYear = devices.filter((d) => d.deployment_date && new Date(d.deployment_date).getFullYear() === year).length;
  const byType = new Map<string, number>();
  for (const d of devices) byType.set(d.device_type, (byType.get(d.device_type) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{partner.name}</h1>
          <p className="text-sm text-muted-foreground">
            {partner.primary_category ?? "No category"}
            {partner.contact_name ? ` · ${partner.contact_name}` : ""}
            {partner.contact_email ? ` · ${partner.contact_email}` : ""}
            {partner.status === "pending" ? " · New partner (not yet approved)" : ""}
          </p>
        </div>
        <Link href="/staff/partners" className="text-sm text-muted-foreground hover:underline">
          &larr; All partners
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">Requests ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/staff/requests/${r.code}`} className="font-mono hover:underline">
                  {r.code}
                </Link>
                <span className="font-medium">{staffStatusLabel(r.status, r.bucket)}</span>
                <span className="text-muted-foreground">
                  {(r.request_lines ?? [])
                    .map((l) => `${l.quantity}× ${CATEGORY_LABELS.get(l.device_category) ?? l.device_category}`)
                    .join(", ")}
                </span>
                <span className="text-xs text-muted-foreground">needed by {fmtDate(r.needed_by)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-1 font-semibold">Devices received ({devices.length})</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {thisYear} this year
          {byType.size > 0 &&
            ` · ${[...byType.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([t, n]) => `${n} ${t}`)
              .join(", ")}`}
        </p>
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No devices placed with this partner yet.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <DeviceIdTag id={d.id} />
                <span>
                  {d.device_type}
                  {d.device_model ? ` · ${d.device_model}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{fmtDate(d.deployment_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">Feedback ({feedback.length})</h2>
        <FeedbackList items={feedback} />
      </section>
    </div>
  );
}
