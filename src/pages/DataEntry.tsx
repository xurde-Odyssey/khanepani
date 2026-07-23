import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { todayBs, bsToGregorian, BS_MONTHS } from '../lib/bsCalendar'
import type { DailyEntry, Pump, BsMonth } from '../types/database'

const FIELDS: { key: string; label: string; step?: string }[] = [
  { key: 'operating_hours', label: 'Operating hours', step: '0.1' },
  { key: 'flowmeter_start_unit', label: 'Flowmeter start', step: '1' },
  { key: 'flowmeter_end_unit', label: 'Flowmeter end', step: '1' },
  { key: 'production', label: 'Production', step: '0.1' },
  { key: 'backwash_time', label: 'Backwash time (hrs)', step: '0.1' },
  { key: 'backwash_unit', label: 'Backwash unit', step: '0.1' },
  { key: 'distribution', label: 'Distribution', step: '0.1' },
  { key: 'lps', label: 'LPS', step: '0.01' },
]

export function DataEntry() {
  const { profile } = useAuth()
  const [pumps, setPumps] = useState<Pump[]>([])
  const [pumpId, setPumpId] = useState('')
  const [bsYear, setBsYear] = useState(todayBs().bs_year)
  const [bsMonth, setBsMonth] = useState<BsMonth>(todayBs().bs_month)
  const [bsDay, setBsDay] = useState(todayBs().bs_day)
  const [values, setValues] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    supabase
      .from('pumps')
      .select('*')
      .eq('is_active', true)
      .then(({ data }) => {
        const rows = (data ?? []) as Pump[]
        setPumps(rows)
        if (rows[0]) setPumpId(rows[0].id)
      })
  }, [])

  function update(key: string, val: string) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')

    const start = values.flowmeter_start_unit ? Number(values.flowmeter_start_unit) : null
    const end = values.flowmeter_end_unit ? Number(values.flowmeter_end_unit) : null
    if (start !== null && end !== null && end < start) {
      setStatus('error')
      setErrorMsg('Flowmeter end must be greater than or equal to flowmeter start.')
      return
    }

    const entry_date = bsToGregorian({ bs_year: bsYear, bs_month: bsMonth, bs_day: bsDay })

    const payload: Partial<DailyEntry> = {
      pump_id: pumpId,
      entry_date,
      bs_year: bsYear,
      bs_month: bsMonth,
      bs_day: bsDay,
      entered_by: profile?.id,
    }
    for (const f of FIELDS) {
      payload[f.key as keyof DailyEntry] = values[f.key] ? Number(values[f.key]) : null
    }

    const { error } = await supabase.from('daily_entries').upsert(payload, { onConflict: 'pump_id,entry_date' })
    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('saved')
      setValues({})
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-slate-900 mb-4">Daily Data Entry</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Pump</label>
          <select
            value={pumpId}
            onChange={(e) => setPumpId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          >
            {pumps.map((p) => (
              <option key={p.id} value={p.id}>
                Pump #{p.pump_no} {p.label ? `— ${p.label}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">BS Year</label>
            <input
              type="number"
              inputMode="numeric"
              value={bsYear}
              onChange={(e) => setBsYear(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">BS Month</label>
            <select
              value={bsMonth}
              onChange={(e) => setBsMonth(e.target.value as BsMonth)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            >
              {BS_MONTHS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">BS Day</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={32}
              value={bsDay}
              onChange={(e) => setBsDay(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              <input
                type="number"
                inputMode="decimal"
                step={f.step}
                value={values[f.key] ?? ''}
                onChange={(e) => update(f.key, e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
              />
            </div>
          ))}
        </div>

        {status === 'error' && <p className="text-sm text-red-600">{errorMsg}</p>}
        {status === 'saved' && <p className="text-sm text-green-600">Entry saved.</p>}

        <button
          type="submit"
          disabled={status === 'saving' || !pumpId}
          className="w-full rounded-lg bg-brand-600 text-white py-3 font-medium disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Save entry'}
        </button>
      </form>
    </div>
  )
}
