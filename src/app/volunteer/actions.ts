"use server";

import { createAdminClient } from "@/lib/supabase/server-admin";
import { getCurrentProfile } from "@/lib/auth";
import { QA_RESULTS, type QaResult } from "@/lib/devices";
import { logDecision, syncRequestStatus } from "@/lib/request-status";

export type ActionResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR = "Something went wrong saving that change. Please try again.";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// Volunteers and staff: Technical Prep Zone → Quality Assurance Zone → Ready For Deployment.
// A QA Fail goes to Hold - Troubleshooting and frees the device from its request.
export async function advanceDevice(input: { deviceId: string; qaResult?: QaResult }): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "Please sign in again." };

  const admin = createAdminClient();
  const { data: device, error: fetchError } = await admin
    .from("devices")
    .select("id, status, reserved_request_id")
    .eq("id", input.deviceId)
    .maybeSingle();
  if (fetchError || !device) return { ok: false, message: "That device couldn't be found. Reload the page." };

  let update: Record<string, string>;
  if (device.status === "Technical Prep Zone") {
    update = { status: "Quality Assurance Zone" };
  } else if (device.status === "Quality Assurance Zone") {
    if (!input.qaResult || !QA_RESULTS.includes(input.qaResult)) {
      return { ok: false, message: "Choose a QA result: Pass, Pass with Approved Limitation, or Fail." };
    }
    update = {
      status: input.qaResult === "Fail" ? "Hold - Troubleshooting" : "Ready For Deployment",
      qa_result: input.qaResult,
      qa_by: profile.displayName,
      qa_date: todayIso(),
    };
  } else {
    return { ok: false, message: `${device.id} is in "${device.status}", which can't be advanced from here.` };
  }

  // Only update if nobody else moved it in the meantime.
  const { data: updated, error: updateError } = await admin
    .from("devices")
    .update(update)
    .eq("id", device.id)
    .eq("status", device.status)
    .select("id");
  if (updateError) return { ok: false, message: GENERIC_ERROR };
  if (!updated?.length) return { ok: false, message: `${device.id} was just updated by someone else. Reload the page.` };

  const requestId: string | null = device.reserved_request_id;
  await logDecision({
    requestId,
    deviceId: device.id,
    actor: profile.displayName,
    action: "device_status",
    fromValue: device.status,
    toValue: update.status,
    detail: device.id,
    reason: input.qaResult ? `QA result: ${input.qaResult}` : null,
  });

  if (requestId && input.qaResult === "Fail") {
    const { error: releaseError } = await admin.rpc("release_devices", {
      p_request_id: requestId,
      p_device_ids: [device.id],
      p_actor: profile.displayName,
      p_reason: "Failed QA — needs a replacement",
    });
    if (!releaseError) {
      await logDecision({
        requestId,
        deviceId: device.id,
        actor: profile.displayName,
        action: "note",
        fromValue: null,
        toValue: null,
        detail: `Needs a replacement device: ${device.id} failed QA`,
      });
    }
  }

  if (requestId) await syncRequestStatus(requestId, profile.displayName);
  return { ok: true };
}
