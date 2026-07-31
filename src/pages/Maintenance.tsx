import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useMemo } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { BsDateInput } from '../components/BsDateInput'
import { formatBsDate } from '../lib/bsCalendar'
import type { MaintenanceRecord } from '../types/database'

type MaintenanceForm = {
  maintenance_date: string
  title: string
  done_by: string
  description: string
  equipments_used: string
  remarks: string
}

const emptyMaintenanceForm: MaintenanceForm = {
  maintenance_date: new Date().toISOString().slice(0, 10),
  title: '',
  done_by: '',
  description: '',
  equipments_used: '',
  remarks: '',
}

const maintenanceTitleSuggestions = [
  '1/2" pipe maintenance',
  'Meter place change',
  'Meter Gate valve change',
  'Pipeline Maintenance',
  'Closed tap re-open',
  'Meter Check',
  'Counter Change',
  'New Tap Connection',
  'Hole change',
  'Water pressure increment',
  'Meter nut/ nipple Change',
  'Ferrule change',
  'Saddle change',
  'Female socket maintenance/ change',
  'Union change',
  'Double connection removed',
  'Leakage maintenance',
  'Temporary tap closed',
  'Miscellaneous',
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

function CalendarIcon() {
  return (
    <Icon>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </Icon>
  )
}

function toForm(record: MaintenanceRecord): MaintenanceForm {
  return {
    maintenance_date: record.maintenance_date,
    title: record.title ?? '',
    done_by: record.done_by,
    description: record.description,
    equipments_used: record.equipments_used ?? '',
    remarks: record.remarks ?? '',
  }
}

export function Maintenance() {
  const [records, setRecords] = useState<MaintenanceRecord[]>([])
  const [form, setForm] = useState<MaintenanceForm>(emptyMaintenanceForm)
  const [reportStart, setReportStart] = useState('')
  const [reportEnd, setReportEnd] = useState('')
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceRecord | null>(null)
  const [error, setError] = useState('')

  async function loadRecords() {
    const { data, error: loadError } = await supabase
      .from('maintenance_records')
      .select('*')
      .order('maintenance_date', { ascending: false })

    if (loadError) {
      setError(loadError.message)
      return
    }
    setRecords((data ?? []) as MaintenanceRecord[])
  }

  useEffect(() => {
    loadRecords()
  }, [])

  const reportRecords = useMemo(
    () =>
      records.filter((record) => {
        if (reportStart && record.maintenance_date < reportStart) return false
        if (reportEnd && record.maintenance_date > reportEnd) return false
        return true
      }),
    [records, reportStart, reportEnd]
  )

  function reportFileName(extension: string) {
    const range = reportStart || reportEnd ? `${reportStart || 'start'}-to-${reportEnd || 'end'}` : 'all'
    return `maintenance-report-${range}.${extension}`
  }

  function exportExcel() {
    const rows = reportRecords.map((record) => ({
      Date: formatBsDate(record.maintenance_date),
      Title: record.title ?? '',
      'No of work': record.done_by,
      Description: record.description,
      'Equipments used': record.equipments_used ?? '',
      Remarks: record.remarks ?? '',
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Maintenance Report')
    XLSX.writeFile(wb, reportFileName('xlsx'))
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.text('Maintenance Report', 14, 14)
    doc.text(`Records: ${reportRecords.length}`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [['Date', 'Title', 'No of work', 'Description', 'Equipments used', 'Remarks']],
      body: reportRecords.map((record) => [
        formatBsDate(record.maintenance_date),
        record.title ?? '',
        record.done_by,
        record.description,
        record.equipments_used ?? '',
        record.remarks ?? '',
      ]),
    })
    doc.save(reportFileName('pdf'))
  }

  async function saveRecord(e: FormEvent) {
    e.preventDefault()
    const title = form.title.trim()
    const doneBy = form.done_by.trim()
    const description = form.description.trim()

    if (!form.maintenance_date || !title || !doneBy || !description) {
      setError('Title, No of work, and Description of work are required.')
      return
    }

    setError('')
    const payload = {
      maintenance_date: form.maintenance_date,
      title,
      done_by: doneBy,
      description,
      work_time: null,
      equipments_used: form.equipments_used.trim() || null,
      remarks: form.remarks.trim() || null,
    }

    const { error: saveError } = editing
      ? await supabase.from('maintenance_records').update(payload).eq('id', editing.id)
      : await supabase.from('maintenance_records').insert(payload)

    if (saveError) {
      setError(saveError.message)
      return
    }

    setForm(emptyMaintenanceForm)
    setEditing(null)
    loadRecords()
  }

  async function deleteRecord(record: MaintenanceRecord) {
    setError('')
    const { error: deleteError } = await supabase.from('maintenance_records').delete().eq('id', record.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setDeleteTarget(null)
    loadRecords()
  }

  function startEdit(record: MaintenanceRecord) {
    setError('')
    setEditing(record)
    setForm(toForm(record))
  }

  return (
    <div className="space-y-6 max-w-6xl print:max-w-none print:space-y-0">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold text-slate-900">Maintenance</h1>
        <p className="mt-1 text-sm text-slate-500">Track completed maintenance work, equipment used, and remarks.</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">{error}</p>}

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5 print:hidden">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <CalendarIcon />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">{editing ? 'Edit maintenance record' : 'Add maintenance record'}</h2>
            <p className="text-xs text-slate-500">Date, number of work, description, equipment, and remarks.</p>
          </div>
        </div>

        <form onSubmit={saveRecord} className="mt-5 grid grid-cols-1 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <BsDateInput
              label="Nepali date"
              value={form.maintenance_date}
              onChange={(maintenance_date) => setForm({ ...form, maintenance_date })}
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              list="maintenance-title-suggestions"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <datalist id="maintenance-title-suggestions">
              {maintenanceTitleSuggestions.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium mb-1">No of work</label>
            <input
              required
              value={form.done_by}
              onChange={(e) => setForm({ ...form, done_by: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="block text-sm font-medium mb-1">Description of work</label>
            <textarea
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="block text-sm font-medium mb-1">Equipments used</label>
            <textarea
              value={form.equipments_used}
              onChange={(e) => setForm({ ...form, equipments_used: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="lg:col-span-6">
            <label className="block text-sm font-medium mb-1">Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="lg:col-span-6 flex gap-2">
            <button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white">
              {editing ? 'Save changes' : 'Add record'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null)
                  setForm(emptyMaintenanceForm)
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
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <h2 className="font-semibold text-slate-900">Maintenance log</h2>
            <p className="mt-1 text-xs text-slate-500">
              {reportRecords.length} selected work record{reportRecords.length === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-3 print:hidden">
          <div className="max-w-xl space-y-3">
            <BsDateInput label="Start Nepali date" value={reportStart} onChange={setReportStart} allowClear />
            <BsDateInput label="End Nepali date" value={reportEnd} onChange={setReportEnd} allowClear />
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
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 print:mt-0 print:overflow-visible print:rounded-none print:border-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">No of work</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Equipments used</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3 text-right print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {reportRecords.map((record) => (
                <tr key={record.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{formatBsDate(record.maintenance_date)}</td>
                  <td className="px-4 py-3 min-w-48 font-medium text-slate-800">{record.title || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{record.done_by}</td>
                  <td className="px-4 py-3 min-w-64 text-slate-700">{record.description}</td>
                  <td className="px-4 py-3 min-w-48 text-slate-600">{record.equipments_used || '-'}</td>
                  <td className="px-4 py-3 min-w-48 text-slate-600">{record.remarks || '-'}</td>
                  <td className="px-4 py-3 print:hidden">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(record)}
                        title="Edit maintenance record"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(record)}
                        title="Delete maintenance record"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {reportRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No maintenance records found.
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
            <h2 className="text-lg font-semibold text-slate-900">Delete maintenance record</h2>
            <p className="mt-2 text-sm text-slate-600">
              Delete the maintenance record from {formatBsDate(deleteTarget.maintenance_date)}?
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
