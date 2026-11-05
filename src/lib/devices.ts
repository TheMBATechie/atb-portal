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

// Accessories to pack, same defaults fulfill_devices writes to the sheet.
export function accessoriesFor(device: { device_type: string; accessories: string | null }): string {
  if (device.accessories) return device.accessories;
  if (device.device_type.startsWith("Desktop")) return "Keyboard, Mouse, Power Cord";
  if (device.device_type.startsWith("Laptop") || device.device_type === "Chromebook" || device.device_type.startsWith("Tablet"))
    return "Charger";
  return "None";
}

export const QA_RESULTS = ["Pass", "Pass with Approved Limitation", "Fail"] as const;
export type QaResult = (typeof QA_RESULTS)[number];
