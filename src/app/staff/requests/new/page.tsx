import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { RequestForm } from "@/components/request-form";

export const instant = false;

// Staff create a request on a partner's behalf, usually from an email.
export default async function NewStaffRequestPage() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("partners").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">New request for a partner</h1>
          <p className="text-sm text-muted-foreground">
            Paste the partner&apos;s email to fill the form, check the answers, then create the request.
          </p>
        </div>
        <Link href="/staff/requests" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to planning board
        </Link>
      </div>
      {error ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-destructive">
          Could not load partners right now. Try reloading the page.
        </div>
      ) : (
        <RequestForm partners={data ?? []} mode="staff" />
      )}
    </div>
  );
}
