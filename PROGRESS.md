# PROGRESS

Memory between sessions. Read this, CLAUDE.md, and the relevant PLAN.md section before building. Update at the end of every stage.

Deadline: working link by 8:00 AM Nov 6. Feature freeze at 2:15 AM.

## Stages (PLAN.md section 8)

| Stage | Description | Status |
|---|---|---|
| 0 | Scaffold + connect | done |
| 1 | Inventory + overview | done |
| 2 | Request form + status lookup | todo |
| 3 | Auth + staff queue + prioritization | todo |
| 4 | Matching + reservation (core) | todo |
| 5 | Volunteer queue + pick list + fulfill | todo |
| 6 | AI intake | todo |
| 7 | Partner history, feedback, impact | todo |
| 8 | Nice-to-haves | todo |
| 9 | Polish | todo |

## Skipped or known issues

- Stage 0: Next.js 16's new "Cache Components" mode required `export const instant = false;` on `src/app/page.tsx` to allow the live `devices` count query to run per-request (the older `export const dynamic = "force-dynamic"` convention from PLAN.md-era docs is no longer valid on this Next version and errors the build).
- Stage 0: shadcn's CLI now asks for a `-p <preset>` (nova/vega/maia/lyra/mira/luma/sera/rhea) in addition to `-b <base>` — plan file `CLAUDE.md`/`PROMPTS.md` assumptions about the old `init` flags were updated in-flight; no functional impact, just noting for future stages that also touch shadcn.
- Stage 1: "this month's plan" (mentioned in PLAN.md section 6's `/staff` bullet) is skipped — it depends on the `bucket` field, which isn't meaningfully populated until Stage 3 (auth + staff queue + prioritization). Not stubbed with fake data; will be added in Stage 3.
- Stage 1: filters on `/staff/inventory` are a plain server-rendered GET form (native `<select>`/`<input>`, no client JS, no shadcn Select) — simplest approach for a filter-and-submit flow, no auto-submit-on-change.

## Manual steps done

- Supabase schema and seed loaded: done
- `.env.local` created: done

## Manual steps done (cont.)

- Vercel project linked to GitHub repo, env vars added: done
