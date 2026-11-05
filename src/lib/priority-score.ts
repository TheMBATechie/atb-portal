// Suggested priority score — PLAN.md section 5. A hint only, shown on the
// planning board and the request detail page; nothing here writes to the
// database or is ever applied automatically.

export type ScoreInput = {
  partnerUrgency: "low" | "medium" | "high" | null;
  neededBy: string | null; // yyyy-mm-dd
  peopleServed: number | null;
  createdAt: string; // ISO timestamp
  devicesPlacedThisYear: number;
};

export type ScoreBreakdownItem = { label: string; points: number };
export type ScoreResult = { total: number; breakdown: ScoreBreakdownItem[] };

const DAY_MS = 24 * 60 * 60 * 1000;

function urgencyPoints(urgency: ScoreInput["partnerUrgency"]): number {
  if (urgency === "high") return 30;
  if (urgency === "medium") return 15;
  if (urgency === "low") return 5;
  return 0;
}

function deadlinePoints(neededBy: string | null, now: Date): number {
  if (!neededBy) return 0;
  const days = Math.ceil((new Date(`${neededBy}T00:00:00`).getTime() - now.getTime()) / DAY_MS);
  if (days <= 14) return 30;
  if (days <= 30) return 20;
  if (days <= 60) return 10;
  return 0;
}

function peoplePoints(peopleServed: number | null): number {
  if (!peopleServed || peopleServed <= 0) return 0;
  return Math.min(20, Math.round(peopleServed / 3));
}

function waitingPoints(createdAt: string, now: Date): number {
  const days = Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY_MS);
  return Math.min(10, Math.max(0, days));
}

function placedPenalty(count: number): number {
  if (!count || count <= 0) return 0;
  return -Math.min(15, Math.round(count / 4));
}

export function suggestedPriorityScore(input: ScoreInput, now: Date = new Date()): ScoreResult {
  const breakdown: ScoreBreakdownItem[] = [
    { label: "Partner urgency", points: urgencyPoints(input.partnerUrgency) },
    { label: "Deadline", points: deadlinePoints(input.neededBy, now) },
    { label: "People served", points: peoplePoints(input.peopleServed) },
    { label: "Days waiting", points: waitingPoints(input.createdAt, now) },
    {
      label: "Devices already placed with this partner this year",
      points: placedPenalty(input.devicesPlacedThisYear),
    },
  ];
  const total = breakdown.reduce((sum, item) => sum + item.points, 0);
  return { total, breakdown };
}
