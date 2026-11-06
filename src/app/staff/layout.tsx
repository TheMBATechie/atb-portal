import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth";
import { SiteSwitcher } from "@/components/site-switcher";
import { getSelectedSite, listSites } from "@/lib/site";

export const instant = false;

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  await requireStaff();
  const [sites, selectedSite] = await Promise.all([listSites(), getSelectedSite()]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2">
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
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <SiteSwitcher sites={sites} selected={selectedSite} />
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
