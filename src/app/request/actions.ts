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
  neededBy: string; // yyyy-mm-dd
  lateImpact: string;
  partnerUrgency: Urgency | null;
  urgencyReason: string;
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
  const lateImpact = input.lateImpact.trim();

  if (!orgName) return { ok: false, message: "Tell us which organization you're with." };
  if (!contactName) return { ok: false, message: "Your name is required." };
  if (!contactEmail || !contactEmail.includes("@")) {
    return { ok: false, message: "A valid email address is required." };
  }
  if (!input.purpose) {
    return { ok: false, message: "Tell us what people will use these devices for." };
  }
  const lines = input.lines.filter((line) => line.quantity > 0);
  if (lines.length === 0) {
    return { ok: false, message: "Add at least one device with a quantity of at least 1." };
  }
  if (!input.neededBy) return { ok: false, message: "Tell us when you need these devices." };
  if (!lateImpact) {
    return { ok: false, message: "Tell us what happens if the devices arrive later than needed." };
  }

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
      late_impact: lateImpact,
      partner_urgency: input.partnerUrgency,
      urgency_reason: input.urgencyReason.trim() || null,
      allow_partial: input.allowPartial,
      allow_substitutes: input.allowSubstitutes,
      setup: input.setup,
      setup_notes: input.setupNotes.trim() || null,
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
      os_firm: input.osFirm,
      needs: input.needs,
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
