"use server";

import { createAdminClient } from "@/lib/supabase/server-admin";
import { getCurrentProfile } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR = "Something went wrong saving that change. Please try again.";
const NOT_STAFF_ERROR = "You need to be signed in as staff to do that.";

async function requireStaffActor() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "staff") return null;
  return profile;
}

async function logDecision(params: {
  requestId: string;
  actor: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  detail?: string | null;
  reason?: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("decision_log").insert({
    request_id: params.requestId,
    actor: params.actor,
    action: params.action,
    from_value: params.fromValue,
    to_value: params.toValue,
    detail: params.detail ?? null,
    reason: params.reason ?? null,
  });
  if (error) console.error("decision_log insert failed", params, error);
}

export async function setStaffPriority(input: {
  requestId: string;
  newPriority: number;
  reason: string;
}): Promise<ActionResult> {
  const profile = await requireStaffActor();
  if (!profile) return { ok: false, message: NOT_STAFF_ERROR };

  if (!Number.isInteger(input.newPriority) || input.newPriority < 1 || input.newPriority > 5) {
    return { ok: false, message: "Priority must be between 1 (highest) and 5." };
  }

  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin
    .from("requests")
    .select("staff_priority")
    .eq("id", input.requestId)
    .maybeSingle();
  if (fetchError || !current) return { ok: false, message: GENERIC_ERROR };

  const previous: number | null = current.staff_priority;
  const isRaise = previous !== null && input.newPriority < previous;
  const reason = input.reason.trim();
  if (isRaise && !reason) {
    return { ok: false, message: "Tell us why you're raising this request's priority." };
  }

  const { error: updateError } = await admin
    .from("requests")
    .update({ staff_priority: input.newPriority })
    .eq("id", input.requestId);
  if (updateError) return { ok: false, message: GENERIC_ERROR };

  await logDecision({
    requestId: input.requestId,
    actor: profile.displayName,
    action: "set_priority",
    fromValue: previous === null ? null : String(previous),
    toValue: String(input.newPriority),
    reason: reason || null,
  });

  return { ok: true };
}

export async function setBucket(input: {
  requestId: string;
  newBucket: "this_month" | "next_month" | "later";
  reason: string;
}): Promise<ActionResult> {
  const profile = await requireStaffActor();
  if (!profile) return { ok: false, message: NOT_STAFF_ERROR };

  const reason = input.reason.trim();
  if (input.newBucket === "this_month" && !reason) {
    return { ok: false, message: "Tell us why this is moving to This month." };
  }

  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin
    .from("requests")
    .select("bucket")
    .eq("id", input.requestId)
    .maybeSingle();
  if (fetchError || !current) return { ok: false, message: GENERIC_ERROR };

  const { error: updateError } = await admin
    .from("requests")
    .update({ bucket: input.newBucket, status: "scheduled" })
    .eq("id", input.requestId);
  if (updateError) return { ok: false, message: GENERIC_ERROR };

  await logDecision({
    requestId: input.requestId,
    actor: profile.displayName,
    action: "set_bucket",
    fromValue: current.bucket,
    toValue: input.newBucket,
    reason: reason || null,
  });

  return { ok: true };
}

export async function declineRequest(input: { requestId: string; message: string }): Promise<ActionResult> {
  const profile = await requireStaffActor();
  if (!profile) return { ok: false, message: NOT_STAFF_ERROR };

  const message = input.message.trim();
  if (!message) return { ok: false, message: "Tell the partner why you're declining this request." };

  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin
    .from("requests")
    .select("status")
    .eq("id", input.requestId)
    .maybeSingle();
  if (fetchError || !current) return { ok: false, message: GENERIC_ERROR };

  const { error: updateError } = await admin
    .from("requests")
    .update({ status: "declined", decline_message: message })
    .eq("id", input.requestId);
  if (updateError) return { ok: false, message: GENERIC_ERROR };

  await logDecision({
    requestId: input.requestId,
    actor: profile.displayName,
    action: "decline",
    fromValue: current.status,
    toValue: "declined",
    reason: message,
  });

  return { ok: true };
}

export async function deferRequest(input: { requestId: string; message: string }): Promise<ActionResult> {
  const profile = await requireStaffActor();
  if (!profile) return { ok: false, message: NOT_STAFF_ERROR };

  const message = input.message.trim();
  if (!message) return { ok: false, message: "Tell the partner what information you need." };

  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin
    .from("requests")
    .select("status")
    .eq("id", input.requestId)
    .maybeSingle();
  if (fetchError || !current) return { ok: false, message: GENERIC_ERROR };

  const { error: updateError } = await admin
    .from("requests")
    .update({ status: "needs_info" })
    .eq("id", input.requestId);
  if (updateError) return { ok: false, message: GENERIC_ERROR };

  await logDecision({
    requestId: input.requestId,
    actor: profile.displayName,
    action: "set_status",
    fromValue: current.status,
    toValue: "needs_info",
    detail: "Deferred — more information requested",
    reason: message,
  });

  return { ok: true };
}
