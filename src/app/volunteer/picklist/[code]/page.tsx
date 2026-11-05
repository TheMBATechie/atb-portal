import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { accessoriesFor } from "@/lib/devices";
import { PicklistChecklist, type PickItem } from "@/components/picklist-checklist";

export const instant = false;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default async function PicklistPage({ params }: PageProps<"/volunteer/picklist/[code]">) {
  const { code } = await params;
  const supabase = createAdminClient();

  const { data: request } = await supabase
    .from("requests")
    .select("id, code, org_name, needed_by")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!request) notFound();

  const { data: devices } = await supabase
    .from("devices")
    .select("id, device_type, device_model, status, location, accessories")
    .eq("reserved_request_id", request.id);

  const items: PickItem[] = (devices ?? [])
    .sort((a, b) => (a.location ?? "~").localeCompare(b.location ?? "~") || a.id.localeCompare(b.id))
    .map((d) => ({
      id: d.id,
      label: d.device_model ? `${d.device_type} · ${d.device_model}` : d.device_type,
      status: d.status,
      location: d.location,
      accessories: accessoriesFor(d),
    }));

  return (
    <div className="space-y-4">
      <Link href="/volunteer" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to work queue
      </Link>
      <div>
        <p className="font-mono text-sm text-muted-foreground">{request.code}</p>
        <h1 className="text-2xl font-bold">Pick list: {request.org_name}</h1>
        {request.needed_by && (
          <p className="text-sm text-muted-foreground">
            Needed by {DATE_FORMAT.format(new Date(`${request.needed_by}T00:00:00`))}
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-muted-foreground">
          No devices are set aside for this request.
        </p>
      ) : (
        <PicklistChecklist items={items} />
      )}

      <p className="text-sm text-muted-foreground">
        Sorted by shelf. When everything is packed, ask staff to confirm the handoff on the request page.
      </p>
    </div>
  );
}
