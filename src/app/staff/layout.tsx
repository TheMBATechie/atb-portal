import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl gap-2 px-4 py-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/staff">Overview</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/staff/inventory">Inventory</Link>
          </Button>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
