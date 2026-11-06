"use server";

import { createAdminClient } from "@/lib/supabase/server-admin";
import { logDecision } from "@/lib/request-status";

export type ActionResult = { ok: true } | { ok: false; message: string };

// "use server" files may only export async functions, so this stays local.
const FEEDBACK_STATUSES = ["delivered", "partially_delivered", "closed"];

// Public: the partner proves who they are with code + email, same as the status lookup.
export async function submitPartnerFeedback(input: {
  code: string;
  email: string;
  rating: number | null;
  body: string;
}): Promise<ActionResult> {
  const body = input.body.trim().slice(0, 2000);
  if (!body) return { ok: false, message: "Write a short note." };
  if (!input.rating || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, message: "Pick a rating from 1 to 5." };
  }

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("requests")
    .select("id, status")
    .eq("code", input.code.trim().toUpperCase())
    .ilike("contact_email", input.email.trim())
    .maybeSingle();
  if (!request) return { ok: false, message: "We couldn't find that request. Check the code and email." };
  if (!FEEDBACK_STATUSES.includes(request.status)) {
    return { ok: false, message: "Feedback opens once your devices have been delivered." };
  }

  const { error } = await admin
    .from("request_feedback")
    .insert({ request_id: request.id, source: "partner", rating: input.rating, body });
  if (error) return { ok: false, message: "Something went wrong sending your feedback. Please try again." };

  await logDecision({
    requestId: request.id,
    actor: "Partner",
    action: "note",
    fromValue: null,
    toValue: null,
    detail: `Partner feedback received (${input.rating}/5)`,
  });
  return { ok: true };
}
