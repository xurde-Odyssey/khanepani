import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { todayBs, bsToGregorian, BS_MONTHS } from '../lib/bsCalendar'
import type { DailyEntry, Pump, Project, BsMonth } from '../types/database'

type DailyNumberKey =
  | 'operating_hours'
  | 'flowmeter_start_unit'
  | 'flowmeter_end_unit'
  | 'production'
  | 'backwash_time'
  | 'backwash_unit'
  | 'distribution'
  | 'lps'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'deleting'

type PumpWithProject = Pump & {
  projects?: Pick<Project, 'name'> | null
}

const FIELDS: { key: DailyNumberKey; label: string; shortLabel: string; step?: string }[] = [
  { key: 'operating_hours', label: 'Operating hours', shortLabel: 'Hours', step: '0.1' },
  { key: 'flowmeter_start_unit', label: 'Flowmeter start', shortLabel: 'Start', step: '1' },
  { key: 'flowmeter_end_unit', label: 'Flowmeter end', shortLabel: 'End', step: '1' },
  { key: 'production', label: 'Production', shortLabel: 'Production', step: '0.1' },
  { key: 'backwash_time', label: 'Backwash time (hrs)', shortLabel: 'BW time', step: '0.1' },
  { key: 'backwash_unit', label: 'Backwash unit', shortLabel: 'BW unit', step: '0.1' },
  { key: 'distribution', label: 'Distribution', shortLabel: 'Distribution', step: '0.1' },
  { key: 'lps', label: 'LPS', shortLabel: 'LPS', step: '0.01' },
]

const REQUIRED_FIELDS: DailyNumberKey[] = ['operating_hours', 'production', 'distribution', 'backwash_time', 'lps']

function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function SaveIcon() {
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  )
}

function TrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

function valuesFromEntry(entry: DailyEntry): Record<DailyNumberKey, string> {
  return Object.fromEntries(FIELDS.map((f) => [f.key, entry[f.key] == null ? '' : String(entry[f.key])])) as Record<
    DailyNumberKey,
    string
  >
}

function numericPayloadFromValues(values: Partial<Record<DailyNumberKey, string>>) {
  return Object.fromEntries(FIELDS.map((f) => [f.key, values[f.key] ? Number(values[f.key]) : null])) as Partial<
    Record<DailyNumberKey, number | null>
  >
}

function isFlowmeterValid(values: Partial<Record<DailyNumberKey, string>>) {
  const start = values.flowmeter_start_unit ? Number(values.flowmeter_start_unit) : null
  const end = values.flowmeter_end_unit ? Number(values.flowmeter_end_unit) : null
  return start === null || end === null || end >= start
}

function requiredFieldMessage(values: Partial<Record<DailyNumberKey, string>>) {
  const labels = REQUIRED_FIELDS.filter((key) => !values[key]?.trim()).map(
    (key) => FIELDS.find((field) => field.key === key)?.label ?? key.replace(/_/g, ' ')
  )
  return labels.length > 0 ? `Required fields missing: ${labels.join(', ')}.` : ''
}

const MAX_BS_DAY = 32

function clampBsDay(day: number) {
  if (!Number.isFinite(day)) return 1
  return Math.min(MAX_BS_DAY, Math.max(1, Math.trunc(day)))
}

export function DataEntry() {
  const { profile } = useAuth()
  const [pumps, setPumps] = useState<PumpWithProject[]>([])
  const [entries, setEntries] = useState<DailyEntry[]>([])
  const [pumpId, setPumpId] = useState('')
  const [bsYear, setBsYear] = useState(todayBs().bs_year)
  const [bsMonth, setBsMonth] = useState<BsMonth>(todayBs().bs_month)
  const [bsDay, setBsDay] = useState(todayBs().bs_day)
  const [values, setValues] = useState<Partial<Record<DailyNumberKey, string>>>({})
  const [drafts, setDrafts] = useState<Record<string, Record<DailyNumberKey, string>>>({})
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [rowStatus, setRowStatus] = useState<Record<string, SaveStatus>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<DailyEntry | null>(null)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isBsDayValid = bsDay >= 1 && bsDay <= MAX_BS_DAY
  const entryDate = isBsDayValid
    ? bsToGregorian({ bs_year: bsYear, bs_month: bsMonth, bs_day: bsDay })
    : bsToGregorian({ bs_year: bsYear, bs_month: bsMonth, bs_day: 1 })
  const pumpsById = useMemo(() => new Map(pumps.map((pump) => [pump.id, pump])), [pumps])
  const selectedPump = pumpsById.get(pumpId)
  const selectedProjectName = selectedPump?.projects?.name ?? 'No project assigned'

  useEffect(() => {
    supabase
      .from('pumps')
      .select('*, projects(name)')
      .eq('is_active', true)
      .order('pump_no')
      .then(({ data }) => {
        const rows = (data ?? []) as PumpWithProject[]
        setPumps(rows)
        if (rows[0]) setPumpId(rows[0].id)
      })
  }, [])

  const loadEntries = useCallback(async () => {
    setLoadingEntries(true)
    const { data, error } = await supabase
      .from('daily_entries')
      .select('*')
      .eq('entry_date', entryDate)
      .order('created_at', { ascending: true })

    if (!error) {
      const rows = (data ?? []) as DailyEntry[]
      setEntries(rows)
      setDrafts(Object.fromEntries(rows.map((entry) => [entry.id, valuesFromEntry(entry)])))
      setRowStatus({})
      setRowErrors({})
      setEditingRows({})
    }

    setLoadingEntries(false)
  }, [entryDate])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  function update(key: DailyNumberKey, val: string) {
    setValues((current) => ({ ...current, [key]: val }))
  }

  function updateDraft(entryId: string, key: DailyNumberKey, val: string) {
    setDrafts((current) => ({
      ...current,
      [entryId]: {
        ...current[entryId],
        [key]: val,
      },
    }))
    setRowStatus((current) => ({ ...current, [entryId]: 'idle' }))
    setRowErrors((current) => ({ ...current, [entryId]: '' }))
  }

  function editRow(entry: DailyEntry) {
    setDrafts((current) => ({
      ...current,
      [entry.id]: current[entry.id] ?? valuesFromEntry(entry),
    }))
    setEditingRows((current) => ({ ...current, [entry.id]: true }))
    setRowStatus((current) => ({ ...current, [entry.id]: 'idle' }))
    setRowErrors((current) => ({ ...current, [entry.id]: '' }))
  }

  function cancelEdit(entry: DailyEntry) {
    setDrafts((current) => ({ ...current, [entry.id]: valuesFromEntry(entry) }))
    setEditingRows((current) => ({ ...current, [entry.id]: false }))
    setRowStatus((current) => ({ ...current, [entry.id]: 'idle' }))
    setRowErrors((current) => ({ ...current, [entry.id]: '' }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')

    const missingMessage = requiredFieldMessage(values)
    if (missingMessage) {
      setStatus('error')
      setErrorMsg(missingMessage)
      return
    }

    if (!isFlowmeterValid(values)) {
      setStatus('error')
      setErrorMsg('Flowmeter end must be greater than or equal to flowmeter start.')
      return
    }

    if (!isBsDayValid) {
      setStatus('error')
      setErrorMsg(`BS day must be between 1 and ${MAX_BS_DAY}.`)
      return
    }

    const payload: Partial<DailyEntry> = {
      pump_id: pumpId,
      entry_date: entryDate,
      bs_year: bsYear,
      bs_month: bsMonth,
      bs_day: bsDay,
      entered_by: profile?.id,
      ...numericPayloadFromValues(values),
    }

    const { error } = await supabase.from('daily_entries').upsert(payload, { onConflict: 'pump_id,entry_date' })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('saved')
      setValues({})
      await loadEntries()
    }
  }

  async function saveRow(entry: DailyEntry) {
    const draft = drafts[entry.id] ?? valuesFromEntry(entry)
    setRowStatus((current) => ({ ...current, [entry.id]: 'saving' }))
    setRowErrors((current) => ({ ...current, [entry.id]: '' }))

    const missingMessage = requiredFieldMessage(draft)
    if (missingMessage) {
      setRowStatus((current) => ({ ...current, [entry.id]: 'error' }))
      setRowErrors((current) => ({ ...current, [entry.id]: missingMessage }))
      return
    }

    if (!isFlowmeterValid(draft)) {
      setRowStatus((current) => ({ ...current, [entry.id]: 'error' }))
      setRowErrors((current) => ({
        ...current,
        [entry.id]: 'Flowmeter end must be greater than or equal to flowmeter start.',
      }))
      return
    }

    const { error } = await supabase
      .from('daily_entries')
      .update({
        ...numericPayloadFromValues(draft),
        entered_by: profile?.id,
      })
      .eq('id', entry.id)

    if (error) {
      setRowStatus((current) => ({ ...current, [entry.id]: 'error' }))
      setRowErrors((current) => ({ ...current, [entry.id]: error.message }))
    } else {
      await loadEntries()
      setEditingRows((current) => ({ ...current, [entry.id]: false }))
      setRowStatus((current) => ({ ...current, [entry.id]: 'saved' }))
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const deletedId = deleteTarget.id

    setRowStatus((current) => ({ ...current, [deletedId]: 'deleting' }))
    setRowErrors((current) => ({ ...current, [deletedId]: '' }))

    const { error } = await supabase
      .from('daily_entries')
      .delete()
      .eq('id', deletedId)
      .eq('pump_id', deleteTarget.pump_id)
      .eq('entry_date', deleteTarget.entry_date)

    if (error) {
      setRowStatus((current) => ({ ...current, [deletedId]: 'error' }))
      setRowErrors((current) => ({ ...current, [deletedId]: error.message }))
      setDeleteTarget(null)
      return
    }

    const { data: remainingRows, error: verifyError } = await supabase
      .from('daily_entries')
      .select('id')
      .eq('id', deletedId)
      .limit(1)

    if (verifyError || (remainingRows && remainingRows.length > 0)) {
      setRowStatus((current) => ({ ...current, [deletedId]: 'error' }))
      setRowErrors((current) => ({
        ...current,
        [deletedId]: verifyError?.message ?? 'Delete was not applied. Run the daily_entries delete policy SQL in Supabase.',
      }))
      setDeleteTarget(null)
      return
    }

    setEntries((current) => current.filter((entry) => entry.id !== deletedId))
    setDeleteTarget(null)
    await loadEntries()
  }

  const sortedEntries = [...entries].sort((a, b) => {
    const projectA = pumpsById.get(a.pump_id)?.projects?.name ?? ''
    const projectB = pumpsById.get(b.pump_id)?.projects?.name ?? ''
    const projectCompare = projectA.localeCompare(projectB, undefined, { numeric: true, sensitivity: 'base' })
    if (projectCompare !== 0) return projectCompare

    const pumpA = pumpsById.get(a.pump_id)?.pump_no ?? Number.MAX_SAFE_INTEGER
    const pumpB = pumpsById.get(b.pump_id)?.pump_no ?? Number.MAX_SAFE_INTEGER
    return pumpA - pumpB
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-700">Daily operations</p>
          <h1 className="text-2xl font-semibold text-slate-900">Daily Data Entry</h1>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
          {entryDate} | {bsMonth} {bsDay}, {bsYear}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">Add or update entry</h2>
            <p className="mt-1 text-sm text-slate-500">Saving the same pump and date updates the existing record.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Pump</label>
              <select
                value={pumpId}
                onChange={(e) => setPumpId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {pumps.map((p) => (
                  <option key={p.id} value={p.id}>
                    Pump #{p.pump_no} {p.label ? `- ${p.label}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Project</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">{selectedProjectName}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">BS Year</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={bsYear}
                  onChange={(e) => {
                    const nextYear = Number(e.target.value)
                    setBsYear(nextYear)
                    setBsDay((currentDay) => clampBsDay(currentDay))
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">BS Month</label>
                <select
                  value={bsMonth}
                  onChange={(e) => {
                    const nextMonth = e.target.value as BsMonth
                    setBsMonth(nextMonth)
                    setBsDay((currentDay) => clampBsDay(currentDay))
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  {BS_MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">BS Day</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_BS_DAY}
                  value={bsDay}
                  onChange={(e) => setBsDay(clampBsDay(Number(e.target.value)))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-sm font-medium">
                    {f.label}
                    {REQUIRED_FIELDS.includes(f.key) && <span className="text-red-600"> *</span>}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    required={REQUIRED_FIELDS.includes(f.key)}
                    value={values[f.key] ?? ''}
                    onChange={(e) => update(f.key, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              ))}
            </div>

            {status === 'error' && <p className="text-sm text-red-600">{errorMsg}</p>}
            {status === 'saved' && <p className="text-sm text-green-700">Entry saved and added to the table.</p>}

            <button
              type="submit"
              disabled={status === 'saving' || !pumpId}
              className="w-full rounded-lg bg-brand-600 py-3 font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'saving' ? 'Saving...' : 'Save entry'}
            </button>
          </div>
        </form>

        <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Entered data</h2>
              <p className="text-sm text-slate-500">
                {sortedEntries.length} record{sortedEntries.length === 1 ? '' : 's'} for selected date
              </p>
            </div>
            <button
              type="button"
              onClick={loadEntries}
              className="mt-2 inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:mt-0"
            >
              Refresh
            </button>
          </div>

          {loadingEntries ? (
            <p className="px-5 py-8 text-sm text-slate-500">Loading entered data...</p>
          ) : sortedEntries.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">No data entered for this BS date yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1160px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 font-semibold">
                      Pump
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 font-semibold">Project</th>
                    {FIELDS.map((f) => (
                      <th key={f.key} className="border-b border-slate-200 px-2 py-3 font-semibold">
                        {f.shortLabel}
                      </th>
                    ))}
                    <th className="border-b border-slate-200 px-4 py-3 font-semibold">Status</th>
                    <th className="sticky right-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-right font-semibold shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedEntries.map((entry) => {
                    const pump = pumpsById.get(entry.pump_id)
                    const draft = drafts[entry.id] ?? valuesFromEntry(entry)
                    const currentStatus = rowStatus[entry.id] ?? 'idle'
                    const rowError = rowErrors[entry.id] ?? ''
                    const isEditing = editingRows[entry.id] ?? false

                    return (
                      <tr key={entry.id} className="bg-white hover:bg-slate-50">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-4 py-3 font-medium text-slate-900">
                          Pump #{pump?.pump_no ?? '-'} {pump?.label ? `- ${pump.label}` : ''}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {pump?.projects?.name ?? <span className="text-slate-300">-</span>}
                        </td>
                        {FIELDS.map((f) => (
                          <td key={f.key} className="px-2 py-2">
                            {isEditing ? (
                              <input
                                type="number"
                                inputMode="decimal"
                                step={f.step}
                                required={REQUIRED_FIELDS.includes(f.key)}
                                value={draft[f.key]}
                                onChange={(e) => updateDraft(entry.id, f.key, e.target.value)}
                                className="h-10 w-24 rounded-md border border-slate-300 px-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                                aria-label={`${f.label} for pump ${pump?.pump_no ?? ''}`}
                              />
                            ) : (
                              <span className="block min-w-20 rounded-md bg-slate-50 px-2 py-2 text-slate-700">
                                {entry[f.key] ?? <span className="text-slate-300">-</span>}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          {currentStatus === 'saving' && <span className="text-slate-500">Saving...</span>}
                          {currentStatus === 'deleting' && <span className="text-slate-500">Deleting...</span>}
                          {currentStatus === 'saved' && <span className="text-green-700">Saved</span>}
                          {currentStatus === 'error' && <span className="text-red-600">{rowError || 'Check required values'}</span>}
                          {currentStatus === 'idle' && (
                            <span className={isEditing ? 'text-brand-700' : 'text-slate-400'}>
                              {isEditing ? 'Editing' : 'Ready'}
                            </span>
                          )}
                        </td>
                        <td className="sticky right-0 z-10 bg-inherit px-4 py-3 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]">
                          <div className="flex justify-end gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => cancelEdit(entry)}
                                  disabled={currentStatus === 'saving' || currentStatus === 'deleting'}
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveRow(entry)}
                                  disabled={currentStatus === 'saving' || currentStatus === 'deleting'}
                                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <SaveIcon />
                                  <span>{currentStatus === 'saving' ? 'Saving...' : 'Save'}</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => editRow(entry)}
                                disabled={currentStatus === 'deleting'}
                                className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <PencilIcon />
                                <span>Edit</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(entry)}
                              disabled={currentStatus === 'saving' || currentStatus === 'deleting'}
                              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <TrashIcon />
                              <span>{currentStatus === 'deleting' ? 'Deleting...' : 'Delete'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Delete entry?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This will permanently delete the entry for{' '}
              <span className="font-medium text-slate-900">
                Pump #{pumpsById.get(deleteTarget.pump_id)?.pump_no ?? '-'}
                {pumpsById.get(deleteTarget.pump_id)?.label ? ` - ${pumpsById.get(deleteTarget.pump_id)?.label}` : ''}
              </span>{' '}
              on {bsMonth} {bsDay}, {bsYear}.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={(rowStatus[deleteTarget.id] ?? 'idle') === 'deleting'}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={(rowStatus[deleteTarget.id] ?? 'idle') === 'deleting'}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <TrashIcon />
                <span>{(rowStatus[deleteTarget.id] ?? 'idle') === 'deleting' ? 'Deleting...' : 'Delete entry'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
