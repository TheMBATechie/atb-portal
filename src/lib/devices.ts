// Canonical device constants shared by /staff and /staff/inventory.
// Status strings must match the source sheet exactly — see PLAN.md section 4.
// Never rename, reorder, or abbreviate these.

export const DEVICE_STATUSES = [
  "Technical Prep Zone",
  "Quality Assurance Zone",
  "Ready For Deployment",
  "Deployed",
  "Hold - Troubleshooting",
  "Hold - Repair",
  "Not Suitable / Recycling",
  "Internal Use - ATB",
] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const DEVICE_CATEGORIES = ["laptop", "desktop", "tablet", "other"] as const;

export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

export function isDeviceCategory(value: unknown): value is DeviceCategory {
  return DEVICE_CATEGORIES.includes(value as DeviceCategory);
}
