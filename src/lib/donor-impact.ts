import { createAdminClient } from "@/lib/supabase/server-admin";

// Server only. Aggregate facts about one donor (devices.source_org).
// Never includes recipient names: safe to show and to send to the AI.

export type DonorImpact = {
  donor: string;
  received: number;
  placed: number;
  inPipeline: { status: string; count: number }[];
  recycled: number;
  internalUse: number;
  byPartner: { name: string; count: number }[];
  byCategory: { name: string; count: number }[];
  byType: { name: string; count: number }[];
  byMonth: { month: string; label: string; count: number }[];
  firstPlaced: string | null;
  lastPlaced: string | null;
};

const PIPELINE = ["Technical Prep Zone", "Quality Assurance Zone", "Ready For Deployment", "Hold - Troubleshooting", "Hold - Repair"];

function tally(values: (string | null)[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export async function listDonors(): Promise<{ name: string; count: number }[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("devices").select("source_org");
  return tally((data ?? []).map((d) => d.source_org));
}

export async function loadDonorImpact(donor: string): Promise<DonorImpact | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("devices")
    .select("status, device_type, deployment_partner, recipient_category, deployment_date")
    .eq("source_org", donor);
  if (error || !data || data.length === 0) return null;

  const placed = data.filter((d) => d.status === "Deployed");
  const dates = placed.map((d) => d.deployment_date).filter((d): d is string => !!d).sort();
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const byMonth = tally(dates.map((d) => d.slice(0, 7)))
    .map(({ name, count }) => ({ month: name, label: monthFmt.format(new Date(`${name}-01T00:00:00Z`)), count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    donor,
    received: data.length,
    placed: placed.length,
    inPipeline: PIPELINE.map((status) => ({ status, count: data.filter((d) => d.status === status).length })).filter(
      (p) => p.count > 0
    ),
    recycled: data.filter((d) => d.status === "Not Suitable / Recycling").length,
    internalUse: data.filter((d) => d.status === "Internal Use - ATB").length,
    byPartner: tally(placed.map((d) => d.deployment_partner)),
    byCategory: tally(placed.map((d) => d.recipient_category)),
    byType: tally(data.map((d) => d.device_type)),
    byMonth,
    firstPlaced: dates[0] ?? null,
    lastPlaced: dates[dates.length - 1] ?? null,
  };
}
