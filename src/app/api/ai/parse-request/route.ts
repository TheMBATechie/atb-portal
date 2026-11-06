import { NextResponse } from "next/server";
import { AI_UNAVAILABLE, parseRequestText } from "@/lib/ai-intake";

// POST { text } → { ok: true, fields } | { ok: false, message }
// Public (partners use it on /request). Never returns raw AI or API errors.
export async function POST(request: Request) {
  let text = "";
  try {
    const body = await request.json();
    text = typeof body?.text === "string" ? body.text.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, message: AI_UNAVAILABLE }, { status: 400 });
  }

  if (text.length < 10) {
    return NextResponse.json(
      { ok: false, message: "Write a sentence or two about what you need, then try again." },
      { status: 400 }
    );
  }
  if (text.length > 8000) {
    return NextResponse.json(
      { ok: false, message: "That's a bit long. Please paste just the part about the devices you need." },
      { status: 400 }
    );
  }

  const result = await parseRequestText(text);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
