import { z } from "zod";
import {
  NEEDS_OPTIONS,
  OS_PREF_OPTIONS,
  PURPOSE_OPTIONS,
  REQUEST_LINE_CATEGORIES,
  SETUP_OPTIONS,
  URGENCY_OPTIONS,
  USE_TYPE_OPTIONS,
} from "@/lib/requests";

// Server only. Turns free text / a pasted email into request form fields
// with Gemini, then checks the answer with zod before anything uses it.

const values = <T extends readonly { value: string }[]>(opts: T) =>
  opts.map((o) => o.value) as unknown as [T[number]["value"], ...T[number]["value"][]];

const PURPOSES = values(PURPOSE_OPTIONS);
const USE_TYPES = values(USE_TYPE_OPTIONS);
const CATEGORIES = values(REQUEST_LINE_CATEGORIES);
const OS_PREFS = values(OS_PREF_OPTIONS);
const NEEDS = values(NEEDS_OPTIONS);
const URGENCIES = values(URGENCY_OPTIONS);
const SETUPS = values(SETUP_OPTIONS);

// Every field is optional: the model leaves out what the text doesn't say.
export const ParsedRequestSchema = z.object({
  org_name: z.string().max(200).nullish(),
  contact_name: z.string().max(200).nullish(),
  contact_email: z.string().max(200).nullish(),
  purpose: z.enum(PURPOSES).nullish(),
  purpose_detail: z.string().max(1000).nullish(),
  use_type: z.enum(USE_TYPES).nullish(),
  people_served: z.number().int().min(0).max(100000).nullish(),
  lines: z
    .array(z.object({ device_category: z.enum(CATEGORIES), quantity: z.number().int().min(1).max(500) }))
    .max(10)
    .nullish(),
  os_pref: z.enum(OS_PREFS).nullish(),
  os_firm: z.boolean().nullish(),
  needs: z.array(z.enum(NEEDS)).max(4).nullish(),
  needed_by: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  late_impact: z.string().max(1000).nullish(),
  partner_urgency: z.enum(URGENCIES).nullish(),
  urgency_reason: z.string().max(1000).nullish(),
  allow_partial: z.boolean().nullish(),
  allow_substitutes: z.boolean().nullish(),
  setup: z.enum(SETUPS).nullish(),
  setup_notes: z.string().max(1000).nullish(),
});
export type ParsedRequest = z.infer<typeof ParsedRequestSchema>;

const str = { type: "STRING", nullable: true };
const enumOf = (vals: readonly string[]) => ({ type: "STRING", enum: [...vals], nullable: true });
const bool = { type: "BOOLEAN", nullable: true };

// Gemini's structured-output schema (OpenAPI subset), mirrors the zod schema above.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    org_name: str,
    contact_name: str,
    contact_email: str,
    purpose: enumOf(PURPOSES),
    purpose_detail: str,
    use_type: enumOf(USE_TYPES),
    people_served: { type: "INTEGER", nullable: true },
    lines: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: { device_category: enumOf(CATEGORIES), quantity: { type: "INTEGER" } },
        required: ["device_category", "quantity"],
      },
    },
    os_pref: enumOf(OS_PREFS),
    os_firm: bool,
    needs: { type: "ARRAY", nullable: true, items: { type: "STRING", enum: [...NEEDS] } },
    needed_by: { type: "STRING", nullable: true, description: "YYYY-MM-DD" },
    late_impact: str,
    partner_urgency: enumOf(URGENCIES),
    urgency_reason: str,
    allow_partial: bool,
    allow_substitutes: bool,
    setup: enumOf(SETUPS),
    setup_notes: str,
  },
};

function prompt(text: string, today: string): string {
  return `You read device requests sent to Atlanta Tech Bank, which gives refurbished laptops, desktops and tablets to nonprofits.
Extract the request into the JSON schema. Today is ${today}.
Rules:
- Only fill a field if the text clearly says it. Otherwise use null. Never invent names, emails or numbers.
- purpose: job_search, classes, case_management, outreach, staff_work, shared_lab, or other.
- lines: one entry per device type with its quantity. Use "recommend" only if they don't say a device type.
- os_pref: "windows", "mac", or "any" (any if they say it doesn't matter). os_firm true only if they say it must be that OS.
- needed_by: turn relative dates ("in two weeks", "by Dec 1") into YYYY-MM-DD.
- late_impact: what happens if devices arrive late, in their words.
- partner_urgency: high, medium or low only if they express urgency.
- allow_partial: true if they'd take some devices now. allow_substitutes: true if they're flexible on model or condition.
- Keep text fields short and in plain language.

Text:
"""
${text}
"""`;
}

export type ParseResult = { ok: true; fields: ParsedRequest } | { ok: false; message: string };

export const AI_UNAVAILABLE = "Automatic fill isn't available right now. Please fill in the form below.";

// Tried in order when GEMINI_MODEL is busy (503/429), missing, or slow.
// Free-tier models get overloaded at peak times; this keeps the demo working.
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

type Attempt = { ok: true; raw: string } | { ok: false; retryable: boolean };

async function callGemini(model: string, apiKey: string, text: string, today: string): Promise<Attempt> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt(text, today) }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) {
      console.error("Gemini call failed", model, res.status, (await res.text()).slice(0, 300));
      return { ok: false, retryable: res.status === 503 || res.status === 429 || res.status === 500 || res.status === 404 };
    }
    const body = await res.json();
    const raw: string | undefined = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    return raw ? { ok: true, raw } : { ok: false, retryable: true };
  } catch (error) {
    console.error("Gemini call error", model, error);
    return { ok: false, retryable: true };
  }
}

export async function parseRequestText(text: string): Promise<ParseResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return { ok: false, message: AI_UNAVAILABLE };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  let attempt: Attempt = { ok: false, retryable: true };
  for (const m of [model, ...FALLBACK_MODELS.filter((f) => f !== model)]) {
    attempt = await callGemini(m, apiKey, text, today);
    if (attempt.ok || !attempt.retryable) break;
  }
  if (!attempt.ok) return { ok: false, message: AI_UNAVAILABLE };

  try {
    const parsed = ParsedRequestSchema.safeParse(JSON.parse(attempt.raw));
    if (!parsed.success) {
      console.error("Gemini reply failed validation", parsed.error.issues.slice(0, 5));
      return { ok: false, message: AI_UNAVAILABLE };
    }
    return { ok: true, fields: parsed.data };
  } catch {
    return { ok: false, message: AI_UNAVAILABLE };
  }
}
