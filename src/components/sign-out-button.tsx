"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/staff/actions";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const result = await logout();
    setPending(false);
    if (result.ok) {
      router.push("/login");
      return;
    }
    setError(result.message);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
