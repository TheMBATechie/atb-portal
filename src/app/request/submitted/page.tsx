import Link from "next/link";
import { Button } from "@/components/ui/button";

export const instant = false;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function RequestSubmittedPage({
  searchParams,
}: PageProps<"/request/submitted">) {
  const sp = await searchParams;
  const code = first(sp.code).trim();

  return (
    <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Request received</h1>

      {code ? (
        <>
          <div className="rounded-lg border-2 border-zinc-900 bg-white px-8 py-6">
            <p className="break-all text-4xl font-bold tracking-wide sm:text-5xl">{code}</p>
          </div>
          <p className="text-sm font-medium text-zinc-700">
            Save this code &mdash; you&apos;ll need it to check your request&apos;s status.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t find a request code on this page. If you just submitted a request,
          check your email or go back and try again.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" variant="outline">
          <Link href="/status">Check your request&apos;s status</Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </div>
  );
}
