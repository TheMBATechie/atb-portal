"use server";

import { cookies } from "next/headers";
import { getCurrentProfile } from "@/lib/auth";
import { SITE_COOKIE } from "@/lib/site";

export async function setSite(siteId: string): Promise<{ ok: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false };
  const value = /^[a-z0-9_-]{1,40}$/i.test(siteId) ? siteId : "all";
  (await cookies()).set(SITE_COOKIE, value, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
}
