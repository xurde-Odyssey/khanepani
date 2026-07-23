-- 0001_init.sql
-- Core schema for the water supply production reporting app.

create extension if not exists "pgcrypto";

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table pumps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  pump_no int not null,
  label text,
  is_active boolean not null default true,
  unique (project_id, pump_no)
);

-- One row per pump per BS calendar day. entry_date is the Gregorian
-- equivalent, stored for reliable range queries; bs_year/bs_month/bs_day
-- are stored alongside so the legacy monthly-tab layout can be reproduced
-- exactly (bulk entry grid, monthly report, Excel export).
create table daily_entries (
  id uuid primary key default gen_random_uuid(),
  pump_id uuid references pumps(id) not null,
  entry_date date not null,
  bs_year int not null,
  bs_month text not null check (bs_month in (
    'Shrawan','Bhadra','Ashoj','Karthik','Mangsir','Poush',
    'Magh','Falgun','Chaitra','Baishak','Jestha','Ashar'
  )),
  bs_day int not null check (bs_day between 1 and 32),
  operating_hours numeric,
  flowmeter_start_unit numeric,
  flowmeter_end_unit numeric,
  production numeric,
  backwash_time numeric,
  backwash_unit numeric,
  distribution numeric,
  lps numeric,
  entered_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (pump_id, entry_date),
  constraint flowmeter_end_gte_start check (
    flowmeter_end_unit is null or flowmeter_start_unit is null or flowmeter_end_unit >= flowmeter_start_unit
  )
);

create index idx_daily_entries_pump_date on daily_entries (pump_id, entry_date);
create index idx_daily_entries_bs on daily_entries (bs_year, bs_month, pump_id);

create table profiles (
  id uuid primary key references auth.users(id),
  full_name text,
  role text not null check (role in ('admin','supervisor','operator','viewer')) default 'operator',
  project_id uuid references projects(id)
);

-- Keep `updated_at` fresh on daily_entries edits.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_daily_entries_updated_at
  before update on daily_entries
  for each row execute function set_updated_at();

-- Auto-create a profile row (default role: operator) whenever a new auth user signs up.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'operator');
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
