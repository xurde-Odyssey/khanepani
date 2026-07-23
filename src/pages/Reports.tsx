import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Pump } from '../types/database'

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_year' | 'annual' | 'custom'

export function Reports() {
  const navigate = useNavigate()
  const [pumps, setPumps] = useState<Pump[]>([])
  const [pumpId, setPumpId] = useState('all')
  const [period, setPeriod] = useState<ReportPeriod>('monthly')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  useEffect(() => {
    supabase.from('pumps').select('*').order('pump_no').then(({ data }) => setPumps((data ?? []) as Pump[]))
  }, [])

  function goToReport() {
    const params = new URLSearchParams({ pumpId, period })
    if (period === 'custom') {
      params.set('start', start)
      params.set('end', end)
    }
    navigate(`/reports/detail?${params.toString()}`)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Pump</label>
          <select value={pumpId} onChange={(e) => setPumpId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5">
            <option value="all">All pumps</option>
            {pumps.map((p) => (
              <option key={p.id} value={p.id}>Pump #{p.pump_no} {p.label ? `— ${p.label}` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Period</label>
          <div className="grid grid-cols-3 gap-2">
            {(['daily', 'weekly', 'monthly', 'quarterly', 'half_year', 'annual', 'custom'] as ReportPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-lg border px-3 py-2 text-sm capitalize ${period === p ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 text-slate-700'}`}
              >
                {p.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Start date</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End date</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </div>
          </div>
        )}

        <button onClick={goToReport} className="w-full rounded-lg bg-brand-600 text-white py-3 font-medium">
          Generate report
        </button>
      </div>
      <p className="text-xs text-slate-500">
        "Monthly" uses BS-month boundaries to match the legacy tabs. "Weekly", "quarterly" and "annual" use
        rolling Gregorian ranges by default — flip that in ReportDetail.tsx if you'd rather anchor quarters/years to BS.
      </p>
    </div>
  )
}
