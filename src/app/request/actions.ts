"use server";

import { createAdminClient } from "@/lib/supabase/server-admin";
import { availableNowCount } from "@/lib/matching";
import { loadMatchableDevices } from "@/lib/match-data";
import type { Need, OsPref, Purpose, RequestLineCategory, Setup, Urgency, UseType } from "@/lib/requests";

export type PartnerSelection =
  | { kind: "existing"; partnerId: string; orgName: string }
  | { kind: "new"; orgName: string };

export type RequestLineInput = { deviceCategory: RequestLineCategory; quantity: number };

export type SubmitRequestInput = {
  partner: PartnerSelection;
  contactName: string;
  contactEmail: string;
  purpose: Purpose | null;
  purposeDetail: string;
  useType: UseType | null;
  peopleServed: number | null;
  lines: RequestLineInput[];
  osPref: OsPref;
  osFirm: boolean;
  needs: Need[];
  needsOther: string; // description when "Other" is one of the needs
  neededBy: string | null; // yyyy-mm-dd, or null for "no fixed date"
  lateImpact: string; // asked only for medium/high urgency
  partnerUrgency: Urgency | null;
  allowPartial: boolean;
  allowSubstitutes: boolean;
  setup: Setup;
  setupNotes: string;
  rawText?: string; // the free text or pasted email the AI read, if any
};

export type SubmitRequestResult = { ok: true; code: string } | { ok: false; message: string };

const GENERIC_ERROR = "Something went wrong saving your request. Please try again.";

export async function submitRequest(input: SubmitRequestInput): Promise<SubmitRequestResult> {
  const orgName = input.partner.orgName.trim();
  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim();
  const purposeDetail = input.purposeDetail.trim();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  // Same rules as the form, enforced here so contradictory answers can't be saved.
  if (!orgName) return { ok: false, message: "Tell us which organization you're with." };
  if (!contactName) return { ok: false, message: "Your name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { ok: false, message: "A valid email address is required." };
  }
  if (!input.purpose) {
    return { ok: false, message: "Tell us what people will use these devices for." };
  }
  if (input.purpose === "other" && !purposeDetail) {
    return { ok: false, message: "You picked Other. Tell us what the devices are for." };
  }
  if (input.peopleServed !== null && (!Number.isInteger(input.peopleServed) || input.peopleServed < 1)) {
    return { ok: false, message: "Number of people served must be a whole number of 1 or more." };
  }

  // One line per device type: merge duplicates instead of saving two "laptop" lines.
  const merged = new Map<RequestLineInput["deviceCategory"], number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) continue;
    merged.set(line.deviceCategory, Math.min(500, (merged.get(line.deviceCategory) ?? 0) + line.quantity));
  }
  const lines = [...merged.entries()].map(([deviceCategory, quantity]) => ({ deviceCategory, quantity }));
  if (lines.length === 0) {
    return { ok: false, message: "Add at least one device with a quantity of at least 1." };
  }
  const totalDevices = lines.reduce((n, l) => n + l.quantity, 0);

  const needsOther = input.needs.includes("other") ? input.needsOther.trim() : "";
  if (input.needs.includes("other") && !needsOther) {
    return { ok: false, message: "You picked Other under special needs. Tell us what else the devices need." };
  }

  if (input.neededBy !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.neededBy)) return { ok: false, message: "Pick a valid date." };
    if (input.neededBy < today) return { ok: false, message: "The need-by date can't be in the past." };
  }

  // Late impact only makes sense when the request is urgent; low/no urgency drops it.
  const urgent = input.partnerUrgency === "medium" || input.partnerUrgency === "high";
  const lateImpact = urgent ? input.lateImpact.trim() : "";
  if (input.partnerUrgency === "high" && !lateImpact) {
    return { ok: false, message: "For high urgency, tell us what happens if the devices arrive late." };
  }

  const setupNotes = input.setup === "preset" ? input.setupNotes.trim() : "";
  if (input.setup === "preset" && !setupNotes) {
    return { ok: false, message: "Describe the setup you need, or choose Out of the box." };
  }

  const osFirm = input.osPref === "any" ? false : input.osFirm;
  const allowPartial = totalDevices > 1 ? input.allowPartial : true;

  const supabase = createAdminClient();

  // 1. resolve the partner
  let partnerId: string | undefined;

  if (input.partner.kind === "existing") {
    partnerId = input.partner.partnerId;
  } else {
    const { data: created, error: partnerError } = await supabase
      .from("partners")
      .insert({ name: orgName, status: "pending", contact_name: contactName, contact_email: contactEmail })
      .select("id")
      .single();

    if (partnerError || !created) {
      // 23505 = unique_violation on partners.name — someone may have just
      // created this exact org; reuse it instead of failing the submission.
      if (partnerError?.code === "23505") {
        const { data: existing } = await supabase
          .from("partners")
          .select("id")
          .ilike("name", orgName)
          .maybeSingle();
        partnerId = existing?.id;
      }
      if (!partnerId) {
        return {
          ok: false,
          message:
            "We couldn't save your organization name. Try again, or pick it from the list if it's already there.",
        };
      }
    } else {
      partnerId = created.id;
    }
  }

  // 2. insert the request — `code` is omitted on purpose, the column
  // default pulls the next value from request_code_seq.
  const { data: request, error: requestError } = await supabase
    .from("requests")
    .insert({
      partner_id: partnerId,
      org_name: orgName,
      contact_name: contactName,
      contact_email: contactEmail,
      purpose: input.purpose,
      purpose_detail: purposeDetail || null,
      use_type: input.useType,
      people_served: input.peopleServed,
      needed_by: input.neededBy,
      late_impact: lateImpact || null,
      partner_urgency: input.partnerUrgency,
      // The form asks one timing question; keep the reason column in step with it.
      urgency_reason: lateImpact || null,
      allow_partial: allowPartial,
      allow_substitutes: input.allowSubstitutes,
      setup: input.setup,
      setup_notes: setupNotes || null,
      raw_text: input.rawText?.trim().slice(0, 10000) || null,
    })
    .select("id, code")
    .single();

  if (requestError || !request) {
    // Known partial-failure case, accepted for this stage: if a new partner
    // was just inserted above, it's now orphaned (pending, no request). No
    // rollback RPC — CLAUDE.md only mandates atomicity for the three
    // existing reserve/release/fulfill RPCs, not this flow.
    return { ok: false, message: GENERIC_ERROR };
  }

  // 3. insert the device lines — request-level answers copied onto every
  // line (schema stores them per-line; the form asks once).
  const { error: linesError } = await supabase.from("request_lines").insert(
    lines.map((line) => ({
      request_id: request.id,
      device_category: line.deviceCategory,
      quantity: line.quantity,
      os_pref: input.osPref,
      os_firm: osFirm,
      needs: input.needs,
      notes: needsOther ? `Other needs: ${needsOther}` : null,
    }))
  );

  if (linesError) {
    return {
      ok: false,
      message: `We saved your request (code ${request.code}) but couldn't save the device details. Please contact ATB staff and give them this code.`,
    };
  }

  // 4. log the decision — no trigger does this automatically; mirrors the
  // exact shape used in seed.sql and the reserve/release/fulfill RPCs.
  const { error: logError } = await supabase.from("decision_log").insert({
    request_id: request.id,
    actor: "system",
    action: "create",
    from_value: null,
    to_value: "submitted",
    detail: null,
    reason: null,
  });

  if (logError) {
    console.error("decision_log insert failed for", request.code, logError);
  }

  return { ok: true, code: request.code };
}

// Live hint under the OS question. Public, so it returns counts only.
export async function getAvailabilityHint(input: {
  lines: RequestLineInput[];
  osPref: OsPref;
  purpose: Purpose | null;
  allowSubstitutes: boolean;
}): Promise<number[] | null> {
  try {
    const devices = await loadMatchableDevices();
    return input.lines.slice(0, 10).map((line) =>
      availableNowCount(
        { device_category: line.deviceCategory, quantity: 1, os_pref: input.osPref, min_grade: "B" },
        { purpose: input.purpose, allow_substitutes: input.allowSubstitutes },
        devices
      )
    );
  } catch {
    return null;
  }
}
