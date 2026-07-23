-- 0002_rls.sql
-- Row Level Security: any authenticated user can use the app.

alter table projects enable row level security;
alter table pumps enable row level security;
alter table daily_entries enable row level security;
alter table profiles enable row level security;

-- Helper: current user's role + project, read from profiles.
create or replace function current_profile()
returns table(role text, project_id uuid) as $$
  select role, project_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- profiles: any authenticated user can read and update profiles.
create policy profiles_select_authenticated on profiles
  for select using (auth.role() = 'authenticated');

create policy profiles_update_authenticated on profiles
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- projects: any authenticated user can read and write projects.
create policy projects_select on projects
  for select using (auth.role() = 'authenticated');

create policy projects_write_authenticated on projects
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- pumps: any authenticated user can read and write pumps.
create policy pumps_select on pumps
  for select using (auth.role() = 'authenticated');

create policy pumps_write_authenticated on pumps
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- daily_entries: any authenticated user can read and write entries.
create policy daily_entries_select on daily_entries
  for select using (auth.role() = 'authenticated');

create policy daily_entries_insert on daily_entries
  for insert with check (auth.role() = 'authenticated');

create policy daily_entries_update on daily_entries
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy daily_entries_delete on daily_entries
  for delete using (auth.role() = 'authenticated');
