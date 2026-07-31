-- 0008_maintenance_title.sql
-- Adds a selectable maintenance title for categorizing work logs.

alter table maintenance_records
  add column if not exists title text;
