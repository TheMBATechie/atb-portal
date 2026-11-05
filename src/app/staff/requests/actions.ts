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
    .select("bucket, status")
    .eq("id", input.requestId)
    .maybeSingle();
  if (fetchError || !current) return { ok: false, message: GENERIC_ERROR };

  // Only planning-stage requests move to "scheduled"; matched ones keep their status.
  const planning = ["submitted", "needs_info", "scheduled"].includes(current.status);
  const { error: updateError } = await admin
    .from("requests")
    .update(planning ? { bucket: input.newBucket, status: "scheduled" } : { bucket: input.newBucket })
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

// ---------------------------------------------------------------
// Stage 4: reservation (always through the database functions)
// ---------------------------------------------------------------

const MATCHABLE_STATUSES = ["submitted", "needs_info", "scheduled", "matched", "partially_matched"];

// Turns database errors into a sentence naming the device and the request holding it.
async function friendlyReserveError(message: string): Promise<string> {
  const admin = createAdminClient();
  const listed = (message.split(":").slice(1).join(":").match(/[A-Z]{2,}-\d+-\d+/g) ?? []).slice(0, 5);

  if (message.includes("DOUBLE_ALLOCATION") && listed.length) {
    const { data: devices } = await admin.from("devices").select("id, reserved_request_id").in("id", listed);
    const holderIds = [...new Set((devices ?? []).map((d) => d.reserved_request_id).filter(Boolean))];
    const { data: holders } = holderIds.length
      ? await admin.from("requests").select("id, code, org_name").in("id", holderIds)
      : { data: [] };
    const sentences = (devices ?? []).map((d) => {
      const h = (holders ?? []).find((r) => r.id === d.reserved_request_id);
      return h
        ? `${d.id} is already set aside for ${h.code} (${h.org_name}).`
        : `${d.id} is already set aside for another request.`;
    });
    return `${sentences.join(" ")} Pick a different device. Nothing was reserved.`;
  }
  if (message.includes("NOT_AVAILABLE") && listed.length) {
    return `${listed.join(", ")} can no longer be placed (already deployed, recycled, or kept for ATB). Nothing was reserved.`;
  }
  if (message.includes("UNKNOWN_DEVICE")) return "One of those devices couldn't be found. Reload the page and try again.";
  return GENERIC_ERROR;
}

// After reserving or releasing: matched / partially_matched / back to planning.
async function refreshMatchStatus(requestId: string, actor: string) {
  const admin = createAdminClient();
  const [{ data: request }, { data: lines }, { count }] = await Promise.all([
    admin.from("requests").select("status, bucket").eq("id", requestId).maybeSingle(),
    admin.from("request_lines").select("quantity").eq("request_id", requestId),
    admin.from("devices").select("id", { count: "exact", head: true }).eq("reserved_request_id", requestId),
  ]);
  if (!request || !MATCHABLE_STATUSES.includes(request.status)) return;

  const needed = (lines ?? []).reduce((sum, l) => sum + l.quantity, 0);
  const reserved = count ?? 0;
  let next: string;
  if (reserved > 0 && reserved >= needed) next = "matched";
  else if (reserved > 0) next = "partially_matched";
  else if (request.status === "matched" || request.status === "partially_matched")
    next = request.bucket ? "scheduled" : "submitted";
  else return;

  if (next === request.status) return;
  const { error } = await admin.from("requests").update({ status: next }).eq("id", requestId);
  if (error) return;
  await logDecision({
    requestId,
    actor,
    action: "set_status",
    fromValue: request.status,
    toValue: next,
    detail: `${reserved} of ${needed} devices set aside`,
  });
}

export async function reserveDevices(input: {
  requestId: string;
  lineId: string;
  deviceIds: string[];
}): Promise<ActionResult> {
  const profile = await requireStaffActor();
  if (!profile) return { ok: false, message: NOT_STAFF_ERROR };
  if (input.deviceIds.length === 0) return { ok: false, message: "Tick at least one device to reserve." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("reserve_devices", {
    p_request_id: input.requestId,
    p_line_id: input.lineId,
    p_device_ids: input.deviceIds,
    p_actor: profile.displayName,
  });
  if (error) return { ok: false, message: await friendlyReserveError(error.message) };

  await refreshMatchStatus(input.requestId, profile.displayName);
  return { ok: true };
}

export async function releaseDevices(input: {
  requestId: string;
  deviceIds: string[];
  reason: string;
}): Promise<ActionResult> {
  const profile = await requireStaffActor();
  if (!profile) return { ok: false, message: NOT_STAFF_ERROR };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, message: "Tell us why you're releasing this device." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("release_devices", {
    p_request_id: input.requestId,
    p_device_ids: input.deviceIds,
    p_actor: profile.displayName,
    p_reason: reason,
  });
  if (error) return { ok: false, message: GENERIC_ERROR };

  await refreshMatchStatus(input.requestId, profile.displayName);
  return { ok: true };
}

export async function swapDevice(input: {
  requestId: string;
  lineId: string;
  oldDeviceId: string;
  newDeviceId: string;
}): Promise<ActionResult> {
  const profile = await requireStaffActor();
  if (!profile) return { ok: false, message: NOT_STAFF_ERROR };
  if (!input.newDeviceId || input.newDeviceId === input.oldDeviceId) {
    return { ok: false, message: "Choose a different device to swap in." };
  }

  const admin = createAdminClient();
  const reason = `Swapped for ${input.newDeviceId}`;
  const { error: releaseError } = await admin.rpc("release_devices", {
    p_request_id: input.requestId,
    p_device_ids: [input.oldDeviceId],
    p_actor: profile.displayName,
    p_reason: reason,
  });
  if (releaseError) return { ok: false, message: GENERIC_ERROR };

  const { error: reserveError } = await admin.rpc("reserve_devices", {
    p_request_id: input.requestId,
    p_line_id: input.lineId,
    p_device_ids: [input.newDeviceId],
    p_actor: profile.displayName,
    p_reason: `Swapped in for ${input.oldDeviceId}`,
  });
  if (reserveError) {
    // Put the original device back so the request doesn't lose it.
    await admin.rpc("reserve_devices", {
      p_request_id: input.requestId,
      p_line_id: input.lineId,
      p_device_ids: [input.oldDeviceId],
      p_actor: profile.displayName,
      p_reason: "Swap failed, original device kept",
    });
    return { ok: false, message: await friendlyReserveError(reserveError.message) };
  }

  await logDecision({
    requestId: input.requestId,
    actor: profile.displayName,
    action: "swap",
    fromValue: input.oldDeviceId,
    toValue: input.newDeviceId,
  });
  await refreshMatchStatus(input.requestId, profile.displayName);
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
