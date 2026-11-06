import { createAdminClient } from "@/lib/supabase/server-admin";
import { RequestForm } from "@/components/request-form";

export const instant = false;

export default async function RequestPage() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("partners").select("id, name").order("name");
  const partners = data ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl text-atb-navy">Request devices</h1>
        <p className="text-zinc-600">
          Five short steps, about two minutes. Answers marked <span className="inline-flex items-center gap-1 font-medium text-atb-navy">
            <span className="size-1.5 rounded-full bg-atb-coral" aria-hidden="true" />
            Required
          </span>{" "}
          are needed to plan your request. Everything else is optional and just helps us plan.
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
