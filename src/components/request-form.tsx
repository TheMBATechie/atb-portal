"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getAvailabilityHint, submitRequest, type SubmitRequestInput } from "@/app/request/actions";
import {
  NEEDS_OPTIONS,
  PURPOSE_OPTIONS,
  REQUEST_LINE_CATEGORIES,
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
type Timing = "date" | "none" | null;

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

type FieldKey =
  | "org"
  | "contactName"
  | "contactEmail"
  | "purpose"
  | "purposeDetail"
  | "peopleServed"
  | "lines"
  | "os"
  | "needsOther"
  | "timing"
  | "neededBy"
  | "lateImpact"
  | "setupNotes";

const AI_FALLBACK_NOTE = "Automatic fill isn't available right now. Please fill in the form below.";

const URGENCY_CHOICES: { value: Urgency; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "Whenever devices are available" },
  { value: "medium", label: "Medium", hint: "Within the next month or two" },
  { value: "high", label: "High", hint: "People are waiting on these now" },
];

const OS_CHOICES: { value: OsPref; label: string }[] = [
  { value: "any", label: "Either is fine" },
  { value: "windows", label: "Windows" },
  { value: "mac", label: "Mac" },
];

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-atb-coral focus:ring-2 focus:ring-atb-coral/30";
const textareaClass =
  "min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:border-atb-coral focus:ring-2 focus:ring-atb-coral/30";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function labelForCategory(category: RequestLineCategory): string {
  return REQUEST_LINE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
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
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors " +
        (selected
          ? "border-atb-navy bg-atb-navy text-white"
          : "border-zinc-300 bg-white text-atb-navy hover:border-atb-navy/60")
      }
    >
      {children}
    </button>
  );
}

function Label({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-atb-navy">
      {children}
      {required ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-atb-navy">
          <span className="size-1.5 rounded-full bg-atb-coral" aria-hidden="true" />
          Required
        </span>
      ) : (
        <span className="text-xs font-normal text-zinc-500">Optional</span>
      )}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

function Step({
  number,
  title,
  description,
  highlighted,
  children,
}: {
  number: number;
  title: string;
  description?: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`space-y-5 rounded-xl border bg-white p-5 sm:p-6 ${
        highlighted ? "border-atb-coral ring-2 ring-atb-apricot" : "border-zinc-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-atb-coral font-heading text-sm font-extrabold text-white">
          {number}
        </span>
        <div>
          <h2 className="text-lg text-atb-navy">{title}</h2>
          {description && <p className="text-sm text-zinc-600">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function RequestForm({ partners, mode = "partner" }: { partners: Partner[]; mode?: "partner" | "staff" }) {
  const router = useRouter();
  const lineCounter = useRef(1);
  const today = todayIso();

  // AI fill
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiSteps, setAiSteps] = useState<Set<number>>(new Set());

  // 1. About you
  const [partnerId, setPartnerId] = useState("");
  const [isOtherOrg, setIsOtherOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // 2. What they're for
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [purposeDetail, setPurposeDetail] = useState("");
  const [useType, setUseType] = useState<UseType | null>(null);
  const [peopleServed, setPeopleServed] = useState("");

  // 3. Devices
  const [lines, setLines] = useState<Line[]>([{ id: "line-1", category: defaultLineCategory(null), quantity: 1 }]);
  const [osPref, setOsPref] = useState<OsPref>("any");
  const [osFirm, setOsFirm] = useState(false);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [needsOther, setNeedsOther] = useState("");
  const [availability, setAvailability] = useState<number[] | null>(null);

  // 4. Timing
  const [timing, setTiming] = useState<Timing>(null);
  const [neededBy, setNeededBy] = useState("");
  const [urgency, setUrgency] = useState<Urgency | null>(null);
  const [lateImpact, setLateImpact] = useState("");

  // 5. Delivery
  const [allowPartial, setAllowPartial] = useState(true);
  const [allowSubstitutes, setAllowSubstitutes] = useState(false);
  const [setup, setSetup] = useState<Setup>("out_of_box");
  const [setupNotes, setSetupNotes] = useState("");

  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totalDevices = lines.reduce((n, l) => n + (l.quantity > 0 ? l.quantity : 0), 0);
  const usedCategories = new Set(lines.map((l) => l.category));
  const canAddLine = lines.length < REQUEST_LINE_CATEGORIES.length;
  const urgent = urgency === "medium" || urgency === "high";

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

  function clearError(key: FieldKey) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // ---- lines ----
  function addLine() {
    const unused = REQUEST_LINE_CATEGORIES.find((c) => !usedCategories.has(c.value));
    if (!unused) return;
    lineCounter.current += 1;
    setLines((prev) => [...prev, { id: `line-${lineCounter.current}`, category: unused.value, quantity: 1 }]);
  }
  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.id !== id)));
  }
  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    clearError("lines");
  }

  // ---- choices that hide follow-up questions also clear their answers ----
  function choosePurpose(value: Purpose) {
    setPurpose(value);
    clearError("purpose");
    clearError("purposeDetail");
    // Smart default: shared labs usually want desktops, outreach usually tablets.
    if (lines.length === 1 && lines[0].quantity <= 1 && (value === "shared_lab" || value === "outreach")) {
      setLines([{ ...lines[0], category: defaultLineCategory(value) }]);
    }
  }
  function chooseOs(value: OsPref) {
    setOsPref(value);
    if (value === "any") setOsFirm(false);
  }
  function toggleNeed(value: Need) {
    const next = needs.includes(value) ? needs.filter((v) => v !== value) : [...needs, value];
    setNeeds(next);
    if (!next.includes("other")) {
      setNeedsOther("");
      clearError("needsOther");
    }
  }
  function chooseTiming(value: Timing) {
    setTiming(value);
    if (value === "none") setNeededBy("");
    clearError("timing");
    clearError("neededBy");
  }
  function chooseUrgency(value: Urgency) {
    const next = urgency === value ? null : value;
    setUrgency(next);
    if (next !== "medium" && next !== "high") setLateImpact("");
    clearError("lateImpact");
  }
  function chooseSetup(value: Setup) {
    setSetup(value);
    if (value === "out_of_box") setSetupNotes("");
    clearError("setupNotes");
  }

  // ---- AI fill ----
  function applyAiFields(f: AiFields): Set<number> {
    const steps = new Set<number>();
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
      steps.add(1);
    }
    if (f.contact_name) {
      setContactName(f.contact_name);
      steps.add(1);
    }
    if (f.contact_email) {
      setContactEmail(f.contact_email);
      steps.add(1);
    }
    if (f.purpose) {
      setPurpose(f.purpose);
      steps.add(2);
    }
    if (f.purpose_detail) {
      setPurposeDetail(f.purpose_detail);
      steps.add(2);
    }
    if (f.use_type) {
      setUseType(f.use_type);
      steps.add(2);
    }
    if (f.people_served && f.people_served > 0) {
      setPeopleServed(String(f.people_served));
      steps.add(2);
    }
    if (f.lines?.length) {
      const merged = new Map<RequestLineCategory, number>();
      for (const l of f.lines) merged.set(l.device_category, (merged.get(l.device_category) ?? 0) + l.quantity);
      setLines(
        [...merged.entries()].map(([category, quantity]) => {
          lineCounter.current += 1;
          return { id: `line-${lineCounter.current}`, category, quantity };
        })
      );
      steps.add(3);
    }
    if (f.os_pref) {
      setOsPref(f.os_pref);
      setOsFirm(f.os_pref !== "any" && !!f.os_firm);
      steps.add(3);
    }
    if (f.needs?.length) {
      setNeeds(f.needs);
      steps.add(3);
    }
    if (f.needed_by && f.needed_by >= today) {
      setTiming("date");
      setNeededBy(f.needed_by);
      steps.add(4);
    }
    if (f.partner_urgency) {
      setUrgency(f.partner_urgency);
      const reason = f.late_impact || f.urgency_reason;
      if ((f.partner_urgency === "medium" || f.partner_urgency === "high") && reason) setLateImpact(reason);
      steps.add(4);
    }
    if (f.allow_partial != null) {
      setAllowPartial(f.allow_partial);
      steps.add(5);
    }
    if (f.allow_substitutes != null) {
      setAllowSubstitutes(f.allow_substitutes);
      steps.add(5);
    }
    if (f.setup) {
      setSetup(f.setup);
      if (f.setup === "preset" && f.setup_notes) setSetupNotes(f.setup_notes);
      steps.add(5);
    }
    return steps;
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
      const steps = applyAiFields(data.fields as AiFields);
      setAiSteps(steps);
      setErrors({});
      setAiNote(
        steps.size
          ? "We filled in the highlighted steps. Please check every answer and fill in anything missing."
          : "We couldn't find details to fill in. Please fill in the form below."
      );
    } catch {
      setAiNote(AI_FALLBACK_NOTE);
    } finally {
      setAiBusy(false);
    }
  }

  // ---- validation ----
  function validate(): Partial<Record<FieldKey, string>> {
    const e: Partial<Record<FieldKey, string>> = {};
    if (isOtherOrg ? !newOrgName.trim() : !partnerId) e.org = "Choose your organization, or type its name.";
    if (!contactName.trim()) e.contactName = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) e.contactEmail = "Enter a valid email address.";
    if (!purpose) e.purpose = "Choose what the devices will be used for.";
    if (purpose === "other" && !purposeDetail.trim()) e.purposeDetail = "Tell us what the devices are for.";
    if (peopleServed.trim() && !(Number.isInteger(Number(peopleServed)) && Number(peopleServed) >= 1)) {
      e.peopleServed = "Enter a whole number of 1 or more, or leave it blank.";
    }
    if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 500)) {
      e.lines = "Each device type needs a quantity between 1 and 500.";
    }
    if (needs.includes("other") && !needsOther.trim()) e.needsOther = "Describe what else the devices need.";
    if (!timing) e.timing = "Tell us whether you need them by a certain date.";
    if (timing === "date" && !neededBy) e.neededBy = "Pick the date you need them by.";
    if (timing === "date" && neededBy && neededBy < today) e.neededBy = "The date can't be in the past.";
    if (urgency === "high" && !lateImpact.trim()) e.lateImpact = "For high urgency, tell us what happens if they arrive late.";
    if (setup === "preset" && !setupNotes.trim()) e.setupNotes = "Describe the setup you need.";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const found = validate();
    setErrors(found);
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      osFirm: osPref !== "any" && osFirm,
      needs,
      needsOther,
      neededBy: timing === "date" ? neededBy : null,
      lateImpact: urgent ? lateImpact : "",
      partnerUrgency: urgency,
      allowPartial: totalDevices > 1 ? allowPartial : true,
      allowSubstitutes,
      setup,
      setupNotes: setup === "preset" ? setupNotes : "",
      rawText: aiSteps.size ? aiText : undefined,
    };

    setSubmitting(true);
    const result = await submitRequest(payload);
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    router.push(
      mode === "staff"
        ? `/staff/requests/${encodeURIComponent(result.code)}`
        : `/request/submitted?code=${encodeURIComponent(result.code)}`
    );
  }

  const osName = osPref === "mac" ? "Mac" : "Windows";
  const errorCount = Object.keys(errors).length;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Optional AI helper */}
      <section className="space-y-3 rounded-xl border border-atb-apricot bg-atb-blush p-5 sm:p-6">
        <div>
          <h2 className="text-lg text-atb-navy">
            {mode === "staff" ? "Paste an email" : "Short on time? Tell us in your own words"}
          </h2>
          <p className="text-sm text-zinc-600">
            {mode === "staff"
              ? "Paste the partner's email and we'll fill in the form for you to check."
              : "Describe what you need and we'll fill in the form for you to check. Or skip this and fill it in below."}
          </p>
        </div>
        <textarea
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          placeholder={
            mode === "staff"
              ? "Paste the partner's email here."
              : "For example: We run a job training program for about 40 adults and need 8 laptops with webcams by Dec 1 for video interviews."
          }
          className={`${textareaClass} min-h-28`}
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
          {aiNote && <p className="text-sm text-atb-navy">{aiNote}</p>}
        </div>
      </section>

      {/* 1. About you */}
      <Step number={1} title="About you" highlighted={aiSteps.has(1)}>
        <div id="field-org" className="space-y-2">
          <Label htmlFor="org" required>
            Organization
          </Label>
          <select
            id="org"
            value={isOtherOrg ? "__other__" : partnerId}
            onChange={(e) => {
              const value = e.target.value;
              setIsOtherOrg(value === "__other__");
              setPartnerId(value === "__other__" ? "" : value);
              clearError("org");
            }}
            className={fieldClass}
          >
            <option value="" disabled>
              Select your organization…
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
              onChange={(e) => {
                setNewOrgName(e.target.value);
                clearError("org");
              }}
              placeholder="Your organization's name"
              className={fieldClass}
              aria-label="Organization name"
            />
          )}
          <FieldError message={errors.org} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div id="field-contactName" className="space-y-2">
            <Label htmlFor="contactName" required>
              Your name
            </Label>
            <input
              id="contactName"
              value={contactName}
              autoComplete="name"
              onChange={(e) => {
                setContactName(e.target.value);
                clearError("contactName");
              }}
              className={fieldClass}
            />
            <FieldError message={errors.contactName} />
          </div>
          <div id="field-contactEmail" className="space-y-2">
            <Label htmlFor="contactEmail" required>
              Your email
            </Label>
            <input
              id="contactEmail"
              type="email"
              autoComplete="email"
              value={contactEmail}
              onChange={(e) => {
                setContactEmail(e.target.value);
                clearError("contactEmail");
              }}
              className={fieldClass}
            />
            <p className="text-xs text-zinc-500">You&apos;ll use this with your request code to check progress.</p>
            <FieldError message={errors.contactEmail} />
          </div>
        </div>
      </Step>

      {/* 2. What they're for */}
      <Step number={2} title="What the devices are for" highlighted={aiSteps.has(2)}>
        <div id="field-purpose" className="space-y-2">
          <Label required>What will people use them for?</Label>
          <div className="flex flex-wrap gap-2">
            {PURPOSE_OPTIONS.map((opt) => (
              <Chip key={opt.value} selected={purpose === opt.value} onClick={() => choosePurpose(opt.value)}>
                {opt.label}
              </Chip>
            ))}
          </div>
          <FieldError message={errors.purpose} />
        </div>

        {purpose && (
          <div id="field-purposeDetail" className="space-y-2">
            <Label htmlFor="purposeDetail" required={purpose === "other"}>
              {purpose === "other" ? "Tell us what they're for" : "Anything else about your program?"}
            </Label>
            <textarea
              id="purposeDetail"
              value={purposeDetail}
              onChange={(e) => {
                setPurposeDetail(e.target.value);
                clearError("purposeDetail");
              }}
              placeholder="A sentence or two is plenty."
              className={textareaClass}
            />
            <FieldError message={errors.purposeDetail} />
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Shared, or one per person?</Label>
            <div className="flex flex-wrap gap-2">
              <Chip selected={useType === "shared"} onClick={() => setUseType(useType === "shared" ? null : "shared")}>
                Shared
              </Chip>
              <Chip
                selected={useType === "individual"}
                onClick={() => setUseType(useType === "individual" ? null : "individual")}
              >
                One per person
              </Chip>
            </div>
          </div>
          <div id="field-peopleServed" className="space-y-2">
            <Label htmlFor="peopleServed">How many people will they serve?</Label>
            <input
              id="peopleServed"
              type="number"
              inputMode="numeric"
              min={1}
              value={peopleServed}
              onChange={(e) => {
                setPeopleServed(e.target.value);
                clearError("peopleServed");
              }}
              className={`${fieldClass} sm:w-40`}
            />
            <FieldError message={errors.peopleServed} />
          </div>
        </div>
      </Step>

      {/* 3. Devices */}
      <Step number={3} title="Devices" highlighted={aiSteps.has(3)}>
        <div id="field-lines" className="space-y-2">
          <Label required>What kind of device, and how many?</Label>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.id} className="flex flex-wrap items-center gap-2">
                <select
                  value={line.category}
                  onChange={(e) => updateLine(line.id, { category: e.target.value as RequestLineCategory })}
                  className={`${fieldClass} min-w-0 flex-1`}
                  aria-label="Device type"
                >
                  {REQUEST_LINE_CATEGORIES.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.value !== line.category && usedCategories.has(opt.value)}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  value={line.quantity || ""}
                  onChange={(e) => updateLine(line.id, { quantity: Math.floor(Number(e.target.value)) || 0 })}
                  className={`${fieldClass} w-24`}
                  aria-label="Quantity"
                />
                {lines.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.id)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
          {canAddLine && (
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              Add another device type
            </Button>
          )}
          <FieldError message={errors.lines} />
        </div>

        <div id="field-os" className="space-y-2">
          <Label required>Windows, Mac, or either?</Label>
          <div className="flex flex-wrap gap-2">
            {OS_CHOICES.map((opt) => (
              <Chip key={opt.value} selected={osPref === opt.value} onClick={() => chooseOs(opt.value)}>
                {opt.label}
              </Chip>
            ))}
          </div>
          {osPref !== "any" && (
            <div className="space-y-2 rounded-md bg-zinc-50 p-3">
              <p className="text-sm text-atb-navy">How important is {osName}?</p>
              <div className="flex flex-wrap gap-2">
                <Chip selected={!osFirm} onClick={() => setOsFirm(false)}>
                  {osName} preferred, others are OK
                </Chip>
                <Chip selected={osFirm} onClick={() => setOsFirm(true)}>
                  Must be {osName}
                </Chip>
              </div>
            </div>
          )}
          {availability && (
            <ul className="space-y-0.5 text-sm text-atb-green">
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
          {osPref === "any" ? (
            <p className="text-xs text-zinc-500">Flexible requests usually arrive sooner.</p>
          ) : (
            !osFirm && <p className="text-xs text-zinc-500">Being flexible usually means devices arrive sooner.</p>
          )}
        </div>

        <div id="field-needsOther" className="space-y-2">
          <Label>Anything the devices need to have?</Label>
          <div className="flex flex-wrap gap-2">
            {NEEDS_OPTIONS.map((opt) => (
              <Chip key={opt.value} selected={needs.includes(opt.value)} onClick={() => toggleNeed(opt.value)}>
                {opt.label}
              </Chip>
            ))}
          </div>
          {needs.includes("other") && (
            <>
              <Label htmlFor="needsOther" required>
                What else do they need?
              </Label>
              <input
                id="needsOther"
                value={needsOther}
                onChange={(e) => {
                  setNeedsOther(e.target.value);
                  clearError("needsOther");
                }}
                placeholder="For example: a DVD drive, a long battery life"
                className={fieldClass}
              />
            </>
          )}
          <FieldError message={errors.needsOther} />
        </div>
      </Step>

      {/* 4. Timing */}
      <Step number={4} title="Timing" highlighted={aiSteps.has(4)}>
        <div id="field-timing" className="space-y-2">
          <Label required>Do you need them by a certain date?</Label>
          <div className="flex flex-wrap gap-2">
            <Chip selected={timing === "date"} onClick={() => chooseTiming("date")}>
              Yes, by a specific date
            </Chip>
            <Chip selected={timing === "none"} onClick={() => chooseTiming("none")}>
              No fixed date
            </Chip>
          </div>
          <FieldError message={errors.timing} />
        </div>

        {timing === "date" && (
          <div id="field-neededBy" className="space-y-2">
            <Label htmlFor="neededBy" required>
              Need-by date
            </Label>
            <input
              id="neededBy"
              type="date"
              min={today}
              value={neededBy}
              onChange={(e) => {
                setNeededBy(e.target.value);
                clearError("neededBy");
              }}
              className={`${fieldClass} sm:w-56`}
            />
            <FieldError message={errors.neededBy} />
          </div>
        )}

        <div className="space-y-2">
          <Label>How urgent is this for you?</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {URGENCY_CHOICES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={urgency === opt.value}
                onClick={() => chooseUrgency(opt.value)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  urgency === opt.value
                    ? "border-atb-navy bg-atb-navy text-white"
                    : "border-zinc-300 bg-white text-atb-navy hover:border-atb-navy/60"
                }`}
              >
                <span className="block text-sm font-semibold">{opt.label}</span>
                <span className={`block text-xs ${urgency === opt.value ? "text-white/80" : "text-zinc-500"}`}>
                  {opt.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        {urgent && (
          <div id="field-lateImpact" className="space-y-2">
            <Label htmlFor="lateImpact" required={urgency === "high"}>
              {timing === "date" && neededBy
                ? "What happens if they arrive after that date?"
                : "What happens if they arrive late?"}
            </Label>
            <textarea
              id="lateImpact"
              value={lateImpact}
              onChange={(e) => {
                setLateImpact(e.target.value);
                clearError("lateImpact");
              }}
              placeholder="For example: our next class starts Dec 1 and students can't apply for jobs without a laptop."
              className={textareaClass}
            />
            <p className="text-xs text-zinc-500">This helps staff decide which requests to fill first.</p>
            <FieldError message={errors.lateImpact} />
          </div>
        )}
      </Step>

      {/* 5. Delivery */}
      <Step number={5} title="Delivery preferences" description="All optional. The defaults work for most partners." highlighted={aiSteps.has(5)}>
        {totalDevices > 1 && (
          <div className="space-y-2">
            <Label>If only some are ready, should we send those first?</Label>
            <div className="flex flex-wrap gap-2">
              <Chip selected={allowPartial} onClick={() => setAllowPartial(true)}>
                Yes, send what&apos;s ready
              </Chip>
              <Chip selected={!allowPartial} onClick={() => setAllowPartial(false)}>
                No, send them all together
              </Chip>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Is a similar device OK if we don&apos;t have an exact match?</Label>
          <p className="text-xs text-zinc-500">
            For example, a desktop instead of a laptop, or an older model in good working order.
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={allowSubstitutes} onClick={() => setAllowSubstitutes(true)}>
              Yes, similar is fine
            </Chip>
            <Chip selected={!allowSubstitutes} onClick={() => setAllowSubstitutes(false)}>
              No, only what I asked for
            </Chip>
          </div>
        </div>

        <div id="field-setupNotes" className="space-y-2">
          <Label>Setup</Label>
          <div className="flex flex-wrap gap-2">
            <Chip selected={setup === "out_of_box"} onClick={() => chooseSetup("out_of_box")}>
              Out of the box is fine
            </Chip>
            <Chip selected={setup === "preset"} onClick={() => chooseSetup("preset")}>
              We need a specific setup
            </Chip>
          </div>
          {setup === "preset" && (
            <>
              <Label htmlFor="setupNotes" required>
                Describe the setup
              </Label>
              <textarea
                id="setupNotes"
                value={setupNotes}
                onChange={(e) => {
                  setSetupNotes(e.target.value);
                  clearError("setupNotes");
                }}
                placeholder="For example: Zoom and Google Chrome installed, a shared login for the lab."
                className={textareaClass}
              />
            </>
          )}
          <FieldError message={errors.setupNotes} />
        </div>
      </Step>

      {(errorCount > 0 || submitError) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          {submitError ??
            `Please fix ${errorCount === 1 ? "the highlighted answer" : `the ${errorCount} highlighted answers`} above.`}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Submitting…" : mode === "staff" ? "Create request" : "Submit request"}
        </Button>
        <p className="text-sm text-zinc-500">
          {totalDevices > 0 && `${totalDevices} device${totalDevices === 1 ? "" : "s"} requested. `}
          You can check progress any time with your request code.
        </p>
      </div>
    </form>
  );
}
