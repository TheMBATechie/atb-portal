"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server-admin";

export type LoginInput = { email: string; password: string };
export type LoginResult = { ok: true; role: "staff" | "volunteer" } | { ok: false; message: string };

const GENERIC_ERROR = "Incorrect email or password.";

export async function login(input: LoginInput): Promise<LoginResult> {
  const email = input.email.trim();
  const password = input.password;

  if (!email || !password) return { ok: false, message: GENERIC_ERROR };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, message: "Your account isn't set up yet. Ask ATB staff to add you." };
  }

  return { ok: true, role: profile.role as "staff" | "volunteer" };
}
