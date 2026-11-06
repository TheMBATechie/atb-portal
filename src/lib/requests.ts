// Request-domain constants and helpers shared by /request, /request/submitted,
// and /status. Distinct from src/lib/devices.ts, which covers the `devices`
// table's own category/status vocabulary — do not reuse DEVICE_CATEGORIES
// from there for request_lines.device_category, the allowed values differ
// (laptop/desktop/tablet/recommend vs laptop/desktop/tablet/other).

export type Option<T extends string = string> = { value: T; label: string };

export const PURPOSE_OPTIONS = [
  { value: "job_search", label: "Job search" },
  { value: "classes", label: "Classes" },
  { value: "case_management", label: "Case management" },
  { value: "outreach", label: "Outreach" },
  { value: "staff_work", label: "Staff work" },
  { value: "shared_lab", label: "Shared lab" },
  { value: "other", label: "Other" },
] as const satisfies readonly Option[];
export type Purpose = (typeof PURPOSE_OPTIONS)[number]["value"];

export const USE_TYPE_OPTIONS = [
  { value: "shared", label: "Shared" },
  { value: "individual", label: "One per person" },
] as const satisfies readonly Option[];
export type UseType = (typeof USE_TYPE_OPTIONS)[number]["value"];

// request_lines.device_category — see note at top of file.
export const REQUEST_LINE_CATEGORIES = [
  { value: "laptop", label: "Laptop" },
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tablet" },
  { value: "recommend", label: "Not sure — recommend for me" },
] as const satisfies readonly Option[];
export type RequestLineCategory = (typeof REQUEST_LINE_CATEGORIES)[number]["value"];

export const OS_PREF_OPTIONS = [
  { value: "windows", label: "Windows" },
  { value: "mac", label: "Mac" },
  { value: "any", label: "Doesn't matter" },
] as const satisfies readonly Option[];
export type OsPref = (typeof OS_PREF_OPTIONS)[number]["value"];

export const NEEDS_OPTIONS = [
  { value: "webcam", label: "Webcam" },
  { value: "large_screen", label: "Large screen" },
  { value: "works_offline", label: "Works offline" },
  { value: "other", label: "Other" },
] as const satisfies readonly Option[];
export type Need = (typeof NEEDS_OPTIONS)[number]["value"];

export const URGENCY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const satisfies readonly Option[];
export type Urgency = (typeof URGENCY_OPTIONS)[number]["value"];

export const SETUP_OPTIONS = [
  { value: "out_of_box", label: "Out of the box" },
  { value: "preset", label: "We need a specific setup" },
] as const satisfies readonly Option[];
export type Setup = (typeof SETUP_OPTIONS)[number]["value"];

// Smart default device category by purpose (PLAN.md section 7).
export function defaultLineCategory(purpose: Purpose | null): RequestLineCategory {
  if (purpose === "shared_lab") return "desktop";
  if (purpose === "outreach") return "tablet";
  return "laptop";
}

// --- Partner-facing status labels (PLAN.md section 4) ----------------------

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long" });

function bucketMonthLabel(bucket: string | null, now: Date): string {
  if (bucket === "this_month") return MONTH_FORMAT.format(now);
  if (bucket === "next_month") {
    return MONTH_FORMAT.format(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  }
  return "later";
}

// Labels straight from PLAN.md section 4, plus sensible plain-language
// fallbacks for check-constraint values section 4 doesn't spell out
// (partially_matched, partially_delivered, needs_info, closed).
export function requestStatusLabel(
  status: string,
  bucket: string | null,
  now: Date = new Date()
): string {
  switch (status) {
    case "submitted":
      return "Received";
    case "needs_info":
      return "We need more information from you";
    case "scheduled":
      return `Planned for ${bucketMonthLabel(bucket, now)}`;
    case "matched":
    case "in_prep":
    case "partially_matched":
      return "Being prepared";
    case "ready_for_pickup":
      return "Ready for pickup";
    case "delivered":
      return "Delivered";
    case "partially_delivered":
      return "Partially delivered";
    case "declined":
      return "Not able to fill right now";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

// --- Staff-facing status labels ---------------------------------------------
// Staff need the precise stage (matched vs partially matched); partners get the
// friendlier wording above.
export function staffStatusLabel(status: string, bucket: string | null, now: Date = new Date()): string {
  switch (status) {
    case "submitted":
      return "New";
    case "needs_info":
      return "Waiting on partner info";
    case "scheduled":
      return `Planned for ${bucketMonthLabel(bucket, now)}`;
    case "matched":
      return "Matched";
    case "partially_matched":
      return "Partially matched";
    case "in_prep":
      return "In prep";
    case "ready_for_pickup":
      return "Ready for pickup";
    case "delivered":
      return "Delivered";
    case "partially_delivered":
      return "Partially delivered";
    case "declined":
      return "Declined";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}
