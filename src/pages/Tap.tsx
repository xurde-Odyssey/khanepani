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

export function Tap() {
  const [records, setRecords] = useState<TapRecord[]>([])
  const [form, setForm] = useState<TapForm>(emptyTapForm)
  const [reportStart, setReportStart] = useState('')
  const [reportEnd, setReportEnd] = useState('')
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
    const wardTotals = new Map<number, number>()
    const categoryTotals = new Map<string, number>()

    filteredRecords.forEach((record) => {
      wardTotals.set(record.ward_no, (wardTotals.get(record.ward_no) ?? 0) + record.tap_count)
      categoryTotals.set(record.category, (categoryTotals.get(record.category) ?? 0) + record.tap_count)
    })

    return {
      filteredRecords,
      totalTaps,
      installmentTotal,
      fullFeeTotal,
      wards: [...wardTotals.entries()].sort(([a], [b]) => a - b),
      categories: [...categoryTotals.entries()].sort(([a], [b]) => a.localeCompare(b)),
    }
  }, [records, reportStart, reportEnd])

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
    return `tap-report-${range}.${extension}`
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(reportRows)
    XLSX.utils.book_append_sheet(wb, ws, 'Tap Report')
    XLSX.writeFile(wb, reportFileName('xlsx'))
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.text('Tap Report', 14, 14)
    doc.text(`Total taps: ${report.totalTaps}`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [['Date', 'Ward', 'Counter', 'No. of Tap', 'Installment', 'Full Fee', 'Remarks']],
      body: report.filteredRecords.map((record) => [
        formatBsDate(record.record_date),
        `Ward ${record.ward_no}`,
        record.category,
        record.tap_count,
        formatMoney(record.water_tap_installment),
        formatMoney(record.water_tap_full_fee),
        record.remarks ?? '',
      ]),
    })
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
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tap Records</h1>
        <p className="mt-1 text-sm text-slate-500">Ward-wise tap record keeping with quick totals for reporting.</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-6">
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
              <p className="mt-1 text-xs text-slate-500">Total taps by ward and counter.</p>
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
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportExcel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Export Excel
              </button>
              <button type="button" onClick={exportPdf} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Export PDF
              </button>
              <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Print
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Ward totals</h3>
              <div className="mt-3 space-y-2">
                {report.wards.map(([ward, total]) => (
                  <div key={ward} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Ward {ward}</span>
                    <span className="font-semibold text-slate-900">{total}</span>
                  </div>
                ))}
                {report.wards.length === 0 && <p className="text-sm text-slate-500">No tap records yet.</p>}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-800">Counter totals</h3>
              <div className="mt-3 space-y-2">
                {report.categories.map(([category, total]) => (
                  <div key={category} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-slate-600">{category}</span>
                    <span className="font-semibold text-slate-900">{total}</span>
                  </div>
                ))}
                {report.categories.length === 0 && <p className="text-sm text-slate-500">No counter totals yet.</p>}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
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
