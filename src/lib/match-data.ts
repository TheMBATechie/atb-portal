import { createAdminClient } from "@/lib/supabase/server-admin";
import type { MatchDevice } from "@/lib/matching";

// Server only. Loads every device that could still be matched (not deployed,
// recycled or internal), with just the columns matching.ts needs.
export const MATCH_DEVICE_COLUMNS =
  "id, device_type, device_category, device_model, source_org, status, grade_letter, readiness_rank, reuse_cleared, age_band, win11_ready, mac_ready, flex_ready, location, reserved_request_id";

export async function loadMatchableDevices(): Promise<MatchDevice[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("devices")
    .select(MATCH_DEVICE_COLUMNS)
    .not("status", "in", '("Deployed","Not Suitable / Recycling","Internal Use - ATB")');
  if (error) throw new Error(`Could not load devices: ${error.message}`);
  return (data ?? []) as MatchDevice[];
}
