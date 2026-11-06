import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server-admin";

// Server only. Which warehouse (site) staff and volunteers are looking at.
// Stored in a cookie; "all" (or no cookie) means every site.
export const SITE_COOKIE = "atb_site";

export async function getSelectedSite(): Promise<string | null> {
  const value = (await cookies()).get(SITE_COOKIE)?.value;
  return value && value !== "all" ? value : null;
}

export async function listSites(): Promise<{ id: string; name: string; city: string | null }[]> {
  const { data } = await createAdminClient().from("sites").select("id, name, city").order("name");
  return data ?? [];
}
