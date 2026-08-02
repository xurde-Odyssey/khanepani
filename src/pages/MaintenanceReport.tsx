import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { BsDateInput } from '../components/BsDateInput'
import { formatBsDate, gregorianToBs } from '../lib/bsCalendar'
import type { MaintenanceReportItem, MaintenanceReportTitle } from '../types/database'

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly'

type MaintenanceReportForm = {
  report_date: string
  title: string
  item_count: string
  remarks: string
}

type ReportSummary = {
  key: string
  title: string
  label: string
  totalItems: number
  records: number
}

const emptyForm: MaintenanceReportForm = {
  report_date: new Date().toISOString().slice(0, 10),
  title: '',
  item_count: '',
  remarks: '',
}

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

function toForm(record: MaintenanceReportItem): MaintenanceReportForm {
  return {
    report_date: record.report_date,
    title: record.title,
    item_count: String(record.item_count),
    remarks: record.remarks ?? '',
  }
}

function startOfWeek(date: Date) {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function periodLabel(dateStr: string, period: ReportPeriod) {
  if (period === 'daily') return { key: dateStr, label: formatBsDate(dateStr) }

  const date = new Date(`${dateStr}T00:00:00`)
  if (period === 'weekly') {
    const start = startOfWeek(date)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return {
      key: isoDate(start),
      label: `${formatBsDate(isoDate(start))} to ${formatBsDate(isoDate(end))}`,
    }
  }

  const bs = gregorianToBs(dateStr)
  if (period === 'monthly') return { key: `${bs.bs_year}-${bs.bs_month}`, label: `${bs.bs_year} ${bs.bs_month}` }
  return { key: String(bs.bs_year), label: String(bs.bs_year) }
}

function summarize(records: MaintenanceReportItem[], period: ReportPeriod) {
  const summaries = new Map<string, ReportSummary>()

  records.forEach((record) => {
    const periodValue = periodLabel(record.report_date, period)
    const key = `${record.title}-${periodValue.key}`
    const summary = summaries.get(key) ?? {
      key,
      title: record.title,
      label: periodValue.label,
      totalItems: 0,
      records: 0,
    }
    summary.totalItems += record.item_count
    summary.records += 1
    summaries.set(key, summary)
  })

  return [...summaries.entries()]
    .map(([, summary]) => summary)
    .sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key))
}

export function MaintenanceReport() {
  const [records, setRecords] = useState<MaintenanceReportItem[]>([])
  const [titles, setTitles] = useState<MaintenanceReportTitle[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [form, setForm] = useState<MaintenanceReportForm>(emptyForm)
  const [reportStart, setReportStart] = useState('')
  const [reportEnd, setReportEnd] = useState('')
  const [reportTitle, setReportTitle] = useState('')
  const [period, setPeriod] = useState<ReportPeriod>('daily')
  const [editing, setEditing] = useState<MaintenanceReportItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceReportItem | null>(null)
  const [error, setError] = useState('')

  async function loadRecords() {
    const [{ data, error: reportError }, { data: titleData, error: titleError }] = await Promise.all([
      supabase.from('maintenance_report_items').select('*').order('report_date', { ascending: false }),
      supabase.from('maintenance_report_titles').select('*').eq('is_active', true).order('title'),
    ])
    if (reportError) {
      setError(reportError.message)
      return
    }
    if (titleError) {
      setError(titleError.message)
      return
    }
    setRecords((data ?? []) as MaintenanceReportItem[])
    setTitles((titleData ?? []) as MaintenanceReportTitle[])
  }

  useEffect(() => {
    loadRecords()
  }, [])

  const titleOptions = useMemo(
    () =>
      [...new Set([...titles.map((record) => record.title), ...records.map((record) => record.title).filter(Boolean)])].sort(),
    [titles, records]
  )

  const reportRecords = useMemo(
    () =>
      records.filter((record) => {
        if (reportStart && record.report_date < reportStart) return false
        if (reportEnd && record.report_date > reportEnd) return false
        if (reportTitle && record.title !== reportTitle) return false
        return true
      }),
    [records, reportStart, reportEnd, reportTitle]
  )
  const reportSummaries = useMemo(() => summarize(reportRecords, period), [reportRecords, period])
  const totalItems = reportRecords.reduce((sum, record) => sum + record.item_count, 0)

  async function addTitle(e: FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return

    setError('')
    const { data: createdTitle, error: titleSaveError } = await supabase
      .from('maintenance_report_titles')
      .insert({ title, is_active: true })
      .select()
      .single()
    if (titleSaveError) {
      setError(titleSaveError.message)
      return
    }

    if (createdTitle) setTitles((current) => [...current, createdTitle as MaintenanceReportTitle])
    setForm((current) => ({ ...current, title }))
    setNewTitle('')
  }

  async function saveRecord(e: FormEvent) {
    e.preventDefault()
    const title = form.title.trim()
    const itemCount = Number(form.item_count)
    if (!form.report_date || !title || !form.item_count.trim() || Number.isNaN(itemCount) || itemCount < 0) {
      setError('Date, Title, and No of items are required.')
      return
    }

    setError('')
    const payload = {
      report_date: form.report_date,
      title,
      item_count: itemCount,
      remarks: form.remarks.trim() || null,
    }
    const { error: saveError } = editing
      ? await supabase.from('maintenance_report_items').update(payload).eq('id', editing.id)
      : await supabase.from('maintenance_report_items').insert(payload)

    if (saveError) {
      setError(saveError.message)
      return
    }

    setForm(emptyForm)
    setEditing(null)
    loadRecords()
  }

  async function deleteRecord(record: MaintenanceReportItem) {
    setError('')
    const { error: deleteError } = await supabase.from('maintenance_report_items').delete().eq('id', record.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setDeleteTarget(null)
    loadRecords()
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(
      reportSummaries.map((summary) => ({
        Title: summary.title,
        Period: summary.label,
        Records: summary.records,
        'No of items': summary.totalItems,
      }))
    )
    XLSX.utils.book_append_sheet(wb, ws, 'Maintenance Report')
    XLSX.writeFile(wb, `maintenance-report-${period}.xlsx`)
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.text(`Maintenance Report - ${period}`, 14, 14)
    doc.text(`Total items: ${totalItems}`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [['Title', 'Period', 'Records', 'No of items']],
      body: reportSummaries.map((summary) => [summary.title, summary.label, summary.records, summary.totalItems]),
    })
    doc.save(`maintenance-report-${period}.pdf`)
  }

  return (
    <div className="space-y-6 max-w-6xl print:max-w-none print:space-y-0">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold text-slate-900">Maintenance Report</h1>
        <p className="mt-1 text-sm text-slate-500">Record maintenance item counts by title and generate daily, weekly, monthly, or yearly reports.</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{error}</p>}

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Maintenance report titles</h2>
            <p className="mt-1 text-xs text-slate-500">{titleOptions.length} title{titleOptions.length === 1 ? '' : 's'} available.</p>
          </div>
        </div>
        <form onSubmit={addTitle} className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium mb-1">New title</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <button className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm">Add Title</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {titleOptions.map((title) => (
            <span key={title} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
              {title}
            </span>
          ))}
          {titleOptions.length === 0 && <p className="text-sm text-slate-500">No maintenance report titles found.</p>}
        </div>
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5 print:hidden">
        <h2 className="font-semibold text-slate-900">{editing ? 'Edit maintenance report item' : 'Add maintenance report item'}</h2>
        <form onSubmit={saveRecord} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          <BsDateInput label="Nepali date" value={form.report_date} onChange={(report_date) => setForm({ ...form, report_date })} />
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              list="maintenance-report-title-options"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <datalist id="maintenance-report-title-options">
              {titleOptions.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">No of items</label>
            <input
              type="number"
              min="0"
              required
              value={form.item_count}
              onChange={(e) => setForm({ ...form, item_count: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Remarks</label>
            <input
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="md:col-span-4 flex gap-2">
            <button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white">
              {editing ? 'Save changes' : 'Add item'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null)
                  setForm(emptyForm)
                }}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5 print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <h2 className="font-semibold text-slate-900">Report generation</h2>
            <p className="mt-1 text-xs text-slate-500">{reportRecords.length} selected record{reportRecords.length === 1 ? '' : 's'}.</p>
          </div>
          <div className="rounded-lg bg-brand-50 px-4 py-3 text-right">
            <p className="text-xs font-medium uppercase text-brand-700">Total items</p>
            <p className="text-2xl font-semibold text-brand-800">{totalItems}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3 print:hidden">
          <div className="max-w-xl space-y-3">
            <BsDateInput label="Start Nepali date" value={reportStart} onChange={setReportStart} allowClear />
            <BsDateInput label="End Nepali date" value={reportEnd} onChange={setReportEnd} allowClear />
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <select
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              >
                <option value="">All titles</option>
                {titleOptions.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Report period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              >
                <option value="daily">Day</option>
                <option value="weekly">Week</option>
                <option value="monthly">Month</option>
                <option value="yearly">Year</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
              <SpreadsheetIcon />
              Export Excel
            </button>
            <button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
              <PdfIcon />
              Export PDF
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <PrintIcon />
              Print
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 print:mt-0 print:overflow-visible print:rounded-none print:border-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3 text-right">Records</th>
                <th className="px-4 py-3 text-right">No of items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {reportSummaries.map((summary) => (
                <tr key={summary.key}>
                  <td className="px-4 py-3 font-medium text-slate-900">{summary.title}</td>
                  <td className="px-4 py-3 text-slate-700">{summary.label}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{summary.records}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{summary.totalItems}</td>
                </tr>
              ))}
              {reportSummaries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No maintenance report data found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5 print:hidden">
        <h2 className="font-semibold text-slate-900">All maintenance report items</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">No of items</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{formatBsDate(record.report_date)}</td>
                  <td className="px-4 py-3 text-slate-700">{record.title}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{record.item_count}</td>
                  <td className="px-4 py-3 text-slate-600">{record.remarks || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(record)
                          setForm(toForm(record))
                        }}
                        title="Edit maintenance report item"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(record)}
                        title="Delete maintenance report item"
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
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No maintenance report items found.
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
            <h2 className="text-lg font-semibold text-slate-900">Delete maintenance report item</h2>
            <p className="mt-2 text-sm text-slate-600">
              Delete {deleteTarget.title} from {formatBsDate(deleteTarget.report_date)}?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button type="button" onClick={() => deleteRecord(deleteTarget)} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">
                Delete item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
