// Matching rules from PLAN.md section 5. Pure functions, no imports, so this
// file runs the same on the server, in the request form hint, and in tests.

export type MatchDevice = {
  id: string;
  device_type: string;
  device_category: string; // generated: laptop | desktop | tablet | other
  device_model: string | null;
  source_org: string | null;
  status: string;
  grade_letter: string | null; // A | B | C | D
  readiness_rank: number; // Ready 1, QA 2, Tech Prep 3, Holds 4-5
  reuse_cleared: string | null;
  age_band: string | null;
  win11_ready: string; // yes | no | check
  mac_ready: string;
  flex_ready: string;
  location: string | null;
  reserved_request_id: string | null;
};

export type MatchLine = {
  id: string;
  device_category: "laptop" | "desktop" | "tablet" | "recommend";
  quantity: number;
  os_pref: "windows" | "mac" | "any";
  min_grade: "A" | "B" | "C";
};

export type MatchRequest = {
  id: string;
  purpose: string | null;
  allow_substitutes: boolean;
};

export type Readiness = "ready" | "qa" | "techPrep" | "hold";

export type Candidate = {
  device: MatchDevice;
  readiness: Readiness;
  flags: string[];
  isSubstitute: boolean;
  reservedHere: boolean;
  heldElsewhere: boolean; // reserved for a different request (only with includeHeldElsewhere)
};

export type LineMatch = {
  lineId: string;
  category: "laptop" | "desktop" | "tablet";
  quantity: number;
  candidates: Candidate[]; // ranked, best first
  picks: Candidate[]; // the top `quantity` candidates
  counts: Record<Readiness, number>; // readiness of the picks
  shortNow: number; // needed minus picks that are Ready or in QA
  shortfall: number; // needed minus all picks (nothing to offer at all)
  estimatedReadyDate: string | null; // YYYY-MM-DD
  summary: string;
};

// Days until a device in each zone is likely ready. Change estimates here only.
export const READY_DAYS: Record<Readiness, number> = { ready: 0, qa: 2, techPrep: 7, hold: 10 };

const EXCLUDED_STATUSES = ["Deployed", "Not Suitable / Recycling", "Internal Use - ATB"];
const GRADE_ORDER = ["A", "B", "C"];
const AGE_ORDER = ["0-2 Years", "3-5 Years", "6-9 Years", "10+ Years", "Unknown"];

export function lineCategory(
  line: Pick<MatchLine, "device_category">,
  purpose: string | null
): "laptop" | "desktop" | "tablet" {
  if (line.device_category !== "recommend") return line.device_category;
  if (purpose === "shared_lab") return "desktop";
  if (purpose === "outreach") return "tablet";
  return "laptop";
}

function readinessOf(rank: number): Readiness {
  if (rank === 1) return "ready";
  if (rank === 2) return "qa";
  if (rank === 3) return "techPrep";
  return "hold";
}

// Returns null when the OS doesn't fit, otherwise a confidence (0 best) and flags.
function osFit(d: MatchDevice, osPref: MatchLine["os_pref"]): { confidence: number; flags: string[] } | null {
  if (osPref === "windows") {
    if (d.win11_ready === "yes") return { confidence: 0, flags: [] };
    if (d.win11_ready === "check") return { confidence: 1, flags: ["Confirm Windows 11 during prep"] };
    return null;
  }
  if (osPref === "mac") {
    if (d.device_category === "tablet") return d.device_type === "Tablet (iPad)" ? { confidence: 0, flags: [] } : null;
    return d.mac_ready === "yes" ? { confidence: 0, flags: [] } : null;
  }
  // any OS
  if (d.device_type === "Chromebook" || d.win11_ready === "yes" || d.mac_ready === "yes") {
    return { confidence: 0, flags: [] };
  }
  if (d.win11_ready === "check") return { confidence: 1, flags: ["Confirm Windows 11 during prep"] };
  if (d.flex_ready === "yes" || d.flex_ready === "check") {
    return { confidence: d.flex_ready === "yes" ? 1 : 2, flags: ["Install ChromeOS Flex"] };
  }
  return null;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shortDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );
}

export function matchLine(
  line: MatchLine,
  request: MatchRequest,
  devices: MatchDevice[],
  options: { includeHolds?: boolean; includeHeldElsewhere?: boolean; today: string }
): LineMatch {
  const category = lineCategory(line, request.purpose);
  const minGradeIndex = GRADE_ORDER.indexOf(line.min_grade);

  type Scored = Candidate & { osConfidence: number };
  const scored: Scored[] = [];

  for (const d of devices) {
    const reservedHere = d.reserved_request_id === request.id;
    if (EXCLUDED_STATUSES.includes(d.status)) continue;
    const heldElsewhere = !!d.reserved_request_id && !reservedHere;
    if (heldElsewhere && !options.includeHeldElsewhere) continue;
    const readiness = readinessOf(d.readiness_rank);
    if (readiness === "hold" && !options.includeHolds && !reservedHere) continue;
    if (d.reuse_cleared === "No") continue;
    if (d.grade_letter === "D") continue;

    const flags: string[] = heldElsewhere ? ["Held by another request"] : [];
    let isSubstitute = false;

    if (d.device_category !== category) {
      const swappable =
        (category === "laptop" && d.device_category === "desktop") ||
        (category === "desktop" && d.device_category === "laptop");
      if (!request.allow_substitutes || !swappable) continue;
      isSubstitute = true;
      flags.push(`Substitute: ${d.device_category}`);
    }

    const os = osFit(d, line.os_pref);
    if (!os) continue;
    flags.push(...os.flags);

    const gradeIndex = d.grade_letter ? GRADE_ORDER.indexOf(d.grade_letter) : -1;
    if (gradeIndex === -1 || gradeIndex > minGradeIndex) {
      if (!request.allow_substitutes) continue;
      isSubstitute = true;
      flags.push(`Substitute: grade ${d.grade_letter ?? "unknown"}`);
    }

    scored.push({ device: d, readiness, flags, isSubstitute, reservedHere, heldElsewhere, osConfidence: os.confidence });
  }

  const gradeRank = (g: string | null) => (g && GRADE_ORDER.includes(g) ? GRADE_ORDER.indexOf(g) : 9);
  const ageRank = (a: string | null) => (a && AGE_ORDER.includes(a) ? AGE_ORDER.indexOf(a) : AGE_ORDER.length - 1);
  const batchKey = (d: MatchDevice) => `${d.device_model ?? ""}|${d.source_org ?? ""}`;

  // Already-reserved devices first, exact matches before substitutes, then the
  // PLAN.md ranking: readiness → OS confidence → grade → age → batch → id.
  scored.sort(
    (a, b) =>
      Number(b.reservedHere) - Number(a.reservedHere) ||
      Number(a.heldElsewhere) - Number(b.heldElsewhere) ||
      Number(a.isSubstitute) - Number(b.isSubstitute) ||
      a.device.readiness_rank - b.device.readiness_rank ||
      a.osConfidence - b.osConfidence ||
      gradeRank(a.device.grade_letter) - gradeRank(b.device.grade_letter) ||
      ageRank(a.device.age_band) - ageRank(b.device.age_band) ||
      batchKey(a.device).localeCompare(batchKey(b.device)) ||
      a.device.id.localeCompare(b.device.id)
  );

  const candidates: Candidate[] = scored.map((s) => ({
    device: s.device,
    readiness: s.readiness,
    flags: s.flags,
    isSubstitute: s.isSubstitute,
    reservedHere: s.reservedHere,
    heldElsewhere: s.heldElsewhere,
  }));
  // Devices held by other requests are shown for reference but never picked or counted.
  const picks = candidates.filter((c) => !c.heldElsewhere).slice(0, line.quantity);
  const counts: Record<Readiness, number> = { ready: 0, qa: 0, techPrep: 0, hold: 0 };
  for (const p of picks) counts[p.readiness]++;
  const shortfall = Math.max(0, line.quantity - picks.length);

  const maxDays = picks.reduce((max, p) => Math.max(max, READY_DAYS[p.readiness]), -1);
  const estimatedReadyDate = maxDays >= 0 ? addDays(options.today, maxDays) : null;

  // "Short" = not covered by devices that are Ready or in QA right now.
  const shortNow = line.quantity - counts.ready - counts.qa;
  const parts: string[] = [];
  if (counts.ready) parts.push(`${counts.ready} ready now`);
  if (counts.qa) parts.push(`${counts.qa} in QA`);
  if (shortNow) parts.push(`${shortNow} short`);
  let summary = `${line.quantity} needed: ${parts.join(", ")}.`;
  const later: string[] = [];
  if (counts.techPrep) later.push(`${counts.techPrep} can come from Technical Prep`);
  if (counts.hold) later.push(`${counts.hold} from devices on hold`);
  if (later.length) summary += ` ${later.join(" and ")}.`;
  if (shortfall) summary += ` ${shortfall} not available at all.`;
  if (estimatedReadyDate) summary += ` Estimated ready by ${shortDate(estimatedReadyDate)}.`;

  return {
    lineId: line.id,
    category,
    quantity: line.quantity,
    candidates,
    picks,
    counts,
    shortNow,
    shortfall,
    estimatedReadyDate,
    summary,
  };
}

// Lightweight count for the public request form: eligible Ready + QA devices.
export function availableNowCount(
  line: Omit<MatchLine, "id">,
  request: Omit<MatchRequest, "id">,
  devices: MatchDevice[]
): number {
  const result = matchLine(
    { ...line, id: "hint", quantity: Number.MAX_SAFE_INTEGER },
    { ...request, id: "__hint__" },
    devices,
    { today: "2000-01-01" }
  );
  return result.candidates.filter((c) => c.readiness === "ready" || c.readiness === "qa").length;
}
