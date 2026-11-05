# CLAUDE.md

Project: ATB Placement Portal, a hackathon prototype for Atlanta Tech Bank. Deadline: working link by 8:00 AM.

Read `PLAN.md` first. It is the spec. Only build the stage you are asked to build.

Rules:
- Database already exists in Supabase (`supabase/schema.sql`, `supabase/seed.sql`). Do not invent tables or columns. If a schema change is truly needed, add it as a new file `supabase/migrations/NNN_name.sql`, tell me to run it in the Supabase SQL editor, and update PLAN.md section 4.
- All Supabase access is server-side with the service role key (`src/lib/supabase/server-admin.ts`). Never use the service role key in client components.
- Keep device status values exactly as in the sheet (PLAN.md section 4). Reservation is a separate field, never a status.
- Reservations only through `rpc('reserve_devices')`, releases through `rpc('release_devices')`, deployments through `rpc('fulfill_devices')`.
- Log every decision to `decision_log`.
- Prefer simple, readable code over abstractions. No new libraries without asking, except shadcn/ui components.
- UI copy in plain language for non-technical nonprofit staff and volunteers.
- Before saying a stage is done: run `npm run build`, fix errors, and list what to click to verify it.
- Do not read the `.xls` file in `data/`. Its contents are already in `supabase/seed.sql`.

## Workflow

- `PROGRESS.md` is the memory between sessions. At the start of every session, read `PROGRESS.md`, `CLAUDE.md`, and the relevant `PLAN.md` sections. At the end of every stage, update `PROGRESS.md`.
- Stage prompts are in `PROMPTS.md`. When told "next stage", find the first unfinished stage in `PROGRESS.md` and build only that stage, following its prompt in `PROMPTS.md`.
- For each stage: propose a short plan first, build it, run `npm run build`, fix errors without asking the user to paste them (read them from the terminal), then list exactly what the user should click to verify.
- Whenever something must be done outside the terminal (Supabase dashboard, Vercel dashboard, creating API keys), print it on its own line starting with "MANUAL STEP FOR YOU:" with exact click-by-click instructions. Never ask the user for secret keys in chat. Never print or commit secrets.
- After the user says a stage works, commit with a clear message and push. Vercel redeploys automatically once it is connected.
- If a stage is running long, cut scope to the "Done when" line in PLAN.md section 8 and note what was skipped in `PROGRESS.md`.
- Time budget: the working link is due at 8:00 AM on Nov 6. Feature freeze at 2:15 AM. Check the clock and warn the user if behind schedule.
