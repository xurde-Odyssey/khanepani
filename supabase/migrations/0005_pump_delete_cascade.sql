-- 0005_pump_delete_cascade.sql
-- Allow deleting pumps from Admin by cascading related daily entries and
-- per-pump aggregation rule overrides.

alter table daily_entries
  drop constraint if exists daily_entries_pump_id_fkey,
  add constraint daily_entries_pump_id_fkey
    foreign key (pump_id) references pumps(id) on delete cascade;

alter table aggregation_rules
  drop constraint if exists aggregation_rules_pump_id_fkey,
  add constraint aggregation_rules_pump_id_fkey
    foreign key (pump_id) references pumps(id) on delete cascade;

drop policy if exists daily_entries_delete on daily_entries;

create policy daily_entries_delete on daily_entries
  for delete using (auth.role() = 'authenticated');
