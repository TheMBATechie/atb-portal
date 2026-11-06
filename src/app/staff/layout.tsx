import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { requireStaff } from "@/lib/auth";

export const instant = false;

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const profile = await requireStaff();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2">
          <div className="flex flex-wrap gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/staff">Overview</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/staff/inventory">Inventory</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/staff/requests">Requests</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/staff/partners">Partners</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/staff/impact">Impact</Link>
            </Button>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{profile.displayName}</span>
            <SignOutButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
