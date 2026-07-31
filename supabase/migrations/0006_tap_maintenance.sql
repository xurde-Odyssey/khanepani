-- 0006_tap_maintenance.sql
-- Admin record keeping for ward-wise taps and maintenance work logs.

create table tap_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null default current_date,
  ward_no int not null check (ward_no > 0),
  category text not null,
  tap_count int not null check (tap_count >= 0),
  application_request text,
  water_tap_installment numeric,
  water_tap_full_fee numeric,
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (record_date, ward_no, category)
);

create table maintenance_records (
  id uuid primary key default gen_random_uuid(),
  maintenance_date date not null,
  title text,
  done_by text not null,
  description text not null,
  work_time text,
  equipments_used text,
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger trg_tap_records_updated_at
  before update on tap_records
  for each row execute function set_updated_at();

create trigger trg_maintenance_records_updated_at
  before update on maintenance_records
  for each row execute function set_updated_at();

alter table tap_records enable row level security;
alter table maintenance_records enable row level security;

create policy tap_records_select on tap_records
  for select using (auth.role() = 'authenticated');

create policy tap_records_write_authenticated on tap_records
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy maintenance_records_select on maintenance_records
  for select using (auth.role() = 'authenticated');

create policy maintenance_records_write_authenticated on maintenance_records
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
