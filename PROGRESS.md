# PROGRESS

Memory between sessions. Read this, CLAUDE.md, and the relevant PLAN.md section before building. Update at the end of every stage.

Deadline: working link by 8:00 AM Nov 6. Feature freeze at 2:15 AM.

## Stages (PLAN.md section 8)

| Stage | Description | Status |
|---|---|---|
| 0 | Scaffold + connect | done |
| 1 | Inventory + overview | done |
| 2 | Request form + status lookup | done |
| 3 | Auth + staff queue + prioritization | done |
| 4 | Matching + reservation (core) | done |
| 5 | Volunteer queue + pick list + fulfill | done |
| 6 | AI intake | todo |
| 7 | Partner history, feedback, impact | todo |
| 8 | Nice-to-haves | todo |
| 9 | Polish | todo |

## Skipped or known issues

- Stage 0: Next.js 16's new "Cache Components" mode required `export const instant = false;` on `src/app/page.tsx` to allow the live `devices` count query to run per-request (the older `export const dynamic = "force-dynamic"` convention from PLAN.md-era docs is no longer valid on this Next version and errors the build).
- Stage 0: shadcn's CLI now asks for a `-p <preset>` (nova/vega/maia/lyra/mira/luma/sera/rhea) in addition to `-b <base>` — plan file `CLAUDE.md`/`PROMPTS.md` assumptions about the old `init` flags were updated in-flight; no functional impact, just noting for future stages that also touch shadcn.
- Stage 1: "this month's plan" (mentioned in PLAN.md section 6's `/staff` bullet) is skipped — it depends on the `bucket` field, which isn't meaningfully populated until Stage 3 (auth + staff queue + prioritization). Not stubbed with fake data; will be added in Stage 3.
- Stage 1: filters on `/staff/inventory` are a plain server-rendered GET form (native `<select>`/`<input>`, no client JS, no shadcn Select) — simplest approach for a filter-and-submit flow, no auto-submit-on-change.
- Stage 2: the live availability hint under the OS question is a static placeholder sentence, no real numbers — `matching.ts` doesn't exist until Stage 4.
- Stage 2: no estimated-ready date is shown on `/status` — there's no column/computation for it until Stage 4+; intentionally omitted rather than faked.
- Stage 2: `/status` uses a plain GET form (code + email in the query string), same pattern as `/staff/inventory`'s filters — email appears in the URL/browser history, an accepted tradeoff for a simple public "track my request" flow.
- Stage 2: verified end-to-end via browser automation — test submission produced REQ-1007 (real row in the live Supabase project, matching the stage's literal "Done when" check) and `/status` correctly found it by code+email and correctly rejected a wrong email with a generic message.
- Stage 3: `/volunteer` is a placeholder page (sign-in landing for volunteers) until Stage 5. Volunteers who open `/staff/*` are redirected there.
- Stage 3: "Raising priority requires a reason" applies only when lowering the number of an already-set priority; setting a priority for the first time doesn't require one.
- Stage 4: "short" in the match summary means "not covered by devices that are Ready or in QA right now". REQ-1003 reads "15 needed: 2 ready now, 12 in QA, 1 short. 1 can come from Technical Prep. Estimated ready by Nov 12." "N not available at all" is added only when no device fits.
- Stage 4: ranking puts devices already reserved for this request first, and exact matches before substitutes. Within each group it follows PLAN.md (readiness → OS confidence → grade → age → batch → id). Devices with no grade count as below the minimum (shown only as substitutes).
- Stage 4: `needs` (webcam etc.) are not used in matching. PLAN.md section 5 has no rule for them.
- Stage 4: tests run with `npm test` (Node's built-in runner, no new dependency). `src/lib/matching.fixture.json` is a Nov 5 snapshot of non-deployed devices for the REQ-1003 check. `*.test.ts` is excluded from tsconfig.
- Stage 4: the availability hint on `/request` assumes min grade B and counts Ready + QA devices per line.
- Stage 4: fixed the Stage 3 `set_bucket` action. It now sets status `scheduled` only for submitted / needs_info / scheduled requests, so matched requests keep their status.
- Stage 5: request status rules live in one place, `src/lib/request-status.ts` (`syncRequestStatus`). `in_prep` is never set automatically: the flow is matched/partially_matched → ready_for_pickup (all reserved devices Ready, and fully covered or partial allowed). Requests already `in_prep` stay there until ready.
- MVP checkpoint (demo steps 3–5): two demo breakers fixed.
  - Staff had no way to allow substitutes. The match panel now has an "Allow substitutes…" control (reason required, logged as `note`), so ATB-26-5321 can be offered as grade C.
  - The double-booking block could only be shown with stale tabs. The match panel now has "Show devices held by other requests" (`?held=1`): held devices show a red "Held by REQ-…" badge, are never preselected, and reserving one hits the database DOUBLE_ALLOCATION block with the friendly message.
- Stage 5: a QA Fail on a reserved device releases it (`release_devices`) and logs a `note` "Needs a replacement device…". The staff request page shows an amber banner until the next reservation. There's no extra flag column.
- Stage 5: pick list ticks are a packing aid kept on screen only, not saved. The real handoff is staff's "Confirm handoff" (`fulfill_devices`), then delivered / partially_delivered by placed count vs needed.
- Stage 5: requests that are delivered / partially delivered / declined / closed can't be matched further. Remaining reserved devices on a partially delivered request can still be handed off.

## Manual steps done

- Supabase schema and seed loaded: done
- `.env.local` created: done

## Manual steps done (cont.)

- Vercel project linked to GitHub repo, env vars added: done
- Stage 3 test users (staff@example.org, volunteer@example.org) + profiles rows: done
