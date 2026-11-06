# ATB Placement Portal

A lightweight web app for Atlanta Tech Bank (ATB) to run device placement without a spreadsheet in one person's head:

**Request → Prioritize → Match → Reserve → Fulfill**

- **Nonprofit partners** (no login) request devices at `/request` (optionally in their own words, filled in by AI) and check progress at `/status` with their request code and email.
- **Staff** plan requests on a board, set priority with reasons, match and reserve devices by ID, reallocate in an emergency, confirm handoffs, and see partner history and donor impact.
- **Volunteers** get a phone-friendly work queue ("what should I work on?"), move devices through Technical Prep → QA → Ready, and use pick lists.

Every decision is written to a decision log with who, what and why.

## How ATB runs this

### What it costs
**$0 a month** on free tiers:
| Piece | Service | Free tier notes |
|---|---|---|
| Website | Vercel (Hobby) | Redeploys automatically when code is pushed to GitHub |
| Database + logins | Supabase (Free) | 500 MB database. Free projects pause after about a week with no use; open the Supabase dashboard and click **Restore** if that happens |
| AI (form fill, thank-you drafts) | Google Gemini (AI Studio free tier) | Optional. If the key is missing or Google is busy, the forms still work without AI |

### Where the data lives
- All data is in **Supabase Postgres** (tables are defined in `supabase/schema.sql`). Device rows keep the same 31 columns as the ATB Device Tracker sheet, plus a few extras (shelf location, reservation, OS readiness).
- The website reads and writes the database **only from the server**, using the secret key. The public key can read nothing (Row Level Security is on with no policies), and only `/`, `/request`, `/request/submitted` and `/status` are public.
- Reservations, releases and handoffs go through database functions (`reserve_devices`, `release_devices`, `fulfill_devices`) so two people can never reserve the same device.
- Device status values are exactly the sheet's: `Technical Prep Zone`, `Quality Assurance Zone`, `Ready For Deployment`, `Deployed`, `Hold - Troubleshooting`, `Hold - Repair`, `Not Suitable / Recycling`, `Internal Use - ATB`. A reservation is a separate field, not a status.
- To back up: Supabase dashboard → **Database** → **Backups**, or **Table Editor** → pick a table → **Export to CSV**.

### Adding a staff member or volunteer
1. Supabase → **Authentication** → **Users** → **Add user** → enter email and password, tick **Auto Confirm User**.
2. Supabase → **SQL Editor** → run (change the email, role and name):
   ```sql
   insert into profiles (id, role, display_name)
   select id, 'volunteer', 'Alex (volunteer)' from auth.users where email = 'alex@example.org';
   ```
   Use `'staff'` for staff. Volunteers can update device status and use pick lists but cannot change priorities or reservations.

### How to add a city
Every device, request and user already carries a `site_id`. To add a second warehouse:
1. Supabase → **SQL Editor** → run:
   ```sql
   insert into sites (id, name, city) values ('chi', 'Chicago Tech Bank Warehouse', 'Chicago');
   ```
2. Give that city's devices and staff the new site: new devices are imported with `site_id = 'chi'`; for staff run `update profiles set site_id = 'chi' where ...`.
3. The **site switcher** in the staff and volunteer menu bar now lists both cities. Staff pick a city to filter the overview, inventory, planning board and volunteer queue. Matching always uses the request's own city.

### How to re-import the Google Sheet
There is no automatic importer yet. The original 500 rows were converted once into `supabase/seed.sql`. To load a fresh export:
1. In Google Sheets: **File** → **Download** → **CSV**.
2. Rename the header row to the database column names listed in the `devices` table in `supabase/schema.sql` (for example `ATB Intake ID` → `id`, `Device Type` → `device_type`, `Status` → `status`). Status values must match the sheet's exact wording.
3. Supabase → **Table Editor** → `devices` → **Insert** → **Import data from CSV**, then upload the file.
4. New rows get safe defaults for the extra columns (Windows 11 readiness = "check", no shelf location, not reserved). Staff can fill shelf locations later.

Importing on top of existing rows with the same ID fails on purpose (no silent overwrites). To replace everything instead, reset the demo data (below) first, or ask a developer to write a one-off update script.

### How to reset the demo data
This wipes all requests, devices and decisions and reloads the original demo set (REQ-1000 to REQ-1006; the next new request is REQ-1007).
1. Supabase → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/seed.sql` and click **Run**.

Logins survive a reset: the seed re-links `staff@example.org` and `volunteer@example.org` to their roles. Other staff or volunteers you added need their `insert into profiles` line run again (see "Adding a staff member" above).

## For developers

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # matching rules (node --test, no extra tools)
npm run build   # run before every push; Vercel fails on type errors
```

`.env.local` (and the same in Vercel → Settings → Environment Variables):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # publishable key, only used for login sessions
SUPABASE_SERVICE_ROLE_KEY=       # secret key, server only, never commit
GEMINI_API_KEY=                  # optional
GEMINI_MODEL=                    # a current Gemini Flash model id from AI Studio
```

First-time database setup: run `supabase/schema.sql`, then `supabase/seed.sql`, in the Supabase SQL Editor. Then create the two demo users (see "Adding a staff member") and run `seed.sql` once more, or the `insert into profiles` lines, to link their roles.

Key code:
- `src/lib/matching.ts`: matching rules (pure function, with tests in `matching.test.ts`)
- `src/lib/request-status.ts`: how request status follows reservations
- `src/lib/gemini.ts`: the only place that calls the AI (with fallback models)
- `PLAN.md`: the full spec; `PROGRESS.md`: build notes and known gaps
