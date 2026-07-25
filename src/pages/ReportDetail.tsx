import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, Chart, Doughnut, Line, Pie } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { bsToGregorian, daysInBsMonth, todayBs } from '../lib/bsCalendar'
import {
  REPORT_PARAMETER_OPTIONS,
  parseReportParameterKeys,
  type ReportParameterKey,
} from '../lib/reportParameters'
import { DAILY_VARIABLES, type DailyEntry, type Pump } from '../types/database'
import type { ReportPeriod } from './Reports'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend)

// One row per pump, one column per DAILY_VARIABLE, computed via the
// `get_period_totals` Postgres function (supabase/migrations/0003_rollups.sql),
// which applies the configurable sum/avg/end-minus-start rule per variable
// server-side so this page never recomputes totals from raw rows.
interface PumpTotals {
  pump: Pump
  totals: Record<string, number>
}

interface ComparisonMetrics {
  production: number
  operatingHours: number
  avgLps: number
  flowmeterTotal: number
  productionPerHour: number | null
  productionPerKld: number | null
  distributionPercent: number | null
  utilizationPercent: number | null
  backwashPercent: number | null
  flowmeterVariancePercent: number | null
  notes: string[]
}

interface ComparisonRow extends ComparisonMetrics {
  label: string
}

type NumericComparisonKey = Exclude<ReportParameterKey, 'notes'>
type ComparisonChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'combo'

const numericParameterKeys = new Set<ReportParameterKey>(
  REPORT_PARAMETER_OPTIONS.filter((option) => option.key !== 'notes').map((option) => option.key)
)
const chartColors = ['#1E7FB8', '#4F8A10', '#C27A16', '#7C3AED', '#DC2626', '#0F766E', '#475569', '#DB2777']

function parseChartType(chart: string | null): ComparisonChartType {
  return chart === 'line' || chart === 'pie' || chart === 'doughnut' || chart === 'combo' ? chart : 'bar'
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null
  return numerator / denominator
}

function formatNumber(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toFixed(2)}${suffix}`
}

function daysInclusive(start: string, end: string) {
  const startMs = new Date(`${start}T00:00:00`).getTime()
  const endMs = new Date(`${end}T00:00:00`).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  return Math.max(1, Math.round((endMs - startMs) / dayMs) + 1)
}

function metricsFromTotals(totals: Record<string, number>, availableHours: number): ComparisonMetrics {
  const production = totals.production ?? 0
  const operatingHours = totals.operating_hours ?? 0
  const avgLps = totals.lps ?? 0
  const flowmeterTotal = totals.flowmeter_total ?? 0
  const distribution = totals.distribution ?? 0
  const backwashTime = totals.backwash_time ?? 0
  const productionPerHour = safeDivide(production, operatingHours)
  const flowmeterVariancePercent = safeDivide(production - flowmeterTotal, production)

  return {
    production,
    operatingHours,
    avgLps,
    flowmeterTotal,
    productionPerHour,
    productionPerKld: safeDivide(production, flowmeterTotal / 1000),
    distributionPercent: safeDivide(distribution * 100, production),
    utilizationPercent: safeDivide(operatingHours * 100, availableHours),
    backwashPercent: safeDivide(backwashTime * 100, operatingHours),
    flowmeterVariancePercent: flowmeterVariancePercent === null ? null : flowmeterVariancePercent * 100,
    notes: [],
  }
}

function notesForMetrics(row: ComparisonMetrics, fleetAvgProductionPerHour: number) {
  const notes: string[] = []
  if (row.operatingHours > 0 && row.production <= 0) notes.push('No production during run hours')
  if (
    fleetAvgProductionPerHour > 0 &&
    row.productionPerHour !== null &&
    row.productionPerHour < fleetAvgProductionPerHour * 0.8
  ) {
    notes.push('Low production per hour')
  }
  if (row.flowmeterVariancePercent !== null && Math.abs(row.flowmeterVariancePercent) > 5) {
    notes.push('Production and flowmeter mismatch')
  }
  if (row.backwashPercent !== null && row.backwashPercent > 10) notes.push('High backwash time')
  if (row.utilizationPercent !== null && row.utilizationPercent > 90) notes.push('High utilization')
  if (row.production > 0 && row.distributionPercent !== null && row.distributionPercent < 80) {
    notes.push('Distribution below production')
  }
  return notes
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
    const bsToday = todayBs()
    return {
      start: bsToGregorian({ ...bsToday, bs_day: 1 }),
      end: bsToGregorian({
        ...bsToday,
        bs_day: daysInBsMonth(bsToday.bs_year, bsToday.bs_month),
      }),
    }
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
  const mode = params.get('mode') === 'comparison' ? 'comparison' : 'report'
  const compareBy = params.get('compareBy') === 'dates' ? 'dates' : 'pumps'
  const chartType = parseChartType(params.get('chart'))
  const { start, end } = periodToRange(period, params.get('start') ?? undefined, params.get('end') ?? undefined)
  const pumpsParam = params.get('pumps') ?? ''
  const selectedPumpIds = pumpsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const selectedParameterKeys = parseReportParameterKeys(params.get('fields'))
  const selectedColumns = REPORT_PARAMETER_OPTIONS.filter(
    (option): option is { key: NumericComparisonKey; label: string; suffix?: string } =>
      selectedParameterKeys.includes(option.key) && numericParameterKeys.has(option.key)
  )
  const showNotes = selectedParameterKeys.includes('notes')

  const [rows, setRows] = useState<PumpTotals[]>([])
  const [dateEntries, setDateEntries] = useState<DailyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      let pumpQuery = supabase.from('pumps').select('*').order('pump_no')
      if (mode === 'comparison' && selectedPumpIds.length > 0 && !selectedPumpIds.includes('all')) {
        pumpQuery = pumpQuery.in('id', selectedPumpIds)
      } else if (pumpId !== 'all') {
        pumpQuery = pumpQuery.eq('id', pumpId)
      }
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

      if (mode === 'comparison' && compareBy === 'dates') {
        const pumpIds = pumps.map((pump) => pump.id)
        if (pumpIds.length === 0) {
          setDateEntries([])
        } else {
          const { data: entries, error } = await supabase
            .from('daily_entries')
            .select('*')
            .in('pump_id', pumpIds)
            .gte('entry_date', start)
            .lte('entry_date', end)
            .order('entry_date', { ascending: true })

          if (error) {
            console.error(error)
            setDateEntries([])
          } else {
            setDateEntries((entries ?? []) as DailyEntry[])
          }
        }
      } else {
        setDateEntries([])
      }

      setLoading(false)
    }
    load()
  }, [pumpId, period, start, end, mode, compareBy, pumpsParam])

  const pumpComparisonRows = useMemo<ComparisonRow[]>(() => {
    const availableHours = daysInclusive(start, end) * 24
    const baseRows = rows.map((r) => ({
      label: `#${r.pump.pump_no} ${r.pump.label ?? ''}`.trim(),
      ...metricsFromTotals(r.totals, availableHours),
    }))

    const productiveRates = baseRows
      .map((r) => r.productionPerHour)
      .filter((value): value is number => value !== null && value > 0)
    const fleetAvgProductionPerHour =
      productiveRates.length > 0 ? productiveRates.reduce((sum, value) => sum + value, 0) / productiveRates.length : 0

    return baseRows.map((row) => ({ ...row, notes: notesForMetrics(row, fleetAvgProductionPerHour) }))
  }, [rows, start, end])

  const dateComparisonRows = useMemo<ComparisonRow[]>(() => {
    const rowsByDate = new Map<string, DailyEntry[]>()
    for (const entry of dateEntries) {
      rowsByDate.set(entry.entry_date, [...(rowsByDate.get(entry.entry_date) ?? []), entry])
    }

    const baseRows = [...rowsByDate.entries()].map(([date, entries]) => {
      const totals = entries.reduce<Record<string, number>>(
        (acc, entry) => {
          acc.operating_hours += entry.operating_hours ?? 0
          acc.production += entry.production ?? 0
          acc.backwash_time += entry.backwash_time ?? 0
          acc.backwash_unit += entry.backwash_unit ?? 0
          acc.distribution += entry.distribution ?? 0
          acc.flowmeter_total += (entry.flowmeter_end_unit ?? 0) - (entry.flowmeter_start_unit ?? 0)
          if (entry.lps !== null && entry.lps !== undefined) {
            acc.lps += entry.lps
            acc.lps_count += 1
          }
          return acc
        },
        {
          operating_hours: 0,
          production: 0,
          backwash_time: 0,
          backwash_unit: 0,
          distribution: 0,
          flowmeter_total: 0,
          lps: 0,
          lps_count: 0,
        }
      )
      totals.lps = totals.lps_count > 0 ? totals.lps / totals.lps_count : 0
      return { label: date, ...metricsFromTotals(totals, 24) }
    })

    const productiveRates = baseRows
      .map((r) => r.productionPerHour)
      .filter((value): value is number => value !== null && value > 0)
    const fleetAvgProductionPerHour =
      productiveRates.length > 0 ? productiveRates.reduce((sum, value) => sum + value, 0) / productiveRates.length : 0

    return baseRows
      .map((row) => ({ ...row, notes: notesForMetrics(row, fleetAvgProductionPerHour) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [dateEntries])

  const comparisonRows = compareBy === 'dates' ? dateComparisonRows : pumpComparisonRows
  const selectedPumpLabel =
    pumpId === 'all'
      ? 'All pumps'
      : rows[0]
        ? `Pump #${rows[0].pump.pump_no}${rows[0].pump.label ? ` - ${rows[0].pump.label}` : ''}`
        : 'Selected pump'
  const comparisonPumpLabel =
    mode === 'comparison'
      ? selectedPumpIds.includes('all') || selectedPumpIds.length === 0
        ? 'All pumps'
        : rows
            .map((row) => `Pump #${row.pump.pump_no}${row.pump.label ? ` - ${row.pump.label}` : ''}`)
            .join(', ')
      : ''
  const comparedParameterLabel =
    selectedParameterKeys
      .map((key) => REPORT_PARAMETER_OPTIONS.find((option) => option.key === key)?.label)
      .filter(Boolean)
      .join(', ')
  const chartLabel = chartType.charAt(0).toUpperCase() + chartType.slice(1)

  const displayVariables = DAILY_VARIABLES.filter(
    (v) => v !== 'flowmeter_start_unit' && v !== 'flowmeter_end_unit'
  ).concat('flowmeter_total' as any)

  function exportExcel() {
    if (mode === 'report') {
      const sheetData = rows.map((r) => {
        const rec: Record<string, unknown> = { Pump: `#${r.pump.pump_no} ${r.pump.label ?? ''}` }
        for (const v of displayVariables) rec[v] = r.totals[v]?.toFixed(2) ?? ''
        return rec
      })
      const ws = XLSX.utils.json_to_sheet(sheetData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Report')
      XLSX.writeFile(wb, `report-${period}-${start}-to-${end}.xlsx`)
      return
    }

    const comparisonData = comparisonRows.map((r) => {
      const rec: Record<string, unknown> = { [compareBy === 'dates' ? 'Date' : 'Pump']: r.label }
      for (const column of selectedColumns) {
        const value = r[column.key]
        rec[column.label] = typeof value === 'number' ? formatNumber(value, column.suffix) : ''
      }
      if (showNotes) rec.Notes = r.notes.length > 0 ? r.notes.join('; ') : 'OK'
      return rec
    })
    const ws = XLSX.utils.json_to_sheet(comparisonData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pump Comparison')
    XLSX.writeFile(wb, `report-${period}-${start}-to-${end}.xlsx`)
  }

  function exportPdf() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(
      `${mode === 'comparison' ? `${compareBy === 'dates' ? 'Date' : 'Pump'} Comparison` : 'Production Report'} (${period}) — ${start} to ${end}`,
      14,
      16
    )
    doc.setFontSize(9)
    if (mode === 'comparison') {
      doc.text(`Pumps: ${comparisonPumpLabel}`, 14, 22)
      doc.text(`Compare by: ${compareBy === 'dates' ? 'Dates' : 'Pumps'} | Graph: ${chartLabel}`, 14, 27)
      doc.text(`Parameters: ${comparedParameterLabel || 'None'}`, 14, 32)
    } else {
      doc.text(`Pump: ${selectedPumpLabel}`, 14, 22)
    }

    if (mode === 'report') {
      autoTable(doc, {
        startY: 28,
        head: [['Pump', ...displayVariables]],
        body: rows.map((r) => [
          `#${r.pump.pump_no} ${r.pump.label ?? ''}`,
          ...displayVariables.map((v) => r.totals[v]?.toFixed(2) ?? '—'),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 127, 184] },
      })
      doc.save(`report-${period}-${start}-to-${end}.pdf`)
      return
    }

    autoTable(doc, {
      startY: 38,
      head: [[compareBy === 'dates' ? 'Date' : 'Pump', ...selectedColumns.map((column) => column.label), ...(showNotes ? ['Notes'] : [])]],
      body: comparisonRows.map((r) => [
        r.label,
        ...selectedColumns.map((column) => {
          const value = r[column.key]
          return typeof value === 'number' ? formatNumber(value, column.suffix) : '—'
        }),
        ...(showNotes ? [r.notes.length > 0 ? r.notes.join('; ') : 'OK'] : []),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 127, 184] },
    })
    doc.save(`report-${period}-${start}-to-${end}.pdf`)
  }

  function printReport() {
    window.print()
  }

  const chartData = {
    labels: mode === 'comparison' ? comparisonRows.map((r) => r.label) : rows.map((r) => `#${r.pump.pump_no}`),
    datasets:
      mode === 'comparison' && (chartType === 'pie' || chartType === 'doughnut')
        ? [
            {
              label: selectedColumns[0]?.label ?? 'Value',
              data: comparisonRows.map((r) => {
                const firstColumn = selectedColumns[0]
                if (!firstColumn) return 0
                const value = r[firstColumn.key]
                return typeof value === 'number' && Number.isFinite(value) ? value : 0
              }),
              backgroundColor: comparisonRows.map((_, index) => chartColors[index % chartColors.length]),
            },
          ]
        : mode === 'comparison' && chartType === 'combo'
        ? selectedColumns.slice(0, 4).map((column, index) => ({
            type: index % 2 === 0 ? 'bar' as const : 'line' as const,
            label: column.label,
            data: comparisonRows.map((r) => {
              const value = r[column.key]
              return typeof value === 'number' && Number.isFinite(value) ? value : 0
            }),
            borderColor: chartColors[index % chartColors.length],
            backgroundColor: chartColors[index % chartColors.length],
            tension: 0.25,
          }))
        : mode === 'comparison'
        ? selectedColumns.slice(0, 4).map((column, index) => ({
            label: column.label,
            data: comparisonRows.map((r) => {
              const value = r[column.key]
              return typeof value === 'number' && Number.isFinite(value) ? value : 0
            }),
            borderColor: chartColors[index % chartColors.length],
            backgroundColor: chartColors[index % chartColors.length],
            tension: 0.25,
          }))
        : [
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
  const chartOptions = { responsive: true, plugins: { legend: { position: 'top' as const } } }

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {mode === 'comparison' ? `${compareBy === 'dates' ? 'Date' : 'Pump'} comparison` : 'Report'} — {period.replace('_', ' ')}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">Range: {start} to {end}</span>
            {mode === 'comparison' ? (
              <>
                <span className="rounded-full bg-slate-100 px-3 py-1">Compare by: {compareBy === 'dates' ? 'Dates' : 'Pumps'}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">Pumps: {comparisonPumpLabel}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">Graph: {chartLabel}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">Parameters: {comparedParameterLabel || 'None'}</span>
              </>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1">Pump: {selectedPumpLabel}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={exportExcel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Export Excel</button>
          <button onClick={exportPdf} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Export PDF</button>
          <button onClick={printReport} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Print</button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow p-5 print:shadow-none print:p-0">
            {mode === 'comparison' && selectedColumns.length === 0 ? (
              <p className="text-sm text-slate-500">Select at least one numeric parameter to draw a graph.</p>
            ) : chartType === 'line' && mode === 'comparison' ? (
              <Line data={chartData} options={chartOptions} />
            ) : chartType === 'pie' && mode === 'comparison' ? (
              <div className="mx-auto max-w-xl">
                <Pie data={chartData} options={chartOptions} />
              </div>
            ) : chartType === 'doughnut' && mode === 'comparison' ? (
              <div className="mx-auto max-w-xl">
                <Doughnut data={chartData} options={chartOptions} />
              </div>
            ) : chartType === 'combo' && mode === 'comparison' ? (
              <Chart type="bar" data={chartData} options={chartOptions} />
            ) : (
              <Bar data={chartData} options={chartOptions} />
            )}
          </div>

          {mode === 'comparison' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
                <ReportStat
                  label="Total production"
                  value={formatNumber(comparisonRows.reduce((sum, row) => sum + row.production, 0))}
                />
                <ReportStat
                  label="Total run hours"
                  value={formatNumber(comparisonRows.reduce((sum, row) => sum + row.operatingHours, 0))}
                />
                <ReportStat
                  label="Avg production / hr"
                  value={formatNumber(
                    safeDivide(
                      comparisonRows.reduce((sum, row) => sum + row.production, 0),
                      comparisonRows.reduce((sum, row) => sum + row.operatingHours, 0)
                    )
                  )}
                />
                <ReportStat
                  label={`${compareBy === 'dates' ? 'Dates' : 'Pumps'} with alerts`}
                  value={String(comparisonRows.filter((row) => row.notes.length > 0).length)}
                />
              </div>

              <div className="bg-white rounded-xl shadow overflow-x-auto print:shadow-none print:overflow-visible">
                <div className="px-4 py-3 border-b border-slate-200">
                  <h2 className="font-medium text-slate-900">
                    {compareBy === 'dates' ? 'Date-wise parameter comparison' : 'Pump performance comparison'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {compareBy === 'dates'
                      ? 'Selected pump values are grouped by date for the chosen period.'
                      : 'Derived metrics compare production pumps using output, running hours, flowmeter movement, utilization, distribution and backwash share.'}
                  </p>
                </div>
                <table className="text-sm w-full">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="px-3 py-2 text-left">{compareBy === 'dates' ? 'Date' : 'Pump'}</th>
                      {selectedColumns.map((column) => (
                        <th key={column.key} className="px-3 py-2 text-right">{column.label}</th>
                      ))}
                      {showNotes && <th className="px-3 py-2 text-left">Notes</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((r) => (
                      <tr key={r.label} className="odd:bg-white even:bg-slate-50">
                        <td className="px-3 py-2 whitespace-nowrap">{r.label}</td>
                        {selectedColumns.map((column) => {
                          const value = r[column.key]
                          return (
                            <td key={column.key} className="px-3 py-2 text-right">
                              {typeof value === 'number' ? formatNumber(value, column.suffix) : '—'}
                            </td>
                          )
                        })}
                        {showNotes && (
                          <td className="px-3 py-2 min-w-48">
                            {r.notes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {r.notes.map((note) => (
                                  <span key={note} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                    {note}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-500">OK</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl shadow overflow-x-auto print:shadow-none print:overflow-visible">
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
          )}
        </>
      )}
    </div>
  )
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-5 print:shadow-none print:border print:border-slate-200">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-brand-700 mt-1">{value}</div>
    </div>
  )
}
