-- 0003_rollups.sql
-- Configurable per-variable aggregation + a fast period-totals function so
-- reports don't pull thousands of rows to the client and recompute totals
-- in JS. Mirrors src/lib/aggregation.ts — keep the two in sync.

-- Default rule per variable. 'sum' for cumulative counters (operating hours,
-- backwash, distribution), 'avg' for lps (a rate). Production defaults to
-- 'sum' but the client says some pumps should average instead — see the
-- per-pump override table below.
create table aggregation_rules (
  variable text not null,
  pump_id uuid references pumps(id), -- null = default rule for all pumps
  rule text not null check (rule in ('sum','avg')),
  primary key (variable, pump_id)
);

insert into aggregation_rules (variable, pump_id, rule) values
  ('operating_hours', null, 'sum'),
  ('production',      null, 'sum'),  -- TODO: insert a (variable, pump_id, 'avg') row per pump once confirmed
  ('backwash_time',   null, 'sum'),
  ('backwash_unit',   null, 'sum'),
  ('distribution',    null, 'sum'),
  ('lps',             null, 'avg');

-- Returns one (variable, value) row per tracked variable for a pump over a
-- date range, applying the configured rule. Flowmeter is handled specially
-- as (last end reading - first start reading) in the range, per the client's
-- confirmed rule, rather than a sum/avg of daily deltas.
create or replace function get_period_totals(p_pump_id uuid, p_start date, p_end date)
returns table(variable text, value numeric) as $$
  with agg as (
    select
      'operating_hours'::text as variable, sum(operating_hours) as sum_val, avg(operating_hours) as avg_val
      from daily_entries where pump_id = p_pump_id and entry_date between p_start and p_end
    union all
    select 'production', sum(production), avg(production)
      from daily_entries where pump_id = p_pump_id and entry_date between p_start and p_end
    union all
    select 'backwash_time', sum(backwash_time), avg(backwash_time)
      from daily_entries where pump_id = p_pump_id and entry_date between p_start and p_end
    union all
    select 'backwash_unit', sum(backwash_unit), avg(backwash_unit)
      from daily_entries where pump_id = p_pump_id and entry_date between p_start and p_end
    union all
    select 'distribution', sum(distribution), avg(distribution)
      from daily_entries where pump_id = p_pump_id and entry_date between p_start and p_end
    union all
    select 'lps', sum(lps), avg(lps)
      from daily_entries where pump_id = p_pump_id and entry_date between p_start and p_end
  ),
  ruled as (
    select
      agg.variable,
      coalesce(
        (select rule from aggregation_rules r where r.variable = agg.variable and r.pump_id = p_pump_id),
        (select rule from aggregation_rules r where r.variable = agg.variable and r.pump_id is null),
        'sum'
      ) as rule,
      agg.sum_val,
      agg.avg_val
    from agg
  ),
  flow as (
    select
      'flowmeter_total'::text as variable,
      coalesce(
        (select flowmeter_end_unit from daily_entries
         where pump_id = p_pump_id and entry_date between p_start and p_end
         order by entry_date desc limit 1), 0
      ) - coalesce(
        (select flowmeter_start_unit from daily_entries
         where pump_id = p_pump_id and entry_date between p_start and p_end
         order by entry_date asc limit 1), 0
      ) as value
  )
  select variable, case when rule = 'avg' then avg_val else sum_val end as value from ruled
  union all
  select variable, value from flow;
$$ language sql stable;

-- Convenience view for "all pumps" report rows without N calls to get_period_totals
-- from the client. Not period-parameterized (that's what the function above is
-- for); this view is handy for ad-hoc SQL/BI use.
create view v_daily_entries_enriched as
  select de.*, p.pump_no, p.label as pump_label, p.project_id
  from daily_entries de
  join pumps p on p.id = de.pump_id;
