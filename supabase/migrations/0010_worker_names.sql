-- Master list of worker names for pipeline maintenance entry and reports.

create table if not exists worker_names (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists trg_worker_names_updated_at on worker_names;
create trigger trg_worker_names_updated_at
  before update on worker_names
  for each row execute function set_updated_at();

alter table worker_names enable row level security;

drop policy if exists worker_names_select on worker_names;
drop policy if exists worker_names_write_authenticated on worker_names;

create policy worker_names_select on worker_names
  for select using (auth.role() = 'authenticated');

create policy worker_names_write_authenticated on worker_names
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
