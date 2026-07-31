-- 0007_tap_fee_fields.sql
-- Backfill Tap records if 0006_tap_maintenance.sql was already applied before fee fields were added.

alter table tap_records
  add column if not exists record_date date not null default current_date,
  add column if not exists application_request text,
  add column if not exists water_tap_installment numeric,
  add column if not exists water_tap_full_fee numeric;

alter table tap_records drop constraint if exists tap_records_ward_no_category_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tap_records_record_date_ward_no_category_key'
      and conrelid = 'tap_records'::regclass
  ) then
    alter table tap_records add constraint tap_records_record_date_ward_no_category_key unique (record_date, ward_no, category);
  end if;
end $$;
