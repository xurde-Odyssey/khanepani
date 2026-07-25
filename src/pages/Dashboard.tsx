import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Line, Radar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { supabase } from '../lib/supabase'
import { formatBsDate, formatBsShortDate } from '../lib/bsCalendar'
import type { DailyEntry, Pump } from '../types/database'

ChartJS.register(CategoryScale, LinearScale, RadialLinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend)

interface PumpAlert {
  pump: Pump
  daysMissing: number
}

interface MonthTotals {
  operating_hours: number
  production: number
  distribution: number
  backwash_time: number
  flowmeter_total: number
}

interface PumpSnapshot {
  pump: Pump
  production: number
  operatingHours: number
  distribution: number
  avgLps: number
  flowmeterTotal: number
  productionPerHour: number
}

interface DailySnapshot {
  date: string
  production: number
  operatingHours: number
}

type DashboardPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

const DASHBOARD_PERIODS: { key: DashboardPeriod; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
]

function fmt(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0
}

function dateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function productionTotal(entries: DailyEntry[]) {
  return entries.reduce((sum, entry) => sum + (entry.production ?? 0), 0)
}

function dashboardRange(period: DashboardPeriod) {
  const today = new Date()
  const start = new Date(today)
  if (period === 'weekly') {
    start.setDate(today.getDate() - 6)
  } else if (period === 'monthly') {
    start.setDate(1)
  } else if (period === 'quarterly') {
    start.setMonth(today.getMonth() - 3)
  } else {
    start.setFullYear(today.getFullYear() - 1)
  }
  return { start: dateString(start), end: dateString(today) }
}

function labelForPeriod(period: DashboardPeriod) {
  return DASHBOARD_PERIODS.find((item) => item.key === period)?.label ?? 'Monthly'
}

export function Dashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>('monthly')
  const [pumps, setPumps] = useState<Pump[]>([])
  const [monthTotals, setMonthTotals] = useState<MonthTotals | null>(null)
  const [todayProduction, setTodayProduction] = useState(0)
  const [yesterdayProduction, setYesterdayProduction] = useState(0)
  const [pumpSnapshots, setPumpSnapshots] = useState<PumpSnapshot[]>([])
  const [dailySnapshots, setDailySnapshots] = useState<DailySnapshot[]>([])
  const [alerts, setAlerts] = useState<PumpAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: pumpRows } = await supabase.from('pumps').select('*').eq('is_active', true)
      const activePumps = (pumpRows ?? []) as Pump[]
      setPumps(activePumps)

      const { start: startStr, end: todayStr } = dashboardRange(period)
      const yesterday = new Date(`${todayStr}T00:00:00`)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = dateString(yesterday)

      const { data: entries } = await supabase
        .from('daily_entries')
        .select('*')
        .gte('entry_date', startStr)
        .lte('entry_date', todayStr)

      const monthEntries = (entries ?? []) as DailyEntry[]
      setTodayProduction(productionTotal(monthEntries.filter((entry) => entry.entry_date === todayStr)))
      if (yesterdayStr >= startStr) {
        setYesterdayProduction(productionTotal(monthEntries.filter((entry) => entry.entry_date === yesterdayStr)))
      } else {
        const { data: yesterdayEntries } = await supabase
          .from('daily_entries')
          .select('*')
          .eq('entry_date', yesterdayStr)
        setYesterdayProduction(productionTotal((yesterdayEntries ?? []) as DailyEntry[]))
      }
      const totals = monthEntries.reduce<MonthTotals>(
        (acc, row: any) => ({
          operating_hours: acc.operating_hours + (row.operating_hours ?? 0),
          production: acc.production + (row.production ?? 0),
          distribution: acc.distribution + (row.distribution ?? 0),
          backwash_time: acc.backwash_time + (row.backwash_time ?? 0),
          flowmeter_total: acc.flowmeter_total + ((row.flowmeter_end_unit ?? 0) - (row.flowmeter_start_unit ?? 0)),
        }),
        { operating_hours: 0, production: 0, distribution: 0, backwash_time: 0, flowmeter_total: 0 }
      )
      setMonthTotals(totals)

      const snapshots = activePumps.map((pump) => {
        const pumpEntries = monthEntries.filter((entry) => entry.pump_id === pump.id)
        const lpsValues = pumpEntries
          .map((entry) => entry.lps)
          .filter((value): value is number => value !== null && value !== undefined)
        const production = pumpEntries.reduce((sum, entry) => sum + (entry.production ?? 0), 0)
        const operatingHours = pumpEntries.reduce((sum, entry) => sum + (entry.operating_hours ?? 0), 0)
        return {
          pump,
          production,
          operatingHours,
          distribution: pumpEntries.reduce((sum, entry) => sum + (entry.distribution ?? 0), 0),
          avgLps: lpsValues.length > 0 ? lpsValues.reduce((sum, value) => sum + value, 0) / lpsValues.length : 0,
          flowmeterTotal: pumpEntries.reduce(
            (sum, entry) => sum + ((entry.flowmeter_end_unit ?? 0) - (entry.flowmeter_start_unit ?? 0)),
            0
          ),
          productionPerHour: safeDivide(production, operatingHours),
        }
      })
      setPumpSnapshots(snapshots)

      const startDate = new Date(`${startStr}T00:00:00`)
      const endDate = new Date(`${todayStr}T00:00:00`)
      const trendDates: string[] = []
      for (const day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
        trendDates.push(dateString(day))
      }
      setDailySnapshots(
        trendDates.map((date) => {
          const dayEntries = monthEntries.filter((entry) => entry.entry_date === date)
          return {
            date,
            production: dayEntries.reduce((sum, entry) => sum + (entry.production ?? 0), 0),
            operatingHours: dayEntries.reduce((sum, entry) => sum + (entry.operating_hours ?? 0), 0),
          }
        })
      )

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
  }, [period])

  if (loading) return <div className="text-slate-500">Loading dashboard…</div>

  const topPump = [...pumpSnapshots].sort((a, b) => b.production - a.production)[0]
  const lowPump = [...pumpSnapshots].filter((pump) => pump.operatingHours > 0).sort((a, b) => a.productionPerHour - b.productionPerHour)[0]
  const distributionPercent = safeDivide((monthTotals?.distribution ?? 0) * 100, monthTotals?.production ?? 0)
  const flowmeterVariance = (monthTotals?.production ?? 0) - (monthTotals?.flowmeter_total ?? 0)
  const selectedRange = dashboardRange(period)
  const periodLabel = labelForPeriod(period)
  const radarSnapshots = dailySnapshots.slice(-7)
  const chartOptions = { responsive: true, plugins: { legend: { position: 'top' as const } } }
  const productionTrendData = {
    labels: dailySnapshots.map((day) => formatBsShortDate(day.date)),
    datasets: [
      {
        label: 'Production',
        data: dailySnapshots.map((day) => day.production),
        borderColor: '#1E7FB8',
        backgroundColor: '#1E7FB8',
        tension: 0.25,
      },
      {
        label: 'Run hours',
        data: dailySnapshots.map((day) => day.operatingHours),
        borderColor: '#4F8A10',
        backgroundColor: '#4F8A10',
        tension: 0.25,
      },
    ],
  }
  const sevenDayRadarData = {
    labels: radarSnapshots.map((day) => formatBsShortDate(day.date)),
    datasets: [
      {
        label: 'Production',
        data: radarSnapshots.map((day) => day.production),
        borderColor: '#1E7FB8',
        backgroundColor: 'rgba(30, 127, 184, 0.18)',
        pointBackgroundColor: '#1E7FB8',
      },
      {
        label: 'Run hours',
        data: radarSnapshots.map((day) => day.operatingHours),
        borderColor: '#4F8A10',
        backgroundColor: 'rgba(79, 138, 16, 0.16)',
        pointBackgroundColor: '#4F8A10',
      },
    ],
  }
  const pumpProductionData = {
    labels: pumpSnapshots.map((row) => `#${row.pump.pump_no}`),
    datasets: [
      {
        label: `Production - ${periodLabel}`,
        data: pumpSnapshots.map((row) => row.production),
        backgroundColor: '#1E7FB8',
      },
    ],
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Operational report summary for {formatBsDate(selectedRange.start)} to {formatBsDate(selectedRange.end)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Print
          </button>
          <Link to="/reports" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
            Open reports
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-3 print:hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DASHBOARD_PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriod(item.key)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                period === item.key
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-slate-300 text-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={`Production - ${periodLabel}`}
          value={fmt(monthTotals?.production)}
          detail={
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <StatCardDetail label="Production - daily" value={fmt(todayProduction)} />
              <StatCardDetail label="Production yesterday" value={fmt(yesterdayProduction)} />
            </div>
          }
        />
        <StatCard label={`Run hours - ${periodLabel}`} value={fmt(monthTotals?.operating_hours)} />
        <StatCard label="Distribution rate" value={`${fmt(distributionPercent)}%`} />
        <StatCard label="Flowmeter variance" value={fmt(flowmeterVariance)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <InsightCard
          title="Top production pump"
          value={topPump ? `Pump #${topPump.pump.pump_no}` : '—'}
          detail={topPump ? `${fmt(topPump.production)} production, ${fmt(topPump.productionPerHour)} / hr` : 'No production data'}
        />
        <InsightCard
          title="Lowest efficiency"
          value={lowPump ? `Pump #${lowPump.pump.pump_no}` : '—'}
          detail={lowPump ? `${fmt(lowPump.productionPerHour)} production / hr` : 'No running pump data'}
        />
        <InsightCard
          title="Data alerts"
          value={String(alerts.length)}
          detail={alerts.length === 0 ? 'All active pumps have recent entries' : 'Pumps missing recent entries'}
        />
      </div>

      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-medium text-slate-800 mb-3">Pump production - {periodLabel}</h2>
        <div className="min-h-80">
          <Bar data={pumpProductionData} options={chartOptions} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-medium text-slate-800 mb-3">{periodLabel} trend</h2>
          <Line data={productionTrendData} options={chartOptions} />
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="font-medium text-slate-800 mb-3">Latest 7 days radar</h2>
          <div className="mx-auto max-w-md">
            <Radar data={sevenDayRadarData} options={chartOptions} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-medium text-slate-800">Pump glance report</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="px-3 py-2 text-left">Pump</th>
              <th className="px-3 py-2 text-right">Production</th>
              <th className="px-3 py-2 text-right">Run hours</th>
              <th className="px-3 py-2 text-right">Production / hr</th>
              <th className="px-3 py-2 text-right">Distribution</th>
              <th className="px-3 py-2 text-right">Avg LPS</th>
            </tr>
          </thead>
          <tbody>
            {pumpSnapshots.map((row) => (
              <tr key={row.pump.id} className="odd:bg-white even:bg-slate-50">
                <td className="px-3 py-2">Pump #{row.pump.pump_no} {row.pump.label}</td>
                <td className="px-3 py-2 text-right">{fmt(row.production)}</td>
                <td className="px-3 py-2 text-right">{fmt(row.operatingHours)}</td>
                <td className="px-3 py-2 text-right">{fmt(row.productionPerHour)}</td>
                <td className="px-3 py-2 text-right">{fmt(row.distribution)}</td>
                <td className="px-3 py-2 text-right">{fmt(row.avgLps, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-medium text-slate-800 mb-3">Pumps missing recent entries</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">All {pumps.length} active pumps are up to date.</p>
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

function StatCard({ label, value, detail }: { label: string; value: string; detail?: ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-brand-700 mt-1">{value}</div>
      {detail}
    </div>
  )
}

function StatCardDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function InsightCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-xl font-semibold text-slate-900 mt-1">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{detail}</div>
    </div>
  )
}
