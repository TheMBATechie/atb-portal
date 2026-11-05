import { createAdminClient } from "@/lib/supabase/server-admin";
import { RequestForm } from "@/components/request-form";

export const instant = false;

export default async function RequestPage() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("partners").select("id, name").order("name");
  const partners = data ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold">Request devices</h1>
        <p className="text-sm text-muted-foreground">
          Tell us what you need in plain language. Fields marked{" "}
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Must
          </span>{" "}
          are required &mdash; everything else is optional and just helps us plan.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-destructive">
          We couldn&apos;t load the request form right now. Try reloading the page.
        </div>
      ) : (
        <RequestForm partners={partners} />
      )}
    </div>
  );
}
