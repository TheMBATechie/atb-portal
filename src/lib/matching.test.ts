// Run with: npm test   (Node 24 runs TypeScript directly, no extra tools)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchLine, type MatchDevice, type MatchLine, type MatchRequest } from "./matching.ts";

const TODAY = "2026-11-05";

function device(overrides: Partial<MatchDevice> & { id: string }): MatchDevice {
  return {
    device_type: "Laptop (Windows)",
    device_category: "laptop",
    device_model: "Dell",
    source_org: "Donor",
    status: "Ready For Deployment",
    grade_letter: "B",
    readiness_rank: 1,
    reuse_cleared: "Yes",
    age_band: "3-5 Years",
    win11_ready: "yes",
    mac_ready: "no",
    flex_ready: "no",
    location: null,
    reserved_request_id: null,
    ...overrides,
  };
}

const line = (o: Partial<MatchLine> = {}): MatchLine => ({
  id: "L1",
  device_category: "laptop",
  quantity: 2,
  os_pref: "windows",
  min_grade: "B",
  ...o,
});
const req = (o: Partial<MatchRequest> = {}): MatchRequest => ({
  id: "R1",
  purpose: "job_search",
  allow_substitutes: false,
  ...o,
});
const ids = (m: ReturnType<typeof matchLine>) => m.candidates.map((c) => c.device.id);

test("excludes deployed, recycled, D grade, reuse No, and devices held by another request", () => {
  const m = matchLine(line(), req(), [
    device({ id: "ok" }),
    device({ id: "deployed", status: "Deployed", readiness_rank: 9 }),
    device({ id: "recycle", status: "Not Suitable / Recycling", readiness_rank: 9 }),
    device({ id: "gradeD", grade_letter: "D" }),
    device({ id: "reuseNo", reuse_cleared: "No" }),
    device({ id: "otherReq", reserved_request_id: "R2" }),
    device({ id: "mine", reserved_request_id: "R1" }),
  ], { today: TODAY });
  assert.deepEqual(ids(m).sort(), ["mine", "ok"]);
});

test("devices held by another request appear only with the toggle, flagged and never picked", () => {
  const devices = [device({ id: "held", reserved_request_id: "R2" }), device({ id: "free", status: "Quality Assurance Zone", readiness_rank: 2 })];
  assert.deepEqual(ids(matchLine(line(), req(), devices, { today: TODAY })), ["free"]);
  const m = matchLine(line(), req(), devices, { today: TODAY, includeHeldElsewhere: true });
  assert.deepEqual(ids(m), ["free", "held"]);
  assert.deepEqual(m.candidates[1].flags, ["Held by another request"]);
  assert.deepEqual(m.picks.map((p) => p.device.id), ["free"]);
});

test("holds only appear with the toggle", () => {
  const devices = [device({ id: "hold", status: "Hold - Repair", readiness_rank: 5 })];
  assert.equal(matchLine(line(), req(), devices, { today: TODAY }).candidates.length, 0);
  assert.equal(matchLine(line(), req(), devices, { today: TODAY, includeHolds: true }).candidates.length, 1);
});

test("Windows 'check' is allowed but flagged and ranked after 'yes'", () => {
  const m = matchLine(line(), req(), [device({ id: "check", win11_ready: "check" }), device({ id: "yes" })], {
    today: TODAY,
  });
  assert.deepEqual(ids(m), ["yes", "check"]);
  assert.deepEqual(m.candidates[1].flags, ["Confirm Windows 11 during prep"]);
});

test("any OS: Flex-only devices get the install note", () => {
  const m = matchLine(line({ os_pref: "any" }), req(), [
    device({ id: "flex", win11_ready: "no", flex_ready: "yes" }),
    device({ id: "none", win11_ready: "no" }),
  ], { today: TODAY });
  assert.deepEqual(ids(m), ["flex"]);
  assert.deepEqual(m.candidates[0].flags, ["Install ChromeOS Flex"]);
});

test("mac tablets must be iPads", () => {
  const m = matchLine(line({ device_category: "tablet", os_pref: "mac" }), req(), [
    device({ id: "ipad", device_type: "Tablet (iPad)", device_category: "tablet", win11_ready: "no" }),
    device({ id: "android", device_type: "Tablet (Android)", device_category: "tablet", win11_ready: "no" }),
  ], { today: TODAY });
  assert.deepEqual(ids(m), ["ipad"]);
});

test("low grade and desktop only as substitutes, and after exact matches", () => {
  const devices = [
    device({ id: "gradeC", grade_letter: "C" }),
    device({ id: "desk", device_type: "Desktop (Windows)", device_category: "desktop" }),
    device({ id: "exactQA", status: "Quality Assurance Zone", readiness_rank: 2 }),
  ];
  assert.deepEqual(ids(matchLine(line(), req(), devices, { today: TODAY })), ["exactQA"]);
  const m = matchLine(line(), req({ allow_substitutes: true }), devices, { today: TODAY });
  assert.equal(ids(m)[0], "exactQA");
  assert.ok(m.candidates.find((c) => c.device.id === "gradeC")!.flags.includes("Substitute: grade C"));
  assert.ok(m.candidates.find((c) => c.device.id === "desk")!.flags.includes("Substitute: desktop"));
});

test("ranking: readiness, then grade, then age band", () => {
  const m = matchLine(line({ quantity: 5 }), req(), [
    device({ id: "techprep", status: "Technical Prep Zone", readiness_rank: 3, grade_letter: "A" }),
    device({ id: "readyOld", age_band: "10+ Years" }),
    device({ id: "readyNew", age_band: "0-2 Years" }),
    device({ id: "readyA", grade_letter: "A", age_band: "10+ Years" }),
  ], { today: TODAY });
  assert.deepEqual(ids(m), ["readyA", "readyNew", "readyOld", "techprep"]);
});

test("recommend uses purpose: shared lab → desktop", () => {
  const m = matchLine(line({ device_category: "recommend" }), req({ purpose: "shared_lab" }), [
    device({ id: "desk", device_type: "Desktop (Windows)", device_category: "desktop" }),
    device({ id: "lap" }),
  ], { today: TODAY });
  assert.deepEqual(ids(m), ["desk"]);
});

// Snapshot of the live non-deployed devices (Nov 5) for the main demo request.
const fixture: MatchDevice[] = JSON.parse(readFileSync(new URL("./matching.fixture.json", import.meta.url), "utf8"));
const beaconLine = line({ id: "beacon", quantity: 15, os_pref: "windows", min_grade: "B" });
const beacon = req({ id: "1c76c255-33f3-556f-9dd0-a848b263da7d", purpose: "job_search" });

test("REQ-1003 Beacon: 15 needed, 2 ready, 12 in QA, 1 short", () => {
  const m = matchLine(beaconLine, beacon, fixture, { today: TODAY });
  assert.equal(m.counts.ready, 2);
  assert.equal(m.counts.qa, 12);
  assert.equal(m.shortNow, 1);
  assert.match(m.summary, /^15 needed: 2 ready now, 12 in QA, 1 short\./);
  assert.ok(!ids(m).includes("ATB-26-5321"));
});

test("REQ-1003 Beacon: ATB-26-5321 offered as grade C substitute only if substitutes allowed", () => {
  const m = matchLine(beaconLine, { ...beacon, allow_substitutes: true }, fixture, { today: TODAY });
  const sub = m.candidates.find((c) => c.device.id === "ATB-26-5321");
  assert.ok(sub);
  assert.ok(sub.flags.includes("Substitute: grade C"));
});
