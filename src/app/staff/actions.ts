"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type LogoutResult = { ok: true } | { ok: false; message: string };

export async function logout(): Promise<LogoutResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, message: "Could not sign you out. Try again." };
  return { ok: true };
}
