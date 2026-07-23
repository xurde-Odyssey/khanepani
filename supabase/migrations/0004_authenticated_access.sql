-- 0004_authenticated_access.sql
-- Relax app access so any signed-in user can use every page and operation.

drop policy if exists profiles_select_self on profiles;
drop policy if exists profiles_update_admin on profiles;
drop policy if exists profiles_select_authenticated on profiles;
drop policy if exists profiles_update_authenticated on profiles;

drop policy if exists projects_select on projects;
drop policy if exists projects_write_admin on projects;
drop policy if exists projects_write_authenticated on projects;

drop policy if exists pumps_select on pumps;
drop policy if exists pumps_write on pumps;
drop policy if exists pumps_write_authenticated on pumps;

drop policy if exists daily_entries_select on daily_entries;
drop policy if exists daily_entries_insert on daily_entries;
drop policy if exists daily_entries_update on daily_entries;
drop policy if exists daily_entries_delete on daily_entries;

create policy profiles_select_authenticated on profiles
  for select using (auth.role() = 'authenticated');

create policy profiles_update_authenticated on profiles
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy projects_select on projects
  for select using (auth.role() = 'authenticated');

create policy projects_write_authenticated on projects
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy pumps_select on pumps
  for select using (auth.role() = 'authenticated');

create policy pumps_write_authenticated on pumps
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy daily_entries_select on daily_entries
  for select using (auth.role() = 'authenticated');

create policy daily_entries_insert on daily_entries
  for insert with check (auth.role() = 'authenticated');

create policy daily_entries_update on daily_entries
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy daily_entries_delete on daily_entries
  for delete using (auth.role() = 'authenticated');
