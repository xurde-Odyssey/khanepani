import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Pump } from '../types/database'

interface PumpAlert {
  pump: Pump
  daysMissing: number
}

interface MonthTotals {
  operating_hours: number
  production: number
  distribution: number
}

export function Dashboard() {
  const [pumps, setPumps] = useState<Pump[]>([])
  const [monthTotals, setMonthTotals] = useState<MonthTotals | null>(null)
  const [alerts, setAlerts] = useState<PumpAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: pumpRows } = await supabase.from('pumps').select('*').eq('is_active', true)
      const activePumps = (pumpRows ?? []) as Pump[]
      setPumps(activePumps)

      const monthStart = new Date()
      monthStart.setDate(1)
      const startStr = monthStart.toISOString().slice(0, 10)
      const todayStr = new Date().toISOString().slice(0, 10)

      const { data: entries } = await supabase
        .from('daily_entries')
        .select('operating_hours, production, distribution')
        .gte('entry_date', startStr)
        .lte('entry_date', todayStr)

      const totals = (entries ?? []).reduce<MonthTotals>(
        (acc, row: any) => ({
          operating_hours: acc.operating_hours + (row.operating_hours ?? 0),
          production: acc.production + (row.production ?? 0),
          distribution: acc.distribution + (row.distribution ?? 0),
        }),
        { operating_hours: 0, production: 0, distribution: 0 }
      )
      setMonthTotals(totals)

      // Missing-entry alerts: pumps with no daily_entries row in the last 3 days.
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      const cutoff = threeDaysAgo.toISOString().slice(0, 10)
      const pumpAlerts: PumpAlert[] = []
      for (const pump of activePumps) {
        const { data: recent } = await supabase
          .from('daily_entries')
          .select('entry_date')
          .eq('pump_id', pump.id)
          .gte('entry_date', cutoff)
          .order('entry_date', { ascending: false })
          .limit(1)
        if (!recent || recent.length === 0) {
          pumpAlerts.push({ pump, daysMissing: 3 })
        }
      }
      setAlerts(pumpAlerts)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="text-slate-500">Loading dashboard…</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Operating hours (this month)" value={monthTotals?.operating_hours.toFixed(1) ?? '—'} />
        <StatCard label="Production (this month)" value={monthTotals?.production.toFixed(1) ?? '—'} />
        <StatCard label="Distribution (this month)" value={monthTotals?.distribution.toFixed(1) ?? '—'} />
      </div>

      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-medium text-slate-800 mb-3">Pumps missing recent entries</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">All {pumps.length} active pumps are up to date. Nice.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.pump.id} className="flex items-center justify-between text-sm">
                <span>Pump #{a.pump.pump_no} {a.pump.label ? `— ${a.pump.label}` : ''}</span>
                <span className="text-amber-600 font-medium">No entry in last 3 days</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-brand-700 mt-1">{value}</div>
    </div>
  )
}
