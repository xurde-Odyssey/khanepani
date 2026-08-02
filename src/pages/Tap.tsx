import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { BsDateInput } from '../components/BsDateInput'
import { formatBsDate } from '../lib/bsCalendar'
import type { TapRecord } from '../types/database'

type TapForm = {
  record_date: string
  ward_no: string
  category: string
  tap_count: string
  water_tap_installment: string
  water_tap_full_fee: string
  remarks: string
}

const emptyTapForm: TapForm = {
  record_date: new Date().toISOString().slice(0, 10),
  ward_no: '',
  category: '',
  tap_count: '',
  water_tap_installment: '',
  water_tap_full_fee: '',
  remarks: '',
}

const counterSuggestions = ['Counter 1', 'Counter 2', 'Counter 3']

type ReportGroupKey = 'ward' | 'date' | 'counter'

type TapReportSummary = {
  key: string
  label: string
  records: number
  tapCount: number
  installment: number
  fullFee: number
}

const reportGroupOptions: { key: ReportGroupKey; label: string }[] = [
  { key: 'ward', label: 'Ward wise' },
  { key: 'date', label: 'Date wise' },
  { key: 'counter', label: 'Counter wise' },
]

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {children}
    </svg>
  )
}

function EditIcon() {
  return (
    <Icon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </Icon>
  )
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </Icon>
  )
}

function SpreadsheetIcon() {
  return (
    <Icon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
      <path d="M10 9H8" />
    </Icon>
  )
}

function PdfIcon() {
  return (
    <Icon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 15h1.5a1.5 1.5 0 0 0 0-3H8v5" />
      <path d="M13 12v5" />
      <path d="M13 12h1a2.5 2.5 0 0 1 0 5h-1" />
    </Icon>
  )
}

function PrintIcon() {
  return (
    <Icon>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </Icon>
  )
}

function toForm(record: TapRecord): TapForm {
  return {
    record_date: record.record_date,
    ward_no: String(record.ward_no),
    category: record.category,
    tap_count: String(record.tap_count),
    water_tap_installment: record.water_tap_installment == null ? '' : String(record.water_tap_installment),
    water_tap_full_fee: record.water_tap_full_fee == null ? '' : String(record.water_tap_full_fee),
    remarks: record.remarks ?? '',
  }
}

function formatMoney(value: number | null) {
  if (value == null) return '-'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function summarizeRecords(records: TapRecord[], groupBy: ReportGroupKey): TapReportSummary[] {
  const summaries = new Map<string, TapReportSummary>()

  records.forEach((record) => {
    const key = groupBy === 'ward' ? String(record.ward_no) : groupBy === 'date' ? record.record_date : record.category
    const label = groupBy === 'ward' ? `Ward ${record.ward_no}` : groupBy === 'date' ? formatBsDate(record.record_date) : key
    const summary = summaries.get(key) ?? {
      key,
      label,
      records: 0,
      tapCount: 0,
      installment: 0,
      fullFee: 0,
    }

    summary.records += 1
    summary.tapCount += record.tap_count
    summary.installment += Number(record.water_tap_installment ?? 0)
    summary.fullFee += Number(record.water_tap_full_fee ?? 0)
    summaries.set(key, summary)
  })

  return [...summaries.values()].sort((a, b) => {
    if (groupBy === 'ward') return Number(a.key) - Number(b.key)
    if (groupBy === 'date') return a.key.localeCompare(b.key)
    return a.label.localeCompare(b.label)
  })
}

export function Tap() {
  const [records, setRecords] = useState<TapRecord[]>([])
  const [form, setForm] = useState<TapForm>(emptyTapForm)
  const [reportStart, setReportStart] = useState('')
  const [reportEnd, setReportEnd] = useState('')
  const [reportGroup, setReportGroup] = useState<ReportGroupKey>('ward')
  const [preparedByName, setPreparedByName] = useState('')
  const [preparedByPosition, setPreparedByPosition] = useState('')
  const [editing, setEditing] = useState<TapRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TapRecord | null>(null)
  const [error, setError] = useState('')

  async function loadRecords() {
    const { data, error: loadError } = await supabase.from('tap_records').select('*').order('record_date', { ascending: false })
    if (loadError) {
      setError(loadError.message)
      return
    }
    setRecords(
      ((data ?? []) as TapRecord[]).sort(
        (a, b) =>
          b.record_date.localeCompare(a.record_date) ||
          a.ward_no - b.ward_no ||
          a.category.localeCompare(b.category)
      )
    )
  }

  useEffect(() => {
    loadRecords()
  }, [])

  const report = useMemo(() => {
    const filteredRecords = records.filter((record) => {
      if (reportStart && record.record_date < reportStart) return false
      if (reportEnd && record.record_date > reportEnd) return false
      return true
    })
    const totalTaps = filteredRecords.reduce((sum, record) => sum + record.tap_count, 0)
    const installmentTotal = filteredRecords.reduce((sum, record) => sum + Number(record.water_tap_installment ?? 0), 0)
    const fullFeeTotal = filteredRecords.reduce((sum, record) => sum + Number(record.water_tap_full_fee ?? 0), 0)
    return {
      filteredRecords,
      totalTaps,
      installmentTotal,
      fullFeeTotal,
      wardSummaries: summarizeRecords(filteredRecords, 'ward'),
      dateSummaries: summarizeRecords(filteredRecords, 'date'),
      counterSummaries: summarizeRecords(filteredRecords, 'counter'),
    }
  }, [records, reportStart, reportEnd])

  const activeSummaries =
    reportGroup === 'ward' ? report.wardSummaries : reportGroup === 'date' ? report.dateSummaries : report.counterSummaries
  const activeReportLabel = reportGroupOptions.find((option) => option.key === reportGroup)?.label ?? 'Tap report'
  const activeRecordTotal = report.filteredRecords.length

  const reportRows = report.filteredRecords.map((record) => ({
    Date: formatBsDate(record.record_date),
    Ward: record.ward_no,
    Counter: record.category,
    'No. of Tap': record.tap_count,
    'Water Tap Installment': record.water_tap_installment ?? '',
    'Water Tap Full Fee': record.water_tap_full_fee ?? '',
    Remarks: record.remarks ?? '',
  }))

  function reportFileName(extension: string) {
    const range = reportStart || reportEnd ? `${reportStart || 'start'}-to-${reportEnd || 'end'}` : 'all'
    return `tap-report-${reportGroup}-wise-${range}.${extension}`
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const detailSheet = XLSX.utils.json_to_sheet(reportRows)
    const summaryRows = activeSummaries.map((summary) => ({
      [activeReportLabel]: summary.label,
      Records: summary.records,
      'No. of Tap': summary.tapCount,
      Installment: summary.installment,
      'Full Fee': summary.fullFee,
    }))
    summaryRows.push({
      [activeReportLabel]: 'Total',
      Records: activeRecordTotal,
      'No. of Tap': report.totalTaps,
      Installment: report.installmentTotal,
      'Full Fee': report.fullFeeTotal,
    })
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, summarySheet, activeReportLabel)
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Tap Details')
    XLSX.writeFile(wb, reportFileName('xlsx'))
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.text(`Tap Report - ${activeReportLabel}`, 14, 14)
    doc.text(`Total taps: ${report.totalTaps}`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [[activeReportLabel, 'Records', 'No. of Tap', 'Installment', 'Full Fee']],
      body: activeSummaries.map((summary) => [
        summary.label,
        summary.records,
        summary.tapCount,
        formatMoney(summary.installment),
        formatMoney(summary.fullFee),
      ]).concat([[
        'Total',
        activeRecordTotal,
        report.totalTaps,
        formatMoney(report.installmentTotal),
        formatMoney(report.fullFeeTotal),
      ]]),
    })
    const finalY = (doc as any).lastAutoTable?.finalY ?? 28
    doc.text('Prepared by:', 14, finalY + 14)
    doc.text(`Name: ${preparedByName.trim() || '____________________'}`, 14, finalY + 22)
    doc.text(`Position: ${preparedByPosition.trim() || '____________________'}`, 14, finalY + 30)
    doc.save(reportFileName('pdf'))
  }

  async function saveRecord(e: FormEvent) {
    e.preventDefault()
    const wardText = form.ward_no.trim()
    const tapCountText = form.tap_count.trim()
    const category = form.category.trim()
    const wardNo = Number(form.ward_no)
    const tapCount = Number(form.tap_count)
    const installment = form.water_tap_installment ? Number(form.water_tap_installment) : null
    const fullFee = form.water_tap_full_fee ? Number(form.water_tap_full_fee) : null

    if (!form.record_date || !wardText || !category || !tapCountText || !wardNo || Number.isNaN(tapCount)) {
      setError('Ward, Counter, and No. of Tap are required.')
      return
    }

    setError('')
    const payload = {
      record_date: form.record_date,
      ward_no: wardNo,
      category,
      tap_count: tapCount,
      water_tap_installment: installment,
      water_tap_full_fee: fullFee,
      remarks: form.remarks.trim() || null,
    }

    const { error: saveError } = editing
      ? await supabase.from('tap_records').update(payload).eq('id', editing.id)
      : await supabase.from('tap_records').insert(payload)

    if (saveError) {
      setError(saveError.message)
      return
    }

    setForm(emptyTapForm)
    setEditing(null)
    loadRecords()
  }

  async function deleteRecord(record: TapRecord) {
    setError('')
    const { error: deleteError } = await supabase.from('tap_records').delete().eq('id', record.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setDeleteTarget(null)
    loadRecords()
  }

  function startEdit(record: TapRecord) {
    setError('')
    setEditing(record)
    setForm(toForm(record))
  }

  return (
    <div className="space-y-6 max-w-6xl print:max-w-none print:space-y-0">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold text-slate-900">Tap Records</h1>
        <p className="mt-1 text-sm text-slate-500">Ward, date, and counter tap record keeping with quick totals for reporting.</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-6 print:hidden">
        <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">{editing ? 'Edit tap record' : 'Add tap record'}</h2>
          <form onSubmit={saveRecord} className="mt-4 space-y-4">
            <BsDateInput
              label="Nepali date"
              value={form.record_date}
              onChange={(record_date) => setForm({ ...form, record_date })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Ward</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={form.ward_no}
                  onChange={(e) => setForm({ ...form, ward_no: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">No. of Tap</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.tap_count}
                  onChange={(e) => setForm({ ...form, tap_count: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Counter</label>
              <input
                list="tap-counters"
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
              <datalist id="tap-counters">
                {counterSuggestions.map((counter) => (
                  <option key={counter} value={counter} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Water Tap Installment</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.water_tap_installment}
                  onChange={(e) => setForm({ ...form, water_tap_installment: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Water Tap Full Fee</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.water_tap_full_fee}
                  onChange={(e) => setForm({ ...form, water_tap_full_fee: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Remarks</label>
              <textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white">
                {editing ? 'Save changes' : 'Add record'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null)
                    setForm(emptyTapForm)
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Tap report</h2>
              <p className="mt-1 text-xs text-slate-500">Generate totals by ward, date, or counter.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-brand-50 px-4 py-3 text-right">
              <p className="text-xs font-medium uppercase text-brand-700">Total taps</p>
              <p className="text-2xl font-semibold text-brand-800">{report.totalTaps}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-right">
              <p className="text-xs font-medium uppercase text-emerald-700">Installment</p>
              <p className="text-2xl font-semibold text-emerald-800">{formatMoney(report.installmentTotal)}</p>
            </div>
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-right">
              <p className="text-xs font-medium uppercase text-amber-700">Full fee</p>
              <p className="text-2xl font-semibold text-amber-800">{formatMoney(report.fullFeeTotal)}</p>
            </div>
            </div>
          </div>

          <div className="mt-5 space-y-3 print:hidden">
            <div className="max-w-xl space-y-3">
              <BsDateInput label="Start Nepali date" value={reportStart} onChange={setReportStart} allowClear />
              <BsDateInput label="End Nepali date" value={reportEnd} onChange={setReportEnd} allowClear />
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
              {reportGroupOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setReportGroup(option.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    reportGroup === option.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1">Prepared by name</label>
                <input
                  value={preparedByName}
                  onChange={(e) => setPreparedByName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Position</label>
                <input
                  value={preparedByPosition}
                  onChange={(e) => setPreparedByPosition(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportExcel}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <SpreadsheetIcon />
                Export Excel
              </button>
              <button
                type="button"
                onClick={exportPdf}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <PdfIcon />
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <PrintIcon />
                Print
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-4 py-3">{activeReportLabel}</th>
                  <th className="px-4 py-3 text-right">Records</th>
                  <th className="px-4 py-3 text-right">No. of Tap</th>
                  <th className="px-4 py-3 text-right">Installment</th>
                  <th className="px-4 py-3 text-right">Full Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {activeSummaries.map((summary) => (
                  <tr key={summary.key}>
                    <td className="px-4 py-3 font-medium text-slate-900">{summary.label}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{summary.records}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{summary.tapCount}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatMoney(summary.installment)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatMoney(summary.fullFee)}</td>
                  </tr>
                ))}
                {activeSummaries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      No tap records found.
                    </td>
                  </tr>
                )}
              </tbody>
              {activeSummaries.length > 0 && (
                <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{activeRecordTotal}</td>
                    <td className="px-4 py-3 text-right">{report.totalTaps}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(report.installmentTotal)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(report.fullFeeTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>

      <section className="hidden print:block">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Tap Report - {activeReportLabel}</h2>
          <p className="mt-1 text-sm">Total taps: {report.totalTaps}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{activeReportLabel}</th>
              <th>Records</th>
              <th>No. of Tap</th>
              <th>Installment</th>
              <th>Full Fee</th>
            </tr>
          </thead>
          <tbody>
            {activeSummaries.map((summary) => (
              <tr key={summary.key}>
                <td>{summary.label}</td>
                <td>{summary.records}</td>
                <td>{summary.tapCount}</td>
                <td>{formatMoney(summary.installment)}</td>
                <td>{formatMoney(summary.fullFee)}</td>
              </tr>
            ))}
            {activeSummaries.length === 0 && (
              <tr>
                <td colSpan={5}>No tap records found.</td>
              </tr>
            )}
          </tbody>
          {activeSummaries.length > 0 && (
            <tfoot>
              <tr className="font-semibold">
                <td>Total</td>
                <td>{activeRecordTotal}</td>
                <td>{report.totalTaps}</td>
                <td>{formatMoney(report.installmentTotal)}</td>
                <td>{formatMoney(report.fullFeeTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        <div className="mt-10 grid grid-cols-2 gap-12 text-sm">
          <div>
            <p className="font-semibold">Prepared by</p>
            <div className="mt-6 border-t border-slate-400 pt-2">
              <p>Name: {preparedByName.trim() || '____________________'}</p>
              <p className="mt-1">Position: {preparedByPosition.trim() || '____________________'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5 print:hidden">
        <h2 className="font-semibold text-slate-900">All tap records</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">Ward</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Counter</th>
                <th className="px-4 py-3">No. of Tap</th>
                <th className="px-4 py-3">Installment</th>
                <th className="px-4 py-3">Full Fee</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">Ward {record.ward_no}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatBsDate(record.record_date)}</td>
                  <td className="px-4 py-3 text-slate-700">{record.category}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{record.tap_count}</td>
                  <td className="px-4 py-3 text-slate-600">{formatMoney(record.water_tap_installment)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatMoney(record.water_tap_full_fee)}</td>
                  <td className="px-4 py-3 text-slate-600">{record.remarks || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(record)}
                        title="Edit tap record"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(record)}
                        title="Delete tap record"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    No tap records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Delete tap record</h2>
            <p className="mt-2 text-sm text-slate-600">
              Delete Ward {deleteTarget.ward_no} {deleteTarget.category} record?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteRecord(deleteTarget)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
              >
                Delete record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
