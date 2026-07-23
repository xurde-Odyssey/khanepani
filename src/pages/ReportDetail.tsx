import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { DAILY_VARIABLES, type Pump } from '../types/database'
import type { ReportPeriod } from './Reports'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

// One row per pump, one column per DAILY_VARIABLE, computed via the
// `get_period_totals` Postgres function (supabase/migrations/0003_rollups.sql),
// which applies the configurable sum/avg/end-minus-start rule per variable
// server-side so this page never recomputes totals from raw rows.
interface PumpTotals {
  pump: Pump
  totals: Record<string, number>
}

function periodToRange(period: ReportPeriod, start?: string, end?: string): { start: string; end: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (period === 'custom' && start && end) return { start, end }
  if (period === 'daily') return { start: fmt(today), end: fmt(today) }
  if (period === 'weekly') {
    const s = new Date(today)
    s.setDate(s.getDate() - 6)
    return { start: fmt(s), end: fmt(today) }
  }
  if (period === 'monthly') {
    const s = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start: fmt(s), end: fmt(today) }
  }
  if (period === 'quarterly') {
    const s = new Date(today)
    s.setMonth(s.getMonth() - 3)
    return { start: fmt(s), end: fmt(today) }
  }
  if (period === 'half_year') {
    const s = new Date(today)
    s.setMonth(s.getMonth() - 6)
    return { start: fmt(s), end: fmt(today) }
  }
  // annual
  const s = new Date(today)
  s.setFullYear(s.getFullYear() - 1)
  return { start: fmt(s), end: fmt(today) }
}

export function ReportDetail() {
  const [params] = useSearchParams()
  const pumpId = params.get('pumpId') ?? 'all'
  const period = (params.get('period') as ReportPeriod) ?? 'monthly'
  const { start, end } = periodToRange(period, params.get('start') ?? undefined, params.get('end') ?? undefined)

  const [rows, setRows] = useState<PumpTotals[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      let pumpQuery = supabase.from('pumps').select('*').order('pump_no')
      if (pumpId !== 'all') pumpQuery = pumpQuery.eq('id', pumpId)
      const { data: pumpRows } = await pumpQuery
      const pumps = (pumpRows ?? []) as Pump[]

      const results: PumpTotals[] = []
      for (const pump of pumps) {
        const { data, error } = await supabase.rpc('get_period_totals', {
          p_pump_id: pump.id,
          p_start: start,
          p_end: end,
        })
        if (error) {
          console.error(error)
          continue
        }
        const totals: Record<string, number> = {}
        for (const row of (data ?? []) as { variable: string; value: number }[]) {
          totals[row.variable] = row.value
        }
        results.push({ pump, totals })
      }
      setRows(results)
      setLoading(false)
    }
    load()
  }, [pumpId, period, start, end])

  const displayVariables = DAILY_VARIABLES.filter(
    (v) => v !== 'flowmeter_start_unit' && v !== 'flowmeter_end_unit'
  ).concat('flowmeter_total' as any)

  function exportExcel() {
    const sheetData = rows.map((r) => {
      const rec: Record<string, unknown> = { Pump: `#${r.pump.pump_no} ${r.pump.label ?? ''}` }
      for (const v of displayVariables) rec[v] = r.totals[v]?.toFixed(2) ?? ''
      return rec
    })
    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `report-${period}-${start}-to-${end}.xlsx`)
  }

  function exportPdf() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Production Report (${period}) — ${start} to ${end}`, 14, 16)
    autoTable(doc, {
      startY: 22,
      head: [['Pump', ...displayVariables]],
      body: rows.map((r) => [
        `#${r.pump.pump_no} ${r.pump.label ?? ''}`,
        ...displayVariables.map((v) => r.totals[v]?.toFixed(2) ?? '—'),
      ]),
      styles: { fontSize: 8 },
    })
    doc.save(`report-${period}-${start}-to-${end}.pdf`)
  }

  const chartData = {
    labels: rows.map((r) => `#${r.pump.pump_no}`),
    datasets: [
      {
        label: 'Operating hours',
        data: rows.map((r) => r.totals.operating_hours ?? 0),
        backgroundColor: '#1E7FB8',
      },
      {
        label: 'Production',
        data: rows.map((r) => r.totals.production ?? 0),
        backgroundColor: '#166A9C',
      },
    ],
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">
          Report — {period.replace('_', ' ')} ({start} to {end})
        </h1>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Export Excel</button>
          <button onClick={exportPdf} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Export PDF</button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow p-5">
            <Bar data={chartData} options={{ responsive: true, plugins: { legend: { position: 'top' } } }} />
          </div>

          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="bg-slate-100">
                  <th className="px-3 py-2 text-left">Pump</th>
                  {displayVariables.map((v) => (
                    <th key={v} className="px-3 py-2 text-right capitalize">{v.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pump.id} className="odd:bg-white even:bg-slate-50">
                    <td className="px-3 py-2">#{r.pump.pump_no} {r.pump.label}</td>
                    {displayVariables.map((v) => (
                      <td key={v} className="px-3 py-2 text-right">{r.totals[v]?.toFixed(2) ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
