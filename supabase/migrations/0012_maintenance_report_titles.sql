-- User-managed title list for Maintenance Report items.

create table if not exists maintenance_report_titles (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into maintenance_report_titles (title)
values
  ('1/2" pipe maintenance'),
  ('Meter place change'),
  ('Meter Gate valve change'),
  ('Pipeline Maintenance'),
  ('Closed tap re-open'),
  ('Meter Check'),
  ('Counter Change'),
  ('New Tap Connection'),
  ('Hole change'),
  ('Water pressure increment'),
  ('Meter nut/ nipple Change'),
  ('Ferrule change'),
  ('Saddle change'),
  ('Female socket maintenance/ change'),
  ('Union change'),
  ('Double connection removed'),
  ('Leakage maintenance'),
  ('Temporary tap closed'),
  ('Miscellaneous')
on conflict (title) do nothing;

insert into maintenance_report_titles (title)
select distinct title
from maintenance_records
where title is not null and btrim(title) <> ''
on conflict (title) do nothing;

drop trigger if exists trg_maintenance_report_titles_updated_at on maintenance_report_titles;
create trigger trg_maintenance_report_titles_updated_at
  before update on maintenance_report_titles
  for each row execute function set_updated_at();

alter table maintenance_report_titles enable row level security;

drop policy if exists maintenance_report_titles_select on maintenance_report_titles;
drop policy if exists maintenance_report_titles_write_authenticated on maintenance_report_titles;

create policy maintenance_report_titles_select on maintenance_report_titles
  for select using (auth.role() = 'authenticated');

create policy maintenance_report_titles_write_authenticated on maintenance_report_titles
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
