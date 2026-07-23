import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { daysInBsMonth, BS_MONTHS, todayBs } from '../lib/bsCalendar'
import type { Pump, DailyEntry, BsMonth } from '../types/database'

// Mirrors the legacy Excel monthly tab: pumps as rows, BS days 1-31 as columns,
// one variable shown at a time (switch the `variable` selector), Total column
// on the right. Supervisors use this to review/back-fill a whole month fast.

const VARIABLES: { key: keyof DailyEntry; label: string }[] = [
  { key: 'operating_hours', label: 'Operating Hours' },
  { key: 'production', label: 'Production' },
  { key: 'backwash_time', label: 'Backwash Time' },
  { key: 'backwash_unit', label: 'Backwash Unit' },
  { key: 'distribution', label: 'Distribution' },
  { key: 'lps', label: 'LPS' },
]

export function BulkEntryGrid() {
  const [pumps, setPumps] = useState<Pump[]>([])
  const [entries, setEntries] = useState<DailyEntry[]>([])
  const [bsYear, setBsYear] = useState(todayBs().bs_year)
  const [bsMonth, setBsMonth] = useState<BsMonth>(todayBs().bs_month)
  const [variable, setVariable] = useState<keyof DailyEntry>('operating_hours')
  const [loading, setLoading] = useState(true)

  const days = daysInBsMonth(bsYear, bsMonth)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: pumpRows } = await supabase.from('pumps').select('*').eq('is_active', true).order('pump_no')
      setPumps((pumpRows ?? []) as Pump[])
      const { data: entryRows } = await supabase
        .from('daily_entries')
        .select('*')
        .eq('bs_year', bsYear)
        .eq('bs_month', bsMonth)
      setEntries((entryRows ?? []) as DailyEntry[])
      setLoading(false)
    }
    load()
  }, [bsYear, bsMonth])

  const grid = useMemo(() => {
    const map = new Map<string, DailyEntry>()
    for (const e of entries) map.set(`${e.pump_id}:${e.bs_day}`, e)
    return map
  }, [entries])

  function valueAt(pumpId: string, day: number): number | null {
    const e = grid.get(`${pumpId}:${day}`)
    return e ? ((e[variable] as number | null) ?? null) : null
  }

  function rowTotal(pumpId: string): number {
    let total = 0
    for (let d = 1; d <= days; d++) total += valueAt(pumpId, d) ?? 0
    return total
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Bulk Entry Grid</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm font-medium mb-1">BS Year</label>
          <input
            type="number"
            value={bsYear}
            onChange={(e) => setBsYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 w-28"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">BS Month</label>
          <select
            value={bsMonth}
            onChange={(e) => setBsMonth(e.target.value as BsMonth)}
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            {BS_MONTHS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Variable</label>
          <select
            value={variable}
            onChange={(e) => setVariable(e.target.value as keyof DailyEntry)}
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            {VARIABLES.map((v) => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="sticky left-0 bg-slate-100 px-3 py-2 text-left border-b border-slate-200">Pump</th>
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                  <th key={d} className="px-2 py-2 border-b border-slate-200 font-normal w-12 text-center">{d}</th>
                ))}
                <th className="px-3 py-2 border-b border-slate-200 font-medium bg-brand-50">Total</th>
              </tr>
            </thead>
            <tbody>
              {pumps.map((p) => (
                <tr key={p.id} className="odd:bg-white even:bg-slate-50">
                  <td className="sticky left-0 bg-inherit px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                    #{p.pump_no} {p.label ? `— ${p.label}` : ''}
                  </td>
                  {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                    const v = valueAt(p.id, d)
                    return (
                      <td key={d} className="px-2 py-2 border-b border-slate-100 text-center text-slate-700">
                        {v ?? <span className="text-slate-300">–</span>}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 border-b border-slate-100 font-medium bg-brand-50 text-center">
                    {rowTotal(p.id).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Read-only preview grid. Cell editing (click-to-edit like a spreadsheet) is the next increment —
        wire each cell to the same upsert used in the Data Entry form.
      </p>
    </div>
  )
}
