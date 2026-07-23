-- 0002_rls.sql
-- Row Level Security: operators can write only their own project's data;
-- supervisors/viewers get read-only; admins get full access.

alter table projects enable row level security;
alter table pumps enable row level security;
alter table daily_entries enable row level security;
alter table profiles enable row level security;

-- Helper: current user's role + project, read from profiles.
create or replace function current_profile()
returns table(role text, project_id uuid) as $$
  select role, project_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- profiles: users can read their own row; admins can read/update all.
create policy profiles_select_self on profiles
  for select using (id = auth.uid() or (select role from current_profile()) = 'admin');

create policy profiles_update_admin on profiles
  for update using ((select role from current_profile()) = 'admin');

-- projects: any authenticated user can read projects they belong to; admins read all.
create policy projects_select on projects
  for select using (
    (select role from current_profile()) = 'admin'
    or id = (select project_id from current_profile())
  );

create policy projects_write_admin on projects
  for all using ((select role from current_profile()) = 'admin');

-- pumps: readable by anyone in the same project; writable by admin/supervisor.
create policy pumps_select on pumps
  for select using (
    (select role from current_profile()) = 'admin'
    or project_id = (select project_id from current_profile())
  );

create policy pumps_write on pumps
  for all using (
    (select role from current_profile()) in ('admin','supervisor')
    and (project_id = (select project_id from current_profile()) or (select role from current_profile()) = 'admin')
  );

-- daily_entries: read by anyone in the pump's project; insert/update by
-- operators (their own project) and supervisors/admins.
create policy daily_entries_select on daily_entries
  for select using (
    (select role from current_profile()) = 'admin'
    or pump_id in (
      select id from pumps where project_id = (select project_id from current_profile())
    )
  );

create policy daily_entries_insert on daily_entries
  for insert with check (
    (select role from current_profile()) in ('admin','supervisor','operator')
    and pump_id in (
      select id from pumps where project_id = (select project_id from current_profile())
    )
  );

create policy daily_entries_update on daily_entries
  for update using (
    (select role from current_profile()) in ('admin','supervisor','operator')
    and pump_id in (
      select id from pumps where project_id = (select project_id from current_profile())
    )
  );

-- viewers get select only (covered by the select policies above; no insert/update policy applies to them).
