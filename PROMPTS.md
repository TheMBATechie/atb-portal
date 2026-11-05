# Claude Code prompts, stage by stage

How to use each prompt:
1. `/clear` (fresh context for each stage, saves usage)
2. Shift+Tab until the footer shows **plan mode**
3. Paste the prompt. Read the plan. Push back if it adds things outside the stage.
4. Approve the plan. Switch to **accept edits** with Shift+Tab if you want it to move faster.
5. Test the "Done when" items in the browser. Then: `commit and push this stage`.

---

## Stage 0: scaffold and connect

```
Read CLAUDE.md and PLAN.md (sections 1, 3, 8). Build Stage 0 only.
The repo already has README.md, .gitignore, PLAN.md, CLAUDE.md, AGENTS.md, PROMPTS.md, supabase/ and data/.
Scaffold Next.js (latest, App Router, TypeScript, Tailwind, ESLint, src dir, @/* alias) into a temp folder and move it into the repo root without overwriting those files. Merge .gitignore entries.
Add @supabase/supabase-js and @supabase/ssr. Create src/lib/supabase/server-admin.ts (service role, server only) and the auth client helpers.
Set up shadcn/ui. Create a simple layout with an "Atlanta Tech Bank" header and a landing page with three buttons (Request devices, Check a request, Staff and volunteer sign in).
Show the total device count from the devices table on the landing page footer to prove the connection.
Create .env.example. I will create .env.local myself.
Run npm run build at the end.
```

## Stage 1: inventory and overview

```
Read CLAUDE.md and PLAN.md sections 4 and 6. Build Stage 1 only: /staff overview and /staff/inventory (no auth yet).
Overview: pipeline counts by device status and device_category, how many are reserved, requests by status, and a "Data issues found on import" card that counts devices by import_flags.
Inventory: table with filters (status, device_category, win11_ready, reserved yes/no) and search by device ID. Device IDs in a monospace tag style.
Check: Ready 9, QA 36, Technical Prep 120, Deployed 270.
```

## Stage 2: request form and status lookup

```
Read CLAUDE.md and PLAN.md sections 6 and 7. Build Stage 2 only: /request, /request/submitted, /status.
Plain-language form exactly as in section 7, one page, mobile friendly, Must have / Nice to have shown per answer. Multiple device lines allowed.
Partner field: searchable select of partners, plus "My organization isn't listed" (creates partner with status pending).
Live availability hint under the OS question is a placeholder for now (we add it in Stage 4).
On submit, a server action inserts requests + request_lines + decision_log ('create'). Confirmation page shows the code big, with "save this code" copy.
/status: code + email, shows partner-facing status labels from section 4, the device lines, and estimated date if any.
```

## Stage 3: auth, planning board, prioritization

```
Read CLAUDE.md and PLAN.md sections 2, 4, 5 (priority score only) and 6. Build Stage 3 only.
Email + password login with Supabase Auth. Middleware protects /staff and /volunteer. Role from profiles. Volunteers cannot open /staff/requests/* edit controls.
/staff/requests planning board with the columns in section 6. Cards show suggested score as a hint.
/staff/requests/[code]: all answers, partner history (past requests and devices placed with this partner from devices.deployment_partner), staff_priority 1-5 and bucket controls, status changes, decline/defer with a message. Raising priority or moving to This month requires a reason. Every change writes decision_log. Show the decision log as a timeline.
Leave a clearly marked empty "Match devices" section for Stage 4.
```

Before testing Stage 3, create two users in Supabase > Authentication > Users > Add user (tick auto-confirm):
`staff@example.org` and `volunteer@example.org`, then run in the SQL editor:
```sql
insert into profiles (id, role, display_name)
select id, 'staff', 'Jimmy (staff)' from auth.users where email = 'staff@example.org';
insert into profiles (id, role, display_name)
select id, 'volunteer', 'Sam (volunteer)' from auth.users where email = 'volunteer@example.org';
```

## Stage 4: matching and reservation (the core)

```
Read CLAUDE.md and PLAN.md section 5 carefully. Build Stage 4 only.
Write src/lib/matching.ts as a pure function with the exact exclude, OS, grade, substitute and ranking rules, the estimated ready date, and the summary sentence. Add a small test file with examples (REQ-1003 Beacon should produce: 15 needed, 2 ready, 12 in QA, 1 short, with ATB-26-5321 offered as a grade C substitute only if substitutes are allowed).
Match panel on the request detail page: per line, candidates grouped Ready / In QA / Technical Prep / Hold (holds hidden behind a toggle), checkboxes preselected up to the quantity, flags shown (Confirm Windows 11, Install ChromeOS Flex, substitute), "Reserve selected" calls rpc('reserve_devices'). Show reserved devices with Release and Swap. Update request status to matched or partially_matched.
Translate DOUBLE_ALLOCATION / NOT_AVAILABLE errors into friendly messages naming the device and the request holding it.
Hook the live availability hint on /request to the same matching function.
```

## Stage 5: volunteer queue, pick list, fulfill

```
Read CLAUDE.md and PLAN.md sections 6 and 8. Build Stage 5 only.
/volunteer: phone-first. "What should I work on?" Reserved devices first, sorted by request staff_priority then needed_by, grouped by zone, each card says which request it's for. Then unreserved backlog.
Status advance buttons: Technical Prep Zone → Quality Assurance Zone → Ready For Deployment, with QA result (Pass / Pass with Approved Limitation / Fail). Fail moves to Hold - Troubleshooting, calls release_devices with reason, logs it, and flags the request for staff to pick a replacement.
When all reserved devices for a request are Ready, set the request to ready_for_pickup.
/volunteer/picklist/[code]: device ID, model, location, accessories to pack (laptops and tablets: Charger, desktops: Keyboard, Mouse, Power Cord), checkbox each, sorted by location.
Staff "Confirm handoff" on the request page calls rpc('fulfill_devices') for checked devices, then sets delivered or partially_delivered.
```

## MVP checkpoint

```
Walk through PLAN.md section 9 steps 3 to 5 against the code and list anything that would break the demo. Fix only those.
```

## Stage 6: AI intake

```
Read CLAUDE.md and PLAN.md sections 3 and 7. Build Stage 6 only.
Route /api/ai/parse-request (server) calls Gemini with GEMINI_API_KEY and GEMINI_MODEL, structured JSON output matching the request form fields and request_lines. Validate the JSON with zod before using it.
On /request: "Tell us what you need in your own words" box + "Fill the form for me" button. Prefill the form, highlight AI-filled fields, the partner reviews and submits. Same component on the staff side as "Paste an email" to create a request for a partner.
If the call fails or the key is missing, show the normal form and a one-line note.
```

## Stage 7: partner history, feedback, impact

```
Read CLAUDE.md and PLAN.md section 6. Build Stage 7 only.
/staff/partners/[id], feedback form on /status after delivery (writes request_feedback), staff can log feedback too.
/staff/impact: choose a donor (source_org) → devices received, how many placed, which partners and recipient categories, timeline. "Draft thank-you" calls Gemini with only these aggregate facts (no recipient names), returns an editable draft. Copy button and mailto link.
```

## Stage 8: nice-to-haves

```
Read CLAUDE.md and PLAN.md section 8. Build Stage 8 only: urgent reallocation between requests with a required reason (release from A, reserve for B, both logged, A re-matched), site switcher in the header filtering by site_id, location sort on pick lists.
```

## Stage 9: polish

```
Polish pass only, no new features: empty and loading states, mobile check on /volunteer and /request, consistent labels, README section "How ATB runs this" (cost, where data lives, how to add a city, how to re-import the Google Sheet, how to reset demo data).
```
