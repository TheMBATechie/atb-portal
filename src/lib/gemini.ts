// Server only. One place that talks to Google Gemini.

// Tried in order when GEMINI_MODEL is busy (503/429), missing, or slow.
// Free-tier models get overloaded at peak times; this keeps the demo working.
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
const TIMEOUT_MS = 10000;

type Attempt = { ok: true; text: string } | { ok: false; retryable: boolean };

async function callModel(
  model: string,
  apiKey: string,
  prompt: string,
  responseSchema: object | undefined,
  temperature: number
): Promise<Attempt> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: responseSchema
            ? { temperature, responseMimeType: "application/json", responseSchema }
            : { temperature },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      console.error("Gemini call failed", model, res.status, (await res.text()).slice(0, 300));
      return { ok: false, retryable: [404, 429, 500, 503].includes(res.status) };
    }
    const body = await res.json();
    const text: string | undefined = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? { ok: true, text } : { ok: false, retryable: true };
  } catch (error) {
    console.error("Gemini call error", model, error);
    return { ok: false, retryable: true };
  }
}

export async function generateWithGemini(input: {
  prompt: string;
  responseSchema?: object;
  temperature?: number;
}): Promise<{ ok: true; text: string } | { ok: false }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return { ok: false };

  for (const m of [model, ...FALLBACK_MODELS.filter((f) => f !== model)]) {
    const attempt = await callModel(m, apiKey, input.prompt, input.responseSchema, input.temperature ?? 0);
    if (attempt.ok) return { ok: true, text: attempt.text };
    if (!attempt.retryable) break;
  }
  return { ok: false };
}
