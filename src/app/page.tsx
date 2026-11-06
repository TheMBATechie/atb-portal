import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/server-admin";

// Cache Components (Next 16) requires an explicit opt-out of prerendering
// for pages that read live, uncached data on every request.
export const instant = false;

export default async function HomePage() {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("devices")
    .select("*", { count: "exact", head: true });

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50">
      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-4 py-16 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">ATB Placement Portal</h1>
          <p className="text-zinc-600">
            Request refurbished devices, check on a request, or sign in to manage the warehouse.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/request">Request devices</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/status">Check a request</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Staff and volunteer sign in</Link>
          </Button>
        </div>

        <footer className="pt-10 text-sm text-zinc-500">
          {error
            ? "Devices tracked: unable to reach the database right now."
            : `Devices tracked so far: ${count ?? 0}`}
        </footer>
      </main>
    </div>
  );
}
