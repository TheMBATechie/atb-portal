-- ATB Placement Portal: database schema v1
-- Run this FIRST in Supabase > SQL Editor, then run seed.sql.
-- Data access model: the Next.js server talks to the database with the secret
-- (service_role) key. RLS is enabled on every table with no policies, so the
-- public anon key can read nothing directly. Never expose the secret key to the browser.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Sites (multi-city ready: every record carries a site_id)
-- ---------------------------------------------------------------
create table if not exists sites (
  id          text primary key,
  name        text not null,
  city        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Partners (approved nonprofits)
-- ---------------------------------------------------------------
create table if not exists partners (
  id                uuid primary key default gen_random_uuid(),
  site_id           text not null default 'atl' references sites(id),
  name              text not null unique,
  primary_category  text,                 -- uses the sheet's Recipient Category values
  contact_name      text,
  contact_email     text,
  status            text not null default 'approved' check (status in ('approved','pending')),
  notes             text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------
create sequence if not exists request_code_seq start 1001;

create table if not exists requests (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique default ('REQ-' || nextval('request_code_seq')),
  site_id            text not null default 'atl' references sites(id),
  partner_id         uuid references partners(id),
  org_name           text not null,
  contact_name       text,
  contact_email      text not null,
  purpose            text check (purpose in ('job_search','classes','case_management','outreach','staff_work','shared_lab','other')),
  purpose_detail     text,
  recipient_category text,                -- 'Housing Stability' | 'Workforce and Employment' | 'Community Development (Non-Profit)' | 'Education (K-12)' | 'Education (Adult)'
  use_type           text check (use_type in ('shared','individual')),
  people_served      int,
  needed_by          date,
  late_impact        text,                -- "What happens if these arrive later?"
  partner_urgency    text check (partner_urgency in ('low','medium','high')),
  urgency_reason     text,
  allow_partial      boolean not null default true,
  allow_substitutes  boolean not null default false,
  setup              text not null default 'out_of_box' check (setup in ('out_of_box','preset')),
  setup_notes        text,
  raw_text           text,                -- original free text / pasted email, if any
  status             text not null default 'submitted' check (status in (
                       'submitted','needs_info','scheduled','declined',
                       'matched','partially_matched','in_prep','ready_for_pickup',
                       'delivered','partially_delivered','closed')),
  bucket             text check (bucket in ('this_month','next_month','later')),
  staff_priority     int check (staff_priority between 1 and 5),   -- 1 = highest
  staff_notes        text,
  decline_message    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists request_lines (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null references requests(id) on delete cascade,
  device_category  text not null check (device_category in ('laptop','desktop','tablet','recommend')),
  quantity         int  not null check (quantity > 0),
  os_pref          text not null default 'any' check (os_pref in ('windows','mac','any')),
  os_firm          boolean not null default false,     -- true = Must have, false = Nice to have
  needs            text[] not null default '{}',       -- e.g. {'webcam','large_screen'}
  min_grade        text not null default 'B' check (min_grade in ('A','B','C')),
  notes            text
);
create index if not exists request_lines_request_idx on request_lines(request_id);

-- ---------------------------------------------------------------
-- Devices: the 31 sheet columns + reservation, location, site, OS capability
-- ---------------------------------------------------------------
create table if not exists devices (
  id                       text primary key,          -- ATB Intake ID
  site_id                  text not null default 'atl' references sites(id),
  serial_number            text,
  device_type              text not null,             -- sheet value, e.g. 'Laptop (Windows)'
  year_received            int,
  source_org               text,
  source_category          text,
  date_received            date,
  initial_condition_notes  text,
  age_band                 text,
  grade                    text,                      -- 'A - Excellent' | 'B - Good' | 'C - Limited' | 'D - Not Deployable'
  device_model             text,
  reuse_cleared            text,
  diagnostic_result        text,
  wipe_status              text,
  wipe_date                date,
  wipe_by_type             text,
  wipe_method              text,
  final_os                 text,                      -- blank does NOT mean confirmed OS
  qa_by                    text,
  qa_date                  date,
  qa_result                text,
  status                   text not null,             -- exact sheet values, see PLAN.md
  accessories              text,
  deployment_partner       text,
  recipient_name           text,
  recipient_category       text,
  deployment_date          date,
  fmv_base                 numeric,
  condition_factor         numeric,
  fmv                      numeric,
  other_notes              text,

  -- added fields
  location                 text,                      -- shelf in the warehouse (mock values for the demo)
  win11_ready              text not null default 'check' check (win11_ready in ('yes','no','check')),
  mac_ready                text not null default 'no'    check (mac_ready   in ('yes','no','check')),
  flex_ready               text not null default 'no'    check (flex_ready  in ('yes','no','check')),
  os_note                  text,
  import_flags             text[] not null default '{}',
  reserved_request_id      uuid references requests(id) on delete set null,
  reserved_line_id         uuid references request_lines(id) on delete set null,
  reserved_at              timestamptz,
  placed_request_id        uuid references requests(id) on delete set null,
  updated_at               timestamptz not null default now(),

  -- derived helpers for matching
  device_category text generated always as (
    case
      when device_type in ('Laptop (Windows)','Laptop (Mac)','Chromebook') then 'laptop'
      when device_type like 'Desktop%' then 'desktop'
      when device_type like 'Tablet%'  then 'tablet'
      else 'other'
    end) stored,
  grade_letter text generated always as (left(grade, 1)) stored,
  readiness_rank int generated always as (
    case status
      when 'Ready For Deployment'   then 1
      when 'Quality Assurance Zone' then 2
      when 'Technical Prep Zone'    then 3
      when 'Hold - Troubleshooting' then 4
      when 'Hold - Repair'          then 5
      else 9
    end) stored
);
create index if not exists devices_status_idx   on devices(status);
create index if not exists devices_reserved_idx on devices(reserved_request_id);
create index if not exists devices_placed_idx   on devices(placed_request_id);
create index if not exists devices_source_idx   on devices(source_org);

-- ---------------------------------------------------------------
-- Decision history (nice-to-have 4)
-- ---------------------------------------------------------------
create table if not exists decision_log (
  id          bigserial primary key,
  request_id  uuid references requests(id) on delete cascade,
  device_id   text references devices(id) on delete cascade,
  actor       text not null,          -- display name of staff/volunteer, or 'system'
  action      text not null,          -- 'create','set_priority','set_bucket','set_status','reserve','release','swap','reallocate','decline','device_status','fulfill','note'
  from_value  text,
  to_value    text,
  detail      text,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists decision_log_request_idx on decision_log(request_id);

-- ---------------------------------------------------------------
-- Feedback after delivery (60 to 90 day check-in)
-- ---------------------------------------------------------------
create table if not exists request_feedback (
  id          bigserial primary key,
  request_id  uuid not null references requests(id) on delete cascade,
  source      text not null check (source in ('partner','staff')),
  rating      int check (rating between 1 and 5),
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- App users and roles (linked to Supabase Auth)
-- ---------------------------------------------------------------
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          text not null check (role in ('staff','volunteer')),
  display_name  text not null,
  site_id       text not null default 'atl' references sites(id)
);

-- ---------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists requests_touch on requests;
create trigger requests_touch before update on requests
  for each row execute function touch_updated_at();

drop trigger if exists devices_touch on devices;
create trigger devices_touch before update on devices
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------
-- reserve_devices: all-or-nothing, blocks double allocation
-- ---------------------------------------------------------------
create or replace function reserve_devices(
  p_request_id uuid,
  p_line_id    uuid,
  p_device_ids text[],
  p_actor      text,
  p_reason     text default null
) returns integer
language plpgsql as $$
declare
  v_found     int;
  v_conflicts text;
  v_unavail   text;
  v_count     int;
begin
  -- lock the rows so two staff members cannot reserve the same device at once
  perform 1 from devices where id = any(p_device_ids) for update;

  select count(*) into v_found from devices where id = any(p_device_ids);
  if v_found <> cardinality(p_device_ids) then
    raise exception 'UNKNOWN_DEVICE: one or more device IDs do not exist';
  end if;

  select string_agg(id, ', ') into v_conflicts
  from devices
  where id = any(p_device_ids)
    and reserved_request_id is not null
    and reserved_request_id <> p_request_id;
  if v_conflicts is not null then
    raise exception 'DOUBLE_ALLOCATION: already reserved for another request: %', v_conflicts;
  end if;

  select string_agg(id, ', ') into v_unavail
  from devices
  where id = any(p_device_ids)
    and status in ('Deployed','Not Suitable / Recycling','Internal Use - ATB');
  if v_unavail is not null then
    raise exception 'NOT_AVAILABLE: %', v_unavail;
  end if;

  update devices
     set reserved_request_id = p_request_id,
         reserved_line_id    = p_line_id,
         reserved_at         = now()
   where id = any(p_device_ids);
  get diagnostics v_count = row_count;

  insert into decision_log (request_id, actor, action, to_value, detail, reason)
  values (p_request_id, p_actor, 'reserve', v_count || ' devices',
          array_to_string(p_device_ids, ', '), p_reason);

  return v_count;
end $$;

-- ---------------------------------------------------------------
-- release_devices: un-reserve devices held by a request
-- ---------------------------------------------------------------
create or replace function release_devices(
  p_request_id uuid,
  p_device_ids text[],
  p_actor      text,
  p_reason     text default null
) returns integer
language plpgsql as $$
declare v_count int;
begin
  update devices
     set reserved_request_id = null, reserved_line_id = null, reserved_at = null
   where id = any(p_device_ids)
     and reserved_request_id = p_request_id;
  get diagnostics v_count = row_count;

  insert into decision_log (request_id, actor, action, to_value, detail, reason)
  values (p_request_id, p_actor, 'release', v_count || ' devices',
          array_to_string(p_device_ids, ', '), p_reason);
  return v_count;
end $$;

-- ---------------------------------------------------------------
-- fulfill_devices: write back the same columns the sheet uses today
-- ---------------------------------------------------------------
create or replace function fulfill_devices(
  p_request_id uuid,
  p_device_ids text[],
  p_actor      text
) returns integer
language plpgsql as $$
declare
  v_req   requests%rowtype;
  v_bad   text;
  v_count int;
begin
  select * into v_req from requests where id = p_request_id;
  if not found then raise exception 'UNKNOWN_REQUEST'; end if;

  perform 1 from devices where id = any(p_device_ids) for update;

  select string_agg(id, ', ') into v_bad
  from devices
  where id = any(p_device_ids)
    and (reserved_request_id is distinct from p_request_id or status <> 'Ready For Deployment');
  if v_bad is not null then
    raise exception 'NOT_READY: must be reserved for this request and Ready For Deployment: %', v_bad;
  end if;

  update devices d
     set status              = 'Deployed',
         deployment_partner  = v_req.org_name,
         recipient_category  = v_req.recipient_category,
         deployment_date     = current_date,
         placed_request_id   = p_request_id,
         reserved_request_id = null,
         reserved_line_id    = null,
         reserved_at         = null,
         accessories = coalesce(d.accessories,
           case
             when d.device_type like 'Desktop%' then 'Keyboard, Mouse, Power Cord'
             when d.device_type like 'Laptop%' or d.device_type = 'Chromebook' or d.device_type like 'Tablet%' then 'Charger'
             else null
           end)
   where d.id = any(p_device_ids);
  get diagnostics v_count = row_count;

  insert into decision_log (request_id, actor, action, to_value, detail)
  values (p_request_id, p_actor, 'fulfill', v_count || ' devices deployed',
          array_to_string(p_device_ids, ', '));
  return v_count;
end $$;

-- ---------------------------------------------------------------
-- Handy views
-- ---------------------------------------------------------------
create or replace view v_pipeline with (security_invoker = true) as
select site_id, device_type, device_category, status,
       count(*)                                         as devices,
       count(*) filter (where reserved_request_id is not null) as reserved
from devices
group by site_id, device_type, device_category, status;

create or replace view v_donor_trace with (security_invoker = true) as
select d.source_org, d.source_category, d.id as device_id, d.device_type, d.device_model,
       d.deployment_partner, d.recipient_category, d.deployment_date, d.fmv
from devices d
where d.status = 'Deployed';

-- Make sure RLS is on everywhere (anon key reads nothing; server uses the secret key)
alter table sites            enable row level security;
alter table partners         enable row level security;
alter table requests         enable row level security;
alter table request_lines    enable row level security;
alter table devices          enable row level security;
alter table decision_log     enable row level security;
alter table request_feedback enable row level security;
alter table profiles         enable row level security;
