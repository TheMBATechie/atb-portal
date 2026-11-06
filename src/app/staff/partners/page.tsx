import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";

export const instant = false;

export default async function PartnersPage() {
  const supabase = createAdminClient();
  const [partnersRes, requestsRes, devicesRes] = await Promise.all([
    supabase.from("partners").select("id, name, primary_category, status").order("name"),
    supabase.from("requests").select("partner_id"),
    supabase.from("devices").select("deployment_partner").eq("status", "Deployed"),
  ]);

  if (partnersRes.error) {
    return (
      <p className="rounded-lg border bg-white p-4 text-sm text-destructive">
        Could not load partners right now. Try reloading the page.
      </p>
    );
  }

  const requestCount = new Map<string, number>();
  for (const r of requestsRes.data ?? []) {
    if (r.partner_id) requestCount.set(r.partner_id, (requestCount.get(r.partner_id) ?? 0) + 1);
  }
  const deviceCount = new Map<string, number>();
  for (const d of devicesRes.data ?? []) {
    if (d.deployment_partner) deviceCount.set(d.deployment_partner, (deviceCount.get(d.deployment_partner) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Partners</h1>
        <p className="text-sm text-muted-foreground">Nonprofits ATB works with. Click one to see its history.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Partner</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Requests</th>
              <th className="px-3 py-2 text-right font-medium">Devices received</th>
            </tr>
          </thead>
          <tbody>
            {(partnersRes.data ?? []).map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/staff/partners/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.status === "pending" && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">New</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.primary_category ?? "—"}</td>
                <td className="px-3 py-2 text-right">{requestCount.get(p.id) ?? 0}</td>
                <td className="px-3 py-2 text-right">{deviceCount.get(p.name) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
