-- Adds people, time, and location fields for pipeline maintenance records.

alter table maintenance_records
  add column if not exists no_of_people int check (no_of_people >= 0),
  add column if not exists people_names text[] not null default '{}',
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists total_time_minutes int check (total_time_minutes >= 0),
  add column if not exists location text;
