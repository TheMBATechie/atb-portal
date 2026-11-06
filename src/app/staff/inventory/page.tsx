import Link from "next/link";
import { getSelectedSite } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { DeviceIdTag } from "@/components/device-id-tag";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { DEVICE_STATUSES, DEVICE_CATEGORIES } from "@/lib/devices";

export const instant = false;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function StaffInventoryPage({
  searchParams,
}: PageProps<"/staff/inventory">) {
  const sp = await searchParams;
  const status = first(sp.status);
  const category = first(sp.category);
  const win11 = first(sp.win11_ready);
  const reserved = first(sp.reserved);
  const q = first(sp.q).trim();

  const supabase = createAdminClient();
  let query = supabase
    .from("devices")
    .select(
      "id, status, device_category, device_type, grade, win11_ready, mac_ready, flex_ready, reserved_request_id, location"
    )
    .order("id");

  const site = await getSelectedSite();
  if (site) query = query.eq("site_id", site);
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("device_category", category);
  if (win11) query = query.eq("win11_ready", win11);
  if (reserved === "yes") query = query.not("reserved_request_id", "is", null);
  if (reserved === "no") query = query.is("reserved_request_id", null);
  if (q) query = query.ilike("id", `%${q}%`);

  const { data, error } = await query;
  const devices = data ?? [];
  const hasFilters = Boolean(status || category || win11 || reserved || q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          {devices.length} device{devices.length === 1 ? "" : "s"} match these filters.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-muted-foreground">Status</label>
          <select id="status" name="status" defaultValue={status} className="h-8 rounded-md border px-2 text-sm">
            <option value="">All statuses</option>
            {DEVICE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-xs font-medium text-muted-foreground">Category</label>
          <select id="category" name="category" defaultValue={category} className="h-8 rounded-md border px-2 text-sm">
            <option value="">All categories</option>
            {DEVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="win11_ready" className="text-xs font-medium text-muted-foreground">Windows 11 ready</label>
          <select id="win11_ready" name="win11_ready" defaultValue={win11} className="h-8 rounded-md border px-2 text-sm">
            <option value="">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="check">Needs check</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="reserved" className="text-xs font-medium text-muted-foreground">Reserved</label>
          <select id="reserved" name="reserved" defaultValue={reserved} className="h-8 rounded-md border px-2 text-sm">
            <option value="">All</option>
            <option value="yes">Reserved</option>
            <option value="no">Not reserved</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-muted-foreground">Search device ID</label>
          <input id="q" name="q" defaultValue={q} placeholder="e.g. ATB-26-5036" className="h-8 w-48 rounded-md border px-2 text-sm" />
        </div>

        <Button type="submit" size="sm">Filter</Button>
        {hasFilters && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/staff/inventory">Clear filters</Link>
          </Button>
        )}
      </form>

      {error ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-destructive">
          Could not load the inventory right now. Try reloading the page.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Device ID</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Device type</th>
                <th className="px-3 py-2 font-medium">Grade</th>
                <th className="px-3 py-2 font-medium">Win11</th>
                <th className="px-3 py-2 font-medium">Mac</th>
                <th className="px-3 py-2 font-medium">Flex</th>
                <th className="px-3 py-2 font-medium">Reserved</th>
                <th className="px-3 py-2 font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-3 py-2"><DeviceIdTag id={d.id} /></td>
                  <td className="px-3 py-2">{d.status}</td>
                  <td className="px-3 py-2 capitalize">{d.device_category}</td>
                  <td className="px-3 py-2">{d.device_type}</td>
                  <td className="px-3 py-2">{d.grade ?? "—"}</td>
                  <td className="px-3 py-2">{d.win11_ready}</td>
                  <td className="px-3 py-2">{d.mac_ready}</td>
                  <td className="px-3 py-2">{d.flex_ready}</td>
                  <td className="px-3 py-2">{d.reserved_request_id ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{d.location ?? "—"}</td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                    No devices match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
