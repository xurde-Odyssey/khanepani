import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_REPORT_PARAMETER_KEYS,
  REPORT_PARAMETER_OPTIONS,
  type ReportParameterKey,
} from '../lib/reportParameters'
import { BS_MONTHS, bsToGregorian, daysInBsMonth, formatBsDate, todayBs } from '../lib/bsCalendar'
import type { BsMonth, Pump } from '../types/database'

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half_year' | 'annual' | 'custom'
type ComparisonAxis = 'pumps' | 'dates'
type ComparisonChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'combo'
type DateCalendar = 'ad' | 'bs'

export function Reports() {
  const navigate = useNavigate()
  const [pumps, setPumps] = useState<Pump[]>([])
  const [pumpId, setPumpId] = useState('all')
  const [period, setPeriod] = useState<ReportPeriod>('monthly')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [comparisonAxis, setComparisonAxis] = useState<ComparisonAxis>('pumps')
  const [comparisonDateCalendar, setComparisonDateCalendar] = useState<DateCalendar>('bs')
  const [comparisonStart, setComparisonStart] = useState('')
  const [comparisonEnd, setComparisonEnd] = useState('')
  const [comparisonStartBsYear, setComparisonStartBsYear] = useState(() => todayBs().bs_year)
  const [comparisonStartBsMonth, setComparisonStartBsMonth] = useState<BsMonth>(() => todayBs().bs_month)
  const [comparisonStartBsDay, setComparisonStartBsDay] = useState(() => todayBs().bs_day)
  const [comparisonEndBsYear, setComparisonEndBsYear] = useState(() => todayBs().bs_year)
  const [comparisonEndBsMonth, setComparisonEndBsMonth] = useState<BsMonth>(() => todayBs().bs_month)
  const [comparisonEndBsDay, setComparisonEndBsDay] = useState(() => todayBs().bs_day)
  const [comparisonChartType, setComparisonChartType] = useState<ComparisonChartType>('bar')
  const [selectedComparisonPumpIds, setSelectedComparisonPumpIds] = useState<string[]>([])
  const [selectedParameters, setSelectedParameters] = useState<ReportParameterKey[]>(DEFAULT_REPORT_PARAMETER_KEYS)
  const isComparisonStartBsDayInvalid =
    comparisonStartBsDay < 1 || comparisonStartBsDay > daysInBsMonth(comparisonStartBsYear, comparisonStartBsMonth)
  const isComparisonEndBsDayInvalid =
    comparisonEndBsDay < 1 || comparisonEndBsDay > daysInBsMonth(comparisonEndBsYear, comparisonEndBsMonth)
  const comparisonStartDate =
    comparisonDateCalendar === 'bs' && !isComparisonStartBsDayInvalid
      ? bsToGregorian({
          bs_year: comparisonStartBsYear,
          bs_month: comparisonStartBsMonth,
          bs_day: comparisonStartBsDay,
        })
      : comparisonStart
  const comparisonEndDate =
    comparisonDateCalendar === 'bs' && !isComparisonEndBsDayInvalid
      ? bsToGregorian({
          bs_year: comparisonEndBsYear,
          bs_month: comparisonEndBsMonth,
          bs_day: comparisonEndBsDay,
        })
      : comparisonEnd
  const isComparisonDateMissing =
    comparisonAxis === 'dates' &&
    comparisonDateCalendar === 'ad' &&
    (!comparisonStart || !comparisonEnd)
  const isComparisonDateRangeInvalid =
    comparisonAxis === 'dates' &&
    Boolean(comparisonStartDate && comparisonEndDate && comparisonStartDate > comparisonEndDate)
  const isComparisonBsDateInvalid =
    comparisonAxis === 'dates' &&
    comparisonDateCalendar === 'bs' &&
    (isComparisonStartBsDayInvalid || isComparisonEndBsDayInvalid)
  const isComparisonDisabled =
    selectedParameters.length === 0 ||
    selectedComparisonPumpIds.length === 0 ||
    (comparisonAxis === 'dates' && (isComparisonDateMissing || isComparisonBsDateInvalid || isComparisonDateRangeInvalid))

  useEffect(() => {
    supabase.from('pumps').select('*').order('pump_no').then(({ data }) => {
      const rows = (data ?? []) as Pump[]
      setPumps(rows)
      setSelectedComparisonPumpIds(rows.map((pump) => pump.id))
    })
  }, [])

  function goToReport() {
    const params = new URLSearchParams({ pumpId, period })
    if (period === 'custom') {
      params.set('start', start)
      params.set('end', end)
    }
    navigate(`/reports/detail?${params.toString()}`)
  }

  function goToComparison() {
    const comparisonPeriod = comparisonAxis === 'dates' ? 'custom' : period
    const params = new URLSearchParams({ pumpId, period: comparisonPeriod, mode: 'comparison', compareBy: comparisonAxis })
    params.set('fields', selectedParameters.join(','))
    params.set('pumps', selectedComparisonPumpIds.length === pumps.length ? 'all' : selectedComparisonPumpIds.join(','))
    params.set('chart', comparisonChartType)
    if (comparisonAxis === 'dates') {
      params.set('start', comparisonStartDate)
      params.set('end', comparisonEndDate)
      params.set('calendar', comparisonDateCalendar)
    } else if (period === 'custom') {
      params.set('start', start)
      params.set('end', end)
    }
    navigate(`/reports/detail?${params.toString()}`)
  }

  function toggleParameter(key: ReportParameterKey) {
    setSelectedParameters((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    )
  }

  function toggleComparisonPump(pumpId: string) {
    setSelectedComparisonPumpIds((current) =>
      current.includes(pumpId) ? current.filter((id) => id !== pumpId) : [...current, pumpId]
    )
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">Generate standard reports or build targeted pump comparisons.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-6">
      <section className="bg-white rounded-xl shadow border border-slate-100 p-5 space-y-5">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="font-semibold text-slate-900">Standard report</h2>
          <p className="mt-1 text-xs text-slate-500">Use this for the regular period total report.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Pump</label>
          <select value={pumpId} onChange={(e) => setPumpId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="all">All pumps</option>
            {pumps.map((p) => (
              <option key={p.id} value={p.id}>Pump #{p.pump_no} {p.label ? `— ${p.label}` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Period</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5 space-y-5">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h2 className="font-semibold text-slate-900">Parameter comparison</h2>
              <p className="text-xs text-slate-500 mt-1">Choose how to compare selected pump values.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedParameters(DEFAULT_REPORT_PARAMETER_KEYS)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedParameters([
                    'production',
                    'operatingHours',
                    'avgLps',
                    'flowmeterTotal',
                    'productionPerHour',
                    'notes',
                  ])
                }
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
              >
                Basic
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 mb-4">
            <label className="block text-sm font-medium mb-1">Compare by</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['pumps', 'Pumps'],
                ['dates', 'Dates'],
              ] as [ComparisonAxis, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setComparisonAxis(value)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    comparisonAxis === value
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {comparisonAxis === 'dates' && (
            <div className="rounded-lg border border-slate-200 p-3 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <label className="block text-sm font-medium">Date range</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['bs', 'Nepali'],
                    ['ad', 'English'],
                  ] as [DateCalendar, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setComparisonDateCalendar(value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${
                        comparisonDateCalendar === value
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'border-slate-300 text-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {comparisonDateCalendar === 'bs' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <BsDateFields
                    label="Start Nepali date"
                    year={comparisonStartBsYear}
                    month={comparisonStartBsMonth}
                    day={comparisonStartBsDay}
                    onYearChange={setComparisonStartBsYear}
                    onMonthChange={setComparisonStartBsMonth}
                    onDayChange={setComparisonStartBsDay}
                  />
                  <BsDateFields
                    label="End Nepali date"
                    year={comparisonEndBsYear}
                    month={comparisonEndBsMonth}
                    day={comparisonEndBsDay}
                    onYearChange={setComparisonEndBsYear}
                    onMonthChange={setComparisonEndBsMonth}
                    onDayChange={setComparisonEndBsDay}
                  />
                  <p className="sm:col-span-2 text-xs text-slate-500">
                    Selected range: {comparisonStartDate ? formatBsDate(comparisonStartDate) : '—'} to{' '}
                    {comparisonEndDate ? formatBsDate(comparisonEndDate) : '—'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Start date</label>
                    <input
                      type="date"
                      value={comparisonStart}
                      onChange={(e) => setComparisonStart(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">End date</label>
                    <input
                      type="date"
                      value={comparisonEnd}
                      onChange={(e) => setComparisonEnd(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                    />
                  </div>
                </div>
              )}

              {isComparisonDateMissing && (
                <p className="mt-2 text-xs text-amber-700">Select both start and end dates for date comparison.</p>
              )}
              {isComparisonBsDateInvalid && (
                <p className="mt-2 text-xs text-amber-700">
                  Nepali day must fit the selected BS month and year.
                </p>
              )}
              {isComparisonDateRangeInvalid && (
                <p className="mt-2 text-xs text-amber-700">
                  Start date must be before or equal to end date.
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-3 mb-4">
            <label className="block text-sm font-medium mb-1">Graph type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                ['bar', 'Bar'],
                ['line', 'Line'],
                ['pie', 'Pie'],
                ['doughnut', 'Doughnut'],
                ['combo', 'Combo'],
              ] as [ComparisonChartType, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setComparisonChartType(value)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    comparisonChartType === value
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <label className="block text-sm font-medium">Pumps to compare</label>
                <p className="text-xs text-slate-500">{selectedComparisonPumpIds.length} of {pumps.length} selected</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedComparisonPumpIds(pumps.map((pump) => pump.id))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedComparisonPumpIds([])}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pumps.map((pump) => (
                <SwitchRow
                  key={pump.id}
                  checked={selectedComparisonPumpIds.includes(pump.id)}
                  label={`Pump #${pump.pump_no}${pump.label ? ` - ${pump.label}` : ''}`}
                  onToggle={() => toggleComparisonPump(pump.id)}
                />
              ))}
            </div>
            {selectedComparisonPumpIds.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">Select at least one pump for comparison.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2">
              <label className="block text-sm font-medium">Parameters</label>
              <p className="text-xs text-slate-500">{selectedParameters.length} of {REPORT_PARAMETER_OPTIONS.length} selected</p>
            </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REPORT_PARAMETER_OPTIONS.map((option) => (
              <SwitchRow
                key={option.key}
                checked={selectedParameters.includes(option.key)}
                label={option.label}
                onToggle={() => toggleParameter(option.key)}
              />
            ))}
          </div>
          {selectedParameters.length === 0 && (
            <p className="mt-2 text-xs text-amber-700">Select at least one parameter for the comparison report.</p>
          )}
          </div>
        </div>

        <button
          onClick={goToComparison}
          disabled={isComparisonDisabled}
          className="w-full rounded-lg bg-brand-600 text-white py-3 font-medium disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Generate comparison
        </button>
      </section>
      </div>
      <p className="text-xs text-slate-500">
        "Monthly" uses BS-month boundaries to match the legacy tabs. "Weekly", "quarterly" and "annual" use
        rolling Gregorian ranges by default — flip that in ReportDetail.tsx if you'd rather anchor quarters/years to BS.
      </p>
    </div>
  )
}

function BsDateFields({
  label,
  year,
  month,
  day,
  onYearChange,
  onMonthChange,
  onDayChange,
}: {
  label: string
  year: number
  month: BsMonth
  day: number
  onYearChange: (value: number) => void
  onMonthChange: (value: BsMonth) => void
  onDayChange: (value: number) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="grid grid-cols-[1fr_1.25fr_0.8fr] gap-2">
        <input
          type="number"
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
        <select
          value={month}
          onChange={(e) => onMonthChange(e.target.value as BsMonth)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
        >
          {BS_MONTHS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={33}
          value={day}
          onChange={(e) => onDayChange(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>
    </div>
  )
}

function SwitchRow({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
        checked ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-slate-200 bg-white text-slate-700'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? 'bg-brand-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
            checked ? 'left-4' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
