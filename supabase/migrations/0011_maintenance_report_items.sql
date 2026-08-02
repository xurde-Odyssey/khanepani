-- Date-wise maintenance report item counts.

create table if not exists maintenance_report_items (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  title text not null,
  item_count int not null check (item_count >= 0),
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists trg_maintenance_report_items_updated_at on maintenance_report_items;
create trigger trg_maintenance_report_items_updated_at
  before update on maintenance_report_items
  for each row execute function set_updated_at();

alter table maintenance_report_items enable row level security;

drop policy if exists maintenance_report_items_select on maintenance_report_items;
drop policy if exists maintenance_report_items_write_authenticated on maintenance_report_items;

create policy maintenance_report_items_select on maintenance_report_items
  for select using (auth.role() = 'authenticated');

create policy maintenance_report_items_write_authenticated on maintenance_report_items
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
