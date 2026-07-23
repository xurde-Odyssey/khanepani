// Period-aggregation rules per variable.
//
// Confirmed with the client so far:
//   - lps: AVERAGE over the period (it's a rate, not a cumulative quantity).
//   - flowmeter: END minus START reading for the period (not summed daily deltas).
//   - production: SUMMED for most pumps, but the client said this varies
//     ("sum for some, average for some — I'll tell you later"). Rather than
//     hardcoding one rule, `PRODUCTION_OVERRIDES_BY_PUMP` lets you flip
//     individual pumps to 'avg' once you know which ones, without touching
//     any report/query code. The same override map exists server-side in
//     supabase/migrations/0003_rollups.sql (`aggregation_rules` table) so the
//     precomputed rollup view and the client agree.
//   - everything else (operating_hours, backwash_time, backwash_unit,
//     distribution): SUMMED, matching how the legacy Excel "Total" column
//     behaves for those rows.

export type AggregationRule = 'sum' | 'avg' | 'end_minus_start'

export const DEFAULT_AGGREGATION_RULES: Record<string, AggregationRule> = {
  operating_hours: 'sum',
  production: 'sum',
  backwash_time: 'sum',
  backwash_unit: 'sum',
  distribution: 'sum',
  lps: 'avg',
  // flowmeter_start_unit / flowmeter_end_unit aren't aggregated individually —
  // see FLOWMETER_TOTAL_VARIABLE below, which is derived as end - start.
}

export const FLOWMETER_TOTAL_VARIABLE = 'flowmeter_total'

// TODO: once the client confirms which pumps report production as an average
// rather than a sum, add them here, e.g. { 'pump-uuid-1': 'avg' }.
export const PRODUCTION_OVERRIDES_BY_PUMP: Record<string, AggregationRule> = {}

export function ruleFor(variable: string, pumpId?: string): AggregationRule {
  if (variable === 'production' && pumpId && PRODUCTION_OVERRIDES_BY_PUMP[pumpId]) {
    return PRODUCTION_OVERRIDES_BY_PUMP[pumpId]
  }
  return DEFAULT_AGGREGATION_RULES[variable] ?? 'sum'
}

/**
 * Aggregate an array of daily numeric values (nulls ignored) according to a rule.
 * Used for client-side chart shaping; the source of truth for report totals is
 * the `get_period_totals` Postgres function (see 0003_rollups.sql) so large date
 * ranges don't require pulling every row to the browser.
 */
export function aggregate(values: (number | null | undefined)[], rule: AggregationRule): number {
  const nums = values.filter((v): v is number => v !== null && v !== undefined)
  if (nums.length === 0) return 0
  if (rule === 'sum') return nums.reduce((a, b) => a + b, 0)
  if (rule === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length
  // end_minus_start is meaningless for an arbitrary values array; callers should
  // use flowmeterTotal() below instead.
  return nums[nums.length - 1] - nums[0]
}

export function flowmeterTotal(
  entries: { entry_date: string; flowmeter_start_unit: number | null; flowmeter_end_unit: number | null }[]
): number {
  if (entries.length === 0) return 0
  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const start = sorted[0].flowmeter_start_unit ?? 0
  const end = sorted[sorted.length - 1].flowmeter_end_unit ?? 0
  return end - start
}
