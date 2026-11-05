# ATB Placement Portal: build spec

Single source of truth for this build. Read the section for the current stage before writing code.
Workflow diagram for humans: https://claude.ai/artifact/SzM46aQXAo8LZFKHHyHhua

## 1. What we are building

Atlanta Tech Bank (ATB) collects retired laptops, desktops and tablets, refurbishes them in a warehouse, and places them with nonprofit partners. Today the matching of devices to requests lives in the founder's head and a Google Sheet. We are building a lightweight web app so staff and volunteers can run it without him.

Challenge flow (from the organizers' deck): **Request → Prioritize → Match → Reserve → Fulfill.**
Example to demo: a nonprofit asks for 15 Windows laptops, staff set priority, the system finds eligible devices, staff reserve them by device ID, a volunteer gets a pick list.

Judging (by ATB's founder): business and operational logic, feasibility for a small nonprofit, usability with minimal training, end-to-end prototype. **Quality and practicality beat technical complexity.**

Scope is the warehouse only. Out of scope: donor logins, device intake screens, FMV and tax receipts, wipe/imaging workflow, barcodes, nonprofit eligibility checks.

## 2. Users and access

| User | Access | Can do |
|---|---|---|
| Nonprofit partner | No login | Submit request form. Check status with request code + email |
| ATB staff | Login, role `staff` | Everything: queue, priority, match, reserve, release, fulfill, partners, impact, thank-you drafts |
| Approved volunteer | Login, role `volunteer` | Work queue, update device status, pick lists. Cannot change priority or reservations |

Internal data must not be visible to "anyone with a link". Only `/`, `/request`, `/request/submitted` and `/status` are public.

## 3. Tech stack and architecture decisions

- Next.js (App Router, TypeScript, `src/` dir), Tailwind CSS, shadcn/ui components. Hosted on Vercel (free).
- Supabase Postgres + Supabase Auth (email + password). Free tier.
- **All database access happens on the server** (server components, server actions, route handlers) with the Supabase **secret / service_role key**. RLS is enabled on every table with no policies, so the browser's anon key can read nothing. Never import the secret key into a client component.
- Supabase Auth is used only for login sessions (`@supabase/ssr`). After login, the server reads `profiles.role` to authorize. Middleware protects `/staff/*` and `/volunteer/*`.
- AI: Google Gemini API (free tier from Google AI Studio), called only from a server route. Model name from env `GEMINI_MODEL`. Every AI feature must work without AI too (plain form still works if the key is missing).
- Matching logic is a **pure TypeScript function** in `src/lib/matching.ts` with unit-test style examples. Reservation writes go through the Postgres function `reserve_devices` (atomic, blocks double allocation).
- Keep it simple: no state libraries, no ORMs. Use `@supabase/supabase-js` queries and `rpc()`.

Env vars (`.env.local`, and the same in Vercel):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=        # publishable key, only used for auth
SUPABASE_SERVICE_ROLE_KEY=            # secret key, server only
GEMINI_API_KEY=
GEMINI_MODEL=                         # current Gemini Flash model id from AI Studio
```

## 4. Data model (already created by `supabase/schema.sql`, loaded by `supabase/seed.sql`)

- `sites` (multi-city ready; seed has `atl`)
- `partners` (22 partners from the sheet's Deployment Partner column)
- `requests` (code like `REQ-1003`, status, bucket, staff_priority, partner urgency, form answers)
- `request_lines` (device_category, quantity, os_pref, os_firm, needs[], min_grade)
- `devices` (500 rows from the sheet; all 31 columns kept, plus `location`, `win11_ready`, `mac_ready`, `flex_ready`, `os_note`, `import_flags[]`, `reserved_request_id`, `reserved_line_id`, `placed_request_id`, and generated `device_category`, `grade_letter`, `readiness_rank`)
- `decision_log` (who, action, from, to, detail, reason, when)
- `request_feedback`
- `profiles` (auth user → role + display_name)
- Functions: `reserve_devices(request_id, line_id, device_ids[], actor, reason)`, `release_devices(request_id, device_ids[], actor, reason)`, `fulfill_devices(request_id, device_ids[], actor)`
- Views: `v_pipeline`, `v_donor_trace`

Seeded demo requests: REQ-1000 (closed, with feedback), REQ-1001 NeighborLink (ready for pickup, 2 iPads reserved; came from a sheet anomaly), REQ-1002 Community Horizons (in prep, device on troubleshooting shelf), **REQ-1003 Beacon Community Services (15 Windows laptops, submitted: the main demo)**, REQ-1004 Rise & Thrive (10 shared-lab desktops, next month), REQ-1005 Pathways for Progress (6 laptops any OS, urgent), REQ-1006 Hopewell (1 MacBook for an executive director).

Never rename the sheet's status values. Device status values, exactly:
`Technical Prep Zone`, `Quality Assurance Zone`, `Ready For Deployment`, `Deployed`, `Hold - Troubleshooting`, `Hold - Repair`, `Not Suitable / Recycling`, `Internal Use - ATB`.

Reservation is NOT a status. A device in `Quality Assurance Zone` can already be reserved.

Request status flow: `submitted → scheduled → matched / partially_matched → in_prep → ready_for_pickup → delivered / partially_delivered → closed`, with side states `needs_info`, `declined`. `scheduled` carries `bucket`: `this_month | next_month | later`.

Partner-facing labels (plain language): Submitted = "Received", scheduled = "Planned for <month>", matched/in_prep = "Being prepared", ready_for_pickup = "Ready for pickup", delivered = "Delivered", declined = "Not able to fill right now".

## 5. Matching rules (`src/lib/matching.ts`)

Input: a request line, the request (allow_substitutes, allow_partial), all non-deployed devices. Output: ranked candidates grouped by readiness, a shortfall count, and warnings.

Exclude a device if:
- status is `Deployed`, `Not Suitable / Recycling` or `Internal Use - ATB`
- status is a Hold, unless the staff toggle "include holds" is on
- `reuse_cleared = 'No'`
- `grade_letter = 'D'`
- reserved for a different request
- `device_category` differs from the line (if the line is `recommend`: shared_lab → desktop, outreach → tablet, else laptop). With `allow_substitutes`, laptop and desktop may substitute for each other, marked as "substitute".
- OS does not fit:
  - `windows`: `win11_ready = 'yes'` (confirmed) or `'check'` (allowed, flagged "Confirm Windows 11 during prep")
  - `mac`: laptops/desktops need `mac_ready = 'yes'`; tablets: device_type `Tablet (iPad)`
  - `any`: any of win11_ready yes/check, mac_ready yes, flex_ready yes/check, or a Chromebook. Devices that would need ChromeOS Flex installed get the note "Install ChromeOS Flex"
- Grade below `min_grade` (A < B < C): exclude, unless `allow_substitutes`, then include as "substitute: grade C"

Blank `final_os` never counts as confirmed OS.

Rank: `readiness_rank` (Ready 1, QA 2, Tech Prep 3, Holds 4-5) → OS confidence (yes before check) → grade (A, B, C) → age band (0-2, 3-5, 6-9, 10+, Unknown) → keep batches together (same `device_model` + `source_org`) → id.

Estimated ready date: Ready = today, QA = +2 days, Tech Prep = +7 days, Hold = +10 days (constants in one place).

Summary sentence shown to staff, e.g.: "15 needed: 2 ready now, 12 in QA, 1 short. Estimated ready by Nov 12."

Suggested priority score (a hint only, never applied automatically). Show the breakdown:
- partner urgency: high 30, medium 15, low 5
- deadline: ≤14 days 30, ≤30 days 20, ≤60 days 10, else 0
- people served: min(20, people/3)
- days waiting since created: min(10, days)
- devices already placed with this partner this year: minus min(15, count/4)

## 6. Pages

Public:
- `/` landing: three big buttons: Request devices, Check a request, Staff and volunteer sign in
- `/request` request form (plain language, Must have / Nice to have per answer; see section 7)
- `/request/submitted?code=` confirmation with the request code
- `/status` lookup by request code + email
- `/login`

Staff (`/staff`):
- `/staff` overview: device pipeline by zone and category (counts + reserved counts), requests by status, this month's plan, data issues found on import
- `/staff/requests` planning board: columns New, This month, Next month, Later, In progress, Ready, Done/Declined. Cards show org, device summary, needed-by, partner urgency, staff priority, suggested score
- `/staff/requests/[code]` request detail: answers, partner history panel, priority + bucket controls (reason required to raise priority), match panel per line with checkboxes and "Reserve selected", reserved devices list with release/swap, fulfill section, decision log timeline, decline/defer with message
- `/staff/inventory` device table with filters (status, category, OS readiness, reserved), search by ID
- `/staff/partners/[id]` history: past requests, devices received, feedback
- `/staff/impact` donor trace: pick a donor → devices received, where they went (partner + category), counts; "Draft thank-you" (AI) → editable textarea → copy button and mailto link

Volunteer (`/volunteer`):
- `/volunteer` "What should I work on?": reserved devices first (sorted by request priority, then needed_by), grouped by zone; then unreserved backlog. One-tap status advance with QA result. Phone-first layout
- `/volunteer/picklist/[code]` pick list: device ID, model, location, accessories, checkbox each; "Mark handed over" (staff confirm)

## 7. Request form spec (plain language)

Optional top box: "Tell us what you need in your own words" → AI fills the fields (stage 6).

| Question | Field | Tag |
|---|---|---|
| Which organization are you with? Your name and email | partner (select known or type new) / contact_name / contact_email | Must |
| What will people use these for? | purpose chips + purpose_detail | Must |
| Shared, or one per person? How many people will they serve? | use_type, people_served | Nice |
| What kind of device, and how many? (multiple lines) | request_lines.device_category, quantity | Must |
| Windows, Mac, or doesn't matter? | os_pref + os_firm toggle | Must or Nice |
| Anything specific the devices need? | needs chips: webcam, large_screen, works_offline, other | Nice |
| When do you need them? What happens if they arrive later? | needed_by, late_impact | Must |
| How urgent is this for you? | partner_urgency + urgency_reason | Nice |
| Send what's ready now, or all together? | allow_partial | Nice |
| OK if we substitute a similar device? | allow_substitutes | Nice |
| Setup | setup out_of_box (default) or preset + setup_notes | Nice |

Smart defaults: shared_lab → desktop; outreach → tablet; "doesn't matter" OS → hint "flexible requests usually arrive sooner".
Live availability hint under the OS question: count of eligible Ready + QA devices for the current answers (server action using matching.ts).
Target: a two-laptop request takes about a minute.

## 8. Build stages (each stage ends deployed and working)

Stage 0. Scaffold + connect: Next.js app, Supabase server client (service role) and auth client, env, Tailwind + shadcn/ui, layout with ATB header, landing page, Vercel deploy. Done when: live URL shows landing page and a device count read from the database.

Stage 1. Inventory + overview: `/staff/inventory` table and `/staff` overview (pipeline counts by zone and category, reserved counts, import flags). No auth yet. Done when: counts match (Ready 9, QA 36, Tech Prep 120, Deployed 270).

Stage 2. Request form + status lookup: `/request`, confirmation, `/status`. Creates `requests` + `request_lines` + a `decision_log` 'create' row. Done when: a new request gets code REQ-1007 and is found by code + email.

Stage 3. Auth + staff queue + prioritization: login, roles, middleware, planning board, request detail (no matching yet), priority/bucket/status changes with reasons logged, decline/defer. Done when: moving REQ-1005 to This month with a reason shows in its decision log.

Stage 4. Matching + reservation (core): `matching.ts`, match panel, reserve via `rpc('reserve_devices')`, release, swap, partial matches, request status updates (matched / partially_matched). Show the DOUBLE_ALLOCATION error as a friendly message. Done when: REQ-1003 shows "15 needed: 2 ready, 12 in QA, 1 short" and reserving a device already held by another request is blocked.

Stage 5. Volunteer queue + pick list + fulfill: `/volunteer`, status advance (Tech Prep → QA → Ready, QA fail → Hold - Troubleshooting releases the reservation and logs it), pick list, fulfill via `rpc('fulfill_devices')`, request moves to ready_for_pickup when all reserved devices are Ready, delivered / partially_delivered after fulfill. Done when: the full REQ-1003 story runs end to end.

**MVP checkpoint: run the demo script (section 9) end to end on the deployed URL.**

Stage 6. AI intake: "Tell us in your own words" box on `/request` and "Paste an email" on staff side → `/api/ai/parse-request` → returns JSON matching the form fields → form prefilled for review. Fallback: if the AI call fails, show the plain form with a short note.

Stage 7. Partner history, feedback, impact: partner page, feedback on status page after delivery, `/staff/impact` donor trace and AI thank-you draft (staff edits, then copy / mailto).

Stage 8. Nice-to-haves: urgent reallocation (move reserved devices from request A to request B with a required reason, both logged; A is re-matched), site switcher in header (filters by site_id), partial delivery polish, location sort on pick list.

Stage 9. Polish: empty states, loading states, mobile check on volunteer pages, README "How ATB runs this" (costs $0, where data lives, how to add a city, how to import the Google Sheet), demo reset (re-run seed.sql).

## 9. Demo script (4 minutes, live URL)

1. Opening: "If you went on vacation tomorrow, this is what you'd hand over."
2. Partner: open `/request`, paste an email-style description, AI fills the form, toggle OS to "doesn't matter" and show availability go up. Submit, get the code.
3. Staff: planning board. Open Beacon REQ-1003 (15 Windows laptops). Suggested score shown as a hint. Move it to This month with a reason.
4. Match: "15 needed: 2 ready, 12 in QA, 1 short." Choose to accept a grade C substitute or deliver 14 now. Reserve. Show a second request trying to grab one of those devices and being blocked.
5. Volunteer on a phone: "QA these 12 first", advance one to Ready. Pick list with shelf locations and chargers.
6. Impact: pick Willow Creek School, see where its devices went, draft the thank-you.
7. Close: $0 a month, built on his sheet's columns, add a city with one row.

## 10. Conventions

- Plain language in all UI copy. Name things the way ATB does: "Technical Prep Zone", "Ready For Deployment", "pick list", "partner".
- Every write that changes priority, bucket, reservation, device status, or request status inserts a `decision_log` row with actor display name and reason when given.
- Server actions return `{ ok: true } | { ok: false, message }`; show friendly messages, never raw SQL errors.
- Dates shown as "Nov 12". Device IDs always in a monospace "tag" style.
- Run `npm run build` before every commit (Vercel fails on type errors).
