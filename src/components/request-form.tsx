"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitRequest, type SubmitRequestInput } from "@/app/request/actions";
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

export function RequestForm({ partners }: { partners: Partner[] }) {
  const router = useRouter();
  const lineCounter = useRef(1);

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
    };

    setSubmitting(true);
    setErrorMessage(null);
    const result = await submitRequest(payload);
    setSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    router.push(`/request/submitted?code=${encodeURIComponent(result.code)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-3 rounded-lg border bg-white p-4">
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

      <section className="space-y-3 rounded-lg border bg-white p-4">
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

      <section className="space-y-3 rounded-lg border bg-white p-4">
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

      <section className="space-y-3 rounded-lg border bg-white p-4">
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

      <section className="space-y-3 rounded-lg border bg-white p-4">
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

        <p className="text-xs text-muted-foreground">
          We&apos;ll show how many matching devices are available here once this feature is ready.
        </p>
        {osPref === "any" && (
          <p className="text-xs font-medium text-zinc-700">Flexible requests usually arrive sooner.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-4">
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

      <section className="space-y-3 rounded-lg border bg-white p-4">
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

      <section className="space-y-3 rounded-lg border bg-white p-4">
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

      <section className="space-y-4 rounded-lg border bg-white p-4">
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

      <section className="space-y-3 rounded-lg border bg-white p-4">
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
        {submitting ? "Submitting…" : "Submit request"}
      </Button>
    </form>
  );
}
