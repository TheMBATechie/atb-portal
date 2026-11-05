import { createAdminClient } from "@/lib/supabase/server-admin";

// Server only. Shared by staff and volunteer actions.

export async function logDecision(params: {
  requestId: string | null;
  deviceId?: string | null;
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
    device_id: params.deviceId ?? null,
    actor: params.actor,
    action: params.action,
    from_value: params.fromValue,
    to_value: params.toValue,
    detail: params.detail ?? null,
    reason: params.reason ?? null,
  });
  if (error) console.error("decision_log insert failed", params, error);
}

const SYNCED_STATUSES = [
  "submitted",
  "needs_info",
  "scheduled",
  "matched",
  "partially_matched",
  "in_prep",
  "ready_for_pickup",
];
const HAD_DEVICES = ["matched", "partially_matched", "in_prep", "ready_for_pickup"];

// Keeps the request status in step with its reserved devices:
// none → back to planning; all Ready → ready_for_pickup; else matched / partially_matched.
export async function syncRequestStatus(requestId: string, actor: string) {
  const admin = createAdminClient();
  const [{ data: request }, { data: lines }, { data: reservedDevices }] = await Promise.all([
    admin.from("requests").select("status, bucket, allow_partial").eq("id", requestId).maybeSingle(),
    admin.from("request_lines").select("quantity").eq("request_id", requestId),
    admin.from("devices").select("status").eq("reserved_request_id", requestId),
  ]);
  if (!request || !SYNCED_STATUSES.includes(request.status)) return;

  const needed = (lines ?? []).reduce((sum, l) => sum + l.quantity, 0);
  const reserved = reservedDevices?.length ?? 0;
  const allReady = reserved > 0 && (reservedDevices ?? []).every((d) => d.status === "Ready For Deployment");

  let next: string;
  if (reserved === 0) {
    if (!HAD_DEVICES.includes(request.status)) return;
    next = request.bucket ? "scheduled" : "submitted";
  } else if (allReady && (reserved >= needed || request.allow_partial)) {
    next = "ready_for_pickup";
  } else if (request.status === "in_prep") {
    return;
  } else {
    next = reserved >= needed ? "matched" : "partially_matched";
  }

  if (next === request.status) return;
  const { error } = await admin.from("requests").update({ status: next }).eq("id", requestId);
  if (error) return;
  await logDecision({
    requestId,
    actor,
    action: "set_status",
    fromValue: request.status,
    toValue: next,
    detail: `${reserved} of ${needed} devices set aside${allReady ? ", all ready" : ""}`,
  });
}
