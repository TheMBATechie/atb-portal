import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { REQUEST_LINE_CATEGORIES, requestStatusLabel } from "@/lib/requests";

export const instant = false;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

const CATEGORY_LABELS = new Map<string, string>(
  REQUEST_LINE_CATEGORIES.map((c) => [c.value, c.label])
);

type RequestLine = { device_category: string; quantity: number; os_pref: string; os_firm: boolean };

export default async function StatusPage({ searchParams }: PageProps<"/status">) {
  const sp = await searchParams;
  const code = first(sp.code).trim();
  const email = first(sp.email).trim();
  const hasQuery = Boolean(code && email);

  let notFound = false;
  let request: { code: string; status: string; bucket: string | null } | null = null;
  let lines: RequestLine[] = [];

  if (hasQuery) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("requests")
      .select("id, code, status, bucket")
      .eq("code", code.toUpperCase())
      .ilike("contact_email", email)
      .maybeSingle();

    if (error || !data) {
      notFound = true;
    } else {
      request = { code: data.code, status: data.status, bucket: data.bucket };
      const { data: lineRows } = await supabase
        .from("request_lines")
        .select("device_category, quantity, os_pref, os_firm")
        .eq("request_id", data.id);
      lines = lineRows ?? [];
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-10">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold">Check a request</h1>
        <p className="text-sm text-muted-foreground">
          Enter your request code and the email you submitted it with.
        </p>
      </div>

      <form method="GET" className="flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="code" className="text-xs font-medium text-muted-foreground">
            Request code
          </label>
          <input
            id="code"
            name="code"
            defaultValue={code}
            placeholder="REQ-1007"
            className="h-9 rounded-md border px-2 text-sm"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={email}
            placeholder="you@example.org"
            className="h-9 rounded-md border px-2 text-sm"
          />
        </div>
        <Button type="submit">Check status</Button>
      </form>

      {hasQuery && notFound && (
        <div className="mt-6 rounded-lg border bg-white p-4 text-sm text-destructive">
          We couldn&apos;t find a request with that code and email. Double check both and try again.
        </div>
      )}

      {request && (
        <div className="mt-6 space-y-4 rounded-lg border bg-white p-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{request.code}</p>
            <h2 className="text-lg font-semibold">{requestStatusLabel(request.status, request.bucket)}</h2>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Devices requested</p>
            <ul className="space-y-1 text-sm">
              {lines.map((line, i) => (
                <li key={i}>
                  {line.quantity}&times; {CATEGORY_LABELS.get(line.device_category) ?? line.device_category}
                  {line.os_pref !== "any" && (
                    <>
                      {" "}
                      &middot; {line.os_pref === "windows" ? "Windows" : "Mac"}
                      {line.os_firm ? " (required)" : " (preferred)"}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {/* No estimated date yet (Stage 4+ builds matching/estimation). Omitted, not faked. */}
        </div>
      )}
    </div>
  );
}
