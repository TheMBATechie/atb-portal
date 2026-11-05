import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Anon-key client scoped to the signed-in user's session. Used only for
// auth (sign in / sign out / getUser) — RLS blocks all table reads here.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called during a render where cookies can't be mutated;
            // middleware (Stage 3) refreshes the session on navigation.
          }
        },
      },
    }
  );
}
