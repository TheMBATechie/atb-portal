import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { requireSignedIn } from "@/lib/auth";

export const instant = false;

// Placeholder until Stage 5 builds the real volunteer queue.
export default async function VolunteerPage() {
  const profile = await requireSignedIn();

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-12">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{profile.displayName}</span>
        <SignOutButton />
      </div>
      <h1 className="text-2xl font-bold">Volunteer work queue</h1>
      <p className="text-sm text-muted-foreground">
        Your list of devices to work on will appear here soon.
      </p>
      {profile.role === "staff" && (
        <Link href="/staff" className="text-sm hover:underline">
          Go to the staff area &rarr;
        </Link>
      )}
    </div>
  );
}
