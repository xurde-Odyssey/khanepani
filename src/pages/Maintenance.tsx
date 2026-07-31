import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useMemo } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import type { MaintenanceRecord } from '../types/database'

type MaintenanceForm = {
  maintenance_date: string
  title: string
  done_by: string
  description: string
  work_time: string
  equipments_used: string
  remarks: string
}

const emptyMaintenanceForm: MaintenanceForm = {
  maintenance_date: new Date().toISOString().slice(0, 10),
  title: '',
  done_by: '',
  description: '',
  work_time: '',
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
    work_time: record.work_time ?? '',
    equipments_used: record.equipments_used ?? '',
    remarks: record.remarks ?? '',
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
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
      Date: record.maintenance_date,
      Title: record.title ?? '',
      'Done by': record.done_by,
      Description: record.description,
      Time: record.work_time ?? '',
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
      head: [['Date', 'Title', 'Done by', 'Description', 'Time', 'Equipments used', 'Remarks']],
      body: reportRecords.map((record) => [
        record.maintenance_date,
        record.title ?? '',
        record.done_by,
        record.description,
        record.work_time ?? '',
        record.equipments_used ?? '',
        record.remarks ?? '',
      ]),
    })
    doc.save(reportFileName('pdf'))
  }

  async function saveRecord(e: FormEvent) {
    e.preventDefault()
    if (!form.maintenance_date || !form.done_by.trim() || !form.description.trim()) return

    setError('')
    const payload = {
      maintenance_date: form.maintenance_date,
      title: form.title.trim() || null,
      done_by: form.done_by.trim(),
      description: form.description.trim(),
      work_time: form.work_time.trim() || null,
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
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Maintenance</h1>
        <p className="mt-1 text-sm text-slate-500">Track completed maintenance work, equipment used, and remarks.</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <CalendarIcon />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">{editing ? 'Edit maintenance record' : 'Add maintenance record'}</h2>
            <p className="text-xs text-slate-500">Date, person responsible, work description, time, equipment, and remarks.</p>
          </div>
        </div>

        <form onSubmit={saveRecord} className="mt-5 grid grid-cols-1 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={form.maintenance_date}
              onChange={(e) => setForm({ ...form, maintenance_date: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              list="maintenance-title-suggestions"
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
            <label className="block text-sm font-medium mb-1">Done by</label>
            <input
              value={form.done_by}
              onChange={(e) => setForm({ ...form, done_by: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="lg:col-span-6">
            <label className="block text-sm font-medium mb-1">Time</label>
            <input
              value={form.work_time}
              onChange={(e) => setForm({ ...form, work_time: e.target.value })}
              placeholder="Example: 10:00 AM - 12:30 PM"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="block text-sm font-medium mb-1">Description of work</label>
            <textarea
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

      <section className="bg-white rounded-xl shadow border border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Maintenance log</h2>
            <p className="mt-1 text-xs text-slate-500">
              {reportRecords.length} selected work record{reportRecords.length === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 print:hidden">
          <div>
            <label className="block text-xs font-medium mb-1">Start date</label>
            <input
              type="date"
              value={reportStart}
              onChange={(e) => setReportStart(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">End date</label>
            <input
              type="date"
              value={reportEnd}
              onChange={(e) => setReportEnd(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button type="button" onClick={exportExcel} className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Export Excel
          </button>
          <button type="button" onClick={exportPdf} className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Export PDF
          </button>
          <button type="button" onClick={() => window.print()} className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm">
            Print
          </button>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Done by</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Equipments used</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {reportRecords.map((record) => (
                <tr key={record.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{formatDate(record.maintenance_date)}</td>
                  <td className="px-4 py-3 min-w-48 font-medium text-slate-800">{record.title || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{record.done_by}</td>
                  <td className="px-4 py-3 min-w-64 text-slate-700">{record.description}</td>
                  <td className="px-4 py-3 text-slate-600">{record.work_time || '-'}</td>
                  <td className="px-4 py-3 min-w-48 text-slate-600">{record.equipments_used || '-'}</td>
                  <td className="px-4 py-3 min-w-48 text-slate-600">{record.remarks || '-'}</td>
                  <td className="px-4 py-3">
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
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
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
              Delete the maintenance record from {formatDate(deleteTarget.maintenance_date)}?
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
