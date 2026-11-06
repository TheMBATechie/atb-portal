"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getAvailabilityHint, submitRequest, type SubmitRequestInput } from "@/app/request/actions";
import {
  NEEDS_OPTIONS,
  OS_PREF_OPTIONS,
  PURPOSE_OPTIONS,
  REQUEST_LINE_CATEGORIES,
  SETUP_OPTIONS,
  URGENCY_OPTIONS,
  USE_TYPE_OPTIONS,
  defaultLineCategory,
  type Need,
  type OsPref,
  type Purpose,
  type RequestLineCategory,
  type Setup,
  type Urgency,
  type UseType,
} from "@/lib/requests";

type Partner = { id: string; name: string };
type Line = { id: string; category: RequestLineCategory; quantity: number };

function labelForCategory(category: RequestLineCategory): string {
  return REQUEST_LINE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

function Tag({ tag }: { tag: "must" | "nice" }) {
  return (
    <span
      className={
        tag === "must"
          ? "rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
          : "rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
      }
    >
      {tag === "must" ? "Must" : "Nice"}
    </span>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-sm transition-colors " +
        (selected
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400")
      }
    >
      {children}
    </button>
  );
}

const fieldClass = "h-9 w-full rounded-md border px-2 text-sm";
const labelRow = "flex items-center gap-2";

// Shape returned by /api/ai/parse-request (validated with zod on the server).
type AiFields = {
  org_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  purpose?: Purpose | null;
  purpose_detail?: string | null;
  use_type?: UseType | null;
  people_served?: number | null;
  lines?: { device_category: RequestLineCategory; quantity: number }[] | null;
  os_pref?: OsPref | null;
  os_firm?: boolean | null;
  needs?: Need[] | null;
  needed_by?: string | null;
  late_impact?: string | null;
  partner_urgency?: Urgency | null;
  urgency_reason?: string | null;
  allow_partial?: boolean | null;
  allow_substitutes?: boolean | null;
  setup?: Setup | null;
  setup_notes?: string | null;
};

type SectionKey = "org" | "purpose" | "use" | "lines" | "os" | "needs" | "when" | "urgency" | "flex" | "setup";

const AI_FALLBACK_NOTE = "Automatic fill isn't available right now. Please fill in the form below.";

export function RequestForm({ partners, mode = "partner" }: { partners: Partner[]; mode?: "partner" | "staff" }) {
  const router = useRouter();
  const lineCounter = useRef(1);

  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiFilled, setAiFilled] = useState<Set<SectionKey>>(new Set());

  const [partnerId, setPartnerId] = useState("");
  const [isOtherOrg, setIsOtherOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [purposeDetail, setPurposeDetail] = useState("");

  const [useType, setUseType] = useState<UseType | null>(null);
  const [peopleServed, setPeopleServed] = useState("");

  const [lines, setLines] = useState<Line[]>([
    { id: "line-1", category: defaultLineCategory(null), quantity: 1 },
  ]);

  const [osPref, setOsPref] = useState<OsPref>("any");
  const [osFirm, setOsFirm] = useState(false);
  const [availability, setAvailability] = useState<number[] | null>(null);

  const [needs, setNeeds] = useState<Need[]>([]);

  const [neededBy, setNeededBy] = useState("");
  const [lateImpact, setLateImpact] = useState("");

  const [partnerUrgency, setPartnerUrgency] = useState<Urgency | null>(null);
  const [urgencyReason, setUrgencyReason] = useState("");

  const [allowPartial, setAllowPartial] = useState(true);
  const [allowSubstitutes, setAllowSubstitutes] = useState(false);

  const [setup, setSetup] = useState<Setup>("out_of_box");
  const [setupNotes, setSetupNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live availability hint: re-check shortly after the answers stop changing.
  const lineKey = lines.map((l) => l.category).join(",");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const counts = await getAvailabilityHint({
        lines: lineKey.split(",").map((c) => ({ deviceCategory: c as RequestLineCategory, quantity: 1 })),
        osPref,
        purpose,
        allowSubstitutes,
      });
      if (!cancelled) setAvailability(counts);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lineKey, osPref, purpose, allowSubstitutes]);

  function addLine() {
    lineCounter.current += 1;
    setLines((prev) => [
      ...prev,
      { id: `line-${lineCounter.current}`, category: defaultLineCategory(purpose), quantity: 1 },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== id)));
  }

  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function sectionClass(key: SectionKey, spacing = "space-y-3") {
    const highlight = aiFilled.has(key) ? " border-atb-coral ring-2 ring-atb-apricot" : "";
    return `${spacing} rounded-lg border bg-white p-4${highlight}`;
  }

  function applyAiFields(f: AiFields): Set<SectionKey> {
    const filled = new Set<SectionKey>();
    if (f.org_name) {
      const name = f.org_name.trim().toLowerCase();
      const match =
        partners.find((p) => p.name.toLowerCase() === name) ??
        partners.find((p) => p.name.toLowerCase().includes(name) || name.includes(p.name.toLowerCase()));
      if (match) {
        setIsOtherOrg(false);
        setPartnerId(match.id);
      } else {
        setIsOtherOrg(true);
        setPartnerId("");
        setNewOrgName(f.org_name.trim());
      }
      filled.add("org");
    }
    if (f.contact_name) {
      setContactName(f.contact_name);
      filled.add("org");
    }
    if (f.contact_email) {
      setContactEmail(f.contact_email);
      filled.add("org");
    }
    if (f.purpose) {
      setPurpose(f.purpose);
      filled.add("purpose");
    }
    if (f.purpose_detail) {
      setPurposeDetail(f.purpose_detail);
      filled.add("purpose");
    }
    if (f.use_type) {
      setUseType(f.use_type);
      filled.add("use");
    }
    if (f.people_served != null) {
      setPeopleServed(String(f.people_served));
      filled.add("use");
    }
    if (f.lines?.length) {
      setLines(
        f.lines.map((l) => {
          lineCounter.current += 1;
          return { id: `line-${lineCounter.current}`, category: l.device_category, quantity: l.quantity };
        })
      );
      filled.add("lines");
    }
    if (f.os_pref) {
      setOsPref(f.os_pref);
      filled.add("os");
    }
    if (f.os_firm != null) {
      setOsFirm(f.os_firm);
      filled.add("os");
    }
    if (f.needs?.length) {
      setNeeds(f.needs);
      filled.add("needs");
    }
    if (f.needed_by) {
      setNeededBy(f.needed_by);
      filled.add("when");
    }
    if (f.late_impact) {
      setLateImpact(f.late_impact);
      filled.add("when");
    }
    if (f.partner_urgency) {
      setPartnerUrgency(f.partner_urgency);
      filled.add("urgency");
    }
    if (f.urgency_reason && f.partner_urgency) {
      setUrgencyReason(f.urgency_reason);
      filled.add("urgency");
    }
    if (f.allow_partial != null) {
      setAllowPartial(f.allow_partial);
      filled.add("flex");
    }
    if (f.allow_substitutes != null) {
      setAllowSubstitutes(f.allow_substitutes);
      filled.add("flex");
    }
    if (f.setup) {
      setSetup(f.setup);
      filled.add("setup");
    }
    if (f.setup_notes) {
      setSetupNotes(f.setup_notes);
      filled.add("setup");
    }
    return filled;
  }

  async function handleAiFill() {
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await fetch("/api/ai/parse-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAiNote(data.message ?? AI_FALLBACK_NOTE);
        return;
      }
      const filled = applyAiFields(data.fields as AiFields);
      setAiFilled(filled);
      setAiNote(
        filled.size
          ? "We filled in the highlighted sections. Please check them and fill in anything missing."
          : "We couldn't find details to fill in. Please fill in the form below."
      );
    } catch {
      setAiNote(AI_FALLBACK_NOTE);
    } finally {
      setAiBusy(false);
    }
  }

  function toggleNeed(value: Need) {
    setNeeds((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function validate(): string | null {
    const orgName = isOtherOrg ? newOrgName.trim() : partnerId;
    if (!orgName) return "Tell us which organization you're with.";
    if (!contactName.trim()) return "Your name is required.";
    if (!contactEmail.trim() || !contactEmail.includes("@")) return "A valid email address is required.";
    if (!purpose) return "Tell us what people will use these devices for.";
    if (lines.every((line) => line.quantity <= 0)) {
      return "Add at least one device with a quantity of at least 1.";
    }
    if (!neededBy) return "Tell us when you need these devices.";
    if (!lateImpact.trim()) return "Tell us what happens if the devices arrive later than needed.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const selectedPartner = partners.find((p) => p.id === partnerId);
    const payload: SubmitRequestInput = {
      partner: isOtherOrg
        ? { kind: "new", orgName: newOrgName.trim() }
        : { kind: "existing", partnerId, orgName: selectedPartner?.name ?? "" },
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      purpose,
      purposeDetail,
      useType,
      peopleServed: peopleServed.trim() === "" ? null : Number(peopleServed),
      lines: lines.map((line) => ({ deviceCategory: line.category, quantity: line.quantity })),
      osPref,
      osFirm,
      needs,
      neededBy,
      lateImpact: lateImpact.trim(),
      partnerUrgency,
      urgencyReason,
      allowPartial,
      allowSubstitutes,
      setup,
      setupNotes,
      rawText: aiFilled.size ? aiText : undefined,
    };

    setSubmitting(true);
    setErrorMessage(null);
    const result = await submitRequest(payload);
    setSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    router.push(
      mode === "staff"
        ? `/staff/requests/${encodeURIComponent(result.code)}`
        : `/request/submitted?code=${encodeURIComponent(result.code)}`
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-3 rounded-lg border border-atb-apricot bg-atb-blush p-4">
        <div className={labelRow}>
          <h2 className="font-semibold">
            {mode === "staff" ? "Paste an email" : "Tell us what you need in your own words"}
          </h2>
          <span className="text-xs text-muted-foreground">Optional</span>
        </div>
        <textarea
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          placeholder={
            mode === "staff"
              ? "Paste the partner's email here and we'll fill in the form."
              : "For example: We run a job training program and need 8 laptops by Dec 1 for video interviews."
          }
          className="min-h-28 w-full rounded-md border bg-white px-2 py-1.5 text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={aiBusy || aiText.trim().length < 10}
            onClick={handleAiFill}
          >
            {aiBusy ? "Reading…" : "Fill the form for me"}
          </Button>
          {aiNote && <p className="text-sm text-zinc-700">{aiNote}</p>}
        </div>
      </section>

      <section className={sectionClass("org")}>
        <div className={labelRow}>
          <h2 className="font-semibold">Which organization are you with?</h2>
          <Tag tag="must" />
        </div>
        <select
          value={isOtherOrg ? "__other__" : partnerId}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "__other__") {
              setIsOtherOrg(true);
              setPartnerId("");
            } else {
              setIsOtherOrg(false);
              setPartnerId(value);
            }
          }}
          className={fieldClass}
        >
          <option value="" disabled>
            Select your organization&hellip;
          </option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__other__">My organization isn&apos;t listed</option>
        </select>
        {isOtherOrg && (
          <input
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder="Your organization's name"
            className={fieldClass}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Your name</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Your email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </section>

      <section className={sectionClass("purpose")}>
        <div className={labelRow}>
          <h2 className="font-semibold">What will people use these for?</h2>
          <Tag tag="must" />
        </div>
        <div className="flex flex-wrap gap-2">
          {PURPOSE_OPTIONS.map((opt) => (
            <Chip key={opt.value} selected={purpose === opt.value} onClick={() => setPurpose(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>
        <textarea
          value={purposeDetail}
          onChange={(e) => setPurposeDetail(e.target.value)}
          placeholder="Tell us a bit more (optional, especially helpful if you picked Other)"
          className="min-h-20 w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </section>

      <section className={sectionClass("use")}>
        <div className={labelRow}>
          <h2 className="font-semibold">Shared, or one per person? How many people will they serve?</h2>
          <Tag tag="nice" />
        </div>
        <div className="flex flex-wrap gap-2">
          {USE_TYPE_OPTIONS.map((opt) => (
            <Chip key={opt.value} selected={useType === opt.value} onClick={() => setUseType(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>
        <input
          type="number"
          min={0}
          value={peopleServed}
          onChange={(e) => setPeopleServed(e.target.value)}
          placeholder="Number of people served"
          className={`${fieldClass} sm:w-48`}
        />
      </section>

      <section className={sectionClass("lines")}>
        <div className={labelRow}>
          <h2 className="font-semibold">What kind of device, and how many?</h2>
          <Tag tag="must" />
        </div>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={line.category}
                onChange={(e) => updateLine(line.id, { category: e.target.value as RequestLineCategory })}
                className={`${fieldClass} sm:flex-1`}
              >
                {REQUEST_LINE_CATEGORIES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) =>
                  updateLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                }
                className={`${fieldClass} sm:w-24`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={lines.length <= 1}
                onClick={() => removeLine(line.id)}
                className="sm:w-auto"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          Add another device type
        </Button>
      </section>

      <section className={sectionClass("os")}>
        <div className={labelRow}>
          <h2 className="font-semibold">Windows, Mac, or doesn&apos;t matter?</h2>
          <Tag tag={osFirm ? "must" : "nice"} />
        </div>
        <div className="flex flex-wrap gap-2">
          {OS_PREF_OPTIONS.map((opt) => (
            <Chip key={opt.value} selected={osPref === opt.value} onClick={() => setOsPref(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={osFirm} onChange={(e) => setOsFirm(e.target.checked)} />
          This is a hard requirement, not just a preference
        </label>

        {availability && (
          <ul className="text-xs text-muted-foreground">
            {lines.map((line, i) =>
              availability[i] === undefined ? null : (
                <li key={line.id}>
                  {labelForCategory(line.category)}: about {availability[i]} matching device
                  {availability[i] === 1 ? " is" : "s are"} ready now or in final checks.
                </li>
              )
            )}
          </ul>
        )}
        {osPref === "any" && (
          <p className="text-xs font-medium text-zinc-700">Flexible requests usually arrive sooner.</p>
        )}
      </section>

      <section className={sectionClass("needs")}>
        <div className={labelRow}>
          <h2 className="font-semibold">Anything specific the devices need?</h2>
          <Tag tag="nice" />
        </div>
        <div className="flex flex-wrap gap-2">
          {NEEDS_OPTIONS.map((opt) => (
            <Chip key={opt.value} selected={needs.includes(opt.value)} onClick={() => toggleNeed(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className={sectionClass("when")}>
        <div className={labelRow}>
          <h2 className="font-semibold">When do you need them? What happens if they arrive later?</h2>
          <Tag tag="must" />
        </div>
        <input
          type="date"
          value={neededBy}
          onChange={(e) => setNeededBy(e.target.value)}
          className={`${fieldClass} sm:w-56`}
        />
        <textarea
          value={lateImpact}
          onChange={(e) => setLateImpact(e.target.value)}
          placeholder="What happens if these arrive later than that?"
          className="min-h-20 w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </section>

      <section className={sectionClass("urgency")}>
        <div className={labelRow}>
          <h2 className="font-semibold">How urgent is this for you?</h2>
          <Tag tag="nice" />
        </div>
        <div className="flex flex-wrap gap-2">
          {URGENCY_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              selected={partnerUrgency === opt.value}
              onClick={() => setPartnerUrgency(opt.value)}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
        {partnerUrgency && (
          <textarea
            value={urgencyReason}
            onChange={(e) => setUrgencyReason(e.target.value)}
            placeholder="Why is this urgent?"
            className="min-h-16 w-full rounded-md border px-2 py-1.5 text-sm"
          />
        )}
      </section>

      <section className={sectionClass("flex", "space-y-4")}>
        <div>
          <div className={labelRow}>
            <h2 className="font-semibold">Send what&apos;s ready now, or all together?</h2>
            <Tag tag="nice" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip selected={allowPartial} onClick={() => setAllowPartial(true)}>
              Send what&apos;s ready
            </Chip>
            <Chip selected={!allowPartial} onClick={() => setAllowPartial(false)}>
              Wait and send all together
            </Chip>
          </div>
        </div>
        <div>
          <div className={labelRow}>
            <h2 className="font-semibold">OK if we substitute a similar device?</h2>
            <Tag tag="nice" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip selected={allowSubstitutes} onClick={() => setAllowSubstitutes(true)}>
              Yes
            </Chip>
            <Chip selected={!allowSubstitutes} onClick={() => setAllowSubstitutes(false)}>
              No
            </Chip>
          </div>
        </div>
      </section>

      <section className={sectionClass("setup")}>
        <div className={labelRow}>
          <h2 className="font-semibold">Setup</h2>
          <Tag tag="nice" />
        </div>
        <div className="flex flex-wrap gap-2">
          {SETUP_OPTIONS.map((opt) => (
            <Chip key={opt.value} selected={setup === opt.value} onClick={() => setSetup(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>
        {setup === "preset" && (
          <textarea
            value={setupNotes}
            onChange={(e) => setSetupNotes(e.target.value)}
            placeholder="Describe the setup you need"
            className="min-h-16 w-full rounded-md border px-2 py-1.5 text-sm"
          />
        )}
      </section>

      {errorMessage && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Submitting…" : mode === "staff" ? "Create request" : "Submit request"}
      </Button>
    </form>
  );
}
