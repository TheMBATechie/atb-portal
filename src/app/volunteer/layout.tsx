import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { requireSignedIn } from "@/lib/auth";
import { SiteSwitcher } from "@/components/site-switcher";
import { getSelectedSite, listSites } from "@/lib/site";

export const instant = false;

export default async function VolunteerLayout({ children }: LayoutProps<"/volunteer">) {
  const profile = await requireSignedIn();
  const [sites, selectedSite] = await Promise.all([listSites(), getSelectedSite()]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-2 text-sm">
          <div className="flex items-center gap-3">
            <Link href="/volunteer" className="font-medium hover:underline">
              Work queue
            </Link>
            {profile.role === "staff" && (
              <Link href="/staff/requests" className="text-muted-foreground hover:underline">
                Staff area
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <SiteSwitcher sites={sites} selected={selectedSite} />
            <span>{profile.displayName}</span>
            <SignOutButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
