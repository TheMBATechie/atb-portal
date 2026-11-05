import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server-admin";

export type Role = "staff" | "volunteer";
export type Profile = { id: string; role: Role; displayName: string };

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, role: data.role as Role, displayName: data.display_name };
}

export async function requireStaff(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "staff") redirect("/volunteer");
  return profile;
}

export async function requireSignedIn(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}
