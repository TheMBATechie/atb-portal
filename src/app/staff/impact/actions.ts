"use server";

import { getCurrentProfile } from "@/lib/auth";
import { loadDonorImpact, type DonorImpact } from "@/lib/donor-impact";
import { generateWithGemini } from "@/lib/gemini";

export type DraftResult = { ok: true; draft: string; usedAi: boolean } | { ok: false; message: string };

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const month = (d: string | null) => (d ? MONTH.format(new Date(`${d}T00:00:00Z`)) : null);

function list(items: { name: string; count: number }[], max = 5): string {
  return items
    .slice(0, max)
    .map((i) => `${i.name} (${i.count})`)
    .join(", ");
}

// Only aggregate facts. No recipient names ever leave the server.
function factSheet(f: DonorImpact): string {
  return [
    `Donor: ${f.donor}`,
    `Devices donated: ${f.received} (${list(f.byType)})`,
    `Devices placed with nonprofits so far: ${f.placed}`,
    `Still being refurbished: ${f.inPipeline.reduce((n, p) => n + p.count, 0)}`,
    `Recycled responsibly (not reusable): ${f.recycled}`,
    `Nonprofit partners that received them: ${list(f.byPartner, 8) || "none yet"}`,
    `Areas served: ${list(f.byCategory) || "not recorded"}`,
    f.firstPlaced ? `Placed between ${month(f.firstPlaced)} and ${month(f.lastPlaced)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function templateDraft(f: DonorImpact): string {
  const partners = f.byPartner.slice(0, 5).map((p) => p.name);
  const areas = f.byCategory.slice(0, 3).map((c) => c.name.toLowerCase());
  return [
    `Dear friends at ${f.donor},`,
    "",
    `Thank you for donating ${f.received} devices to Atlanta Tech Bank. So far, ${f.placed} of them have been refurbished and placed with local nonprofits${
      partners.length ? `, including ${partners.join(", ")}` : ""
    }.`,
    areas.length ? `Your devices are now supporting work in ${areas.join(", ")}.` : "",
    f.inPipeline.length
      ? `Another ${f.inPipeline.reduce((n, p) => n + p.count, 0)} are being prepared in our warehouse and will reach a partner soon.`
      : "",
    "",
    "Every device helps someone apply for a job, finish a class, or stay connected. We're grateful for your support.",
    "",
    "With thanks,",
    "Atlanta Tech Bank",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}

export async function draftThankYou(donor: string): Promise<DraftResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "staff") return { ok: false, message: "You need to be signed in as staff." };

  const facts = await loadDonorImpact(donor);
  if (!facts) return { ok: false, message: "No devices found for that donor." };

  const prompt = `Write a short thank-you letter from Atlanta Tech Bank to a device donor.
Use only these facts. Do not invent numbers, people or stories. Do not mention individual recipients.
Warm, plain language, under 180 words. Start with "Dear friends at ${facts.donor}," and sign off "Atlanta Tech Bank".
Plain text only, no markdown.

Facts:
${factSheet(facts)}`;

  const ai = await generateWithGemini({ prompt, temperature: 0.4 });
  if (ai.ok && ai.text.trim()) return { ok: true, draft: ai.text.trim(), usedAi: true };
  return { ok: true, draft: templateDraft(facts), usedAi: false };
}
