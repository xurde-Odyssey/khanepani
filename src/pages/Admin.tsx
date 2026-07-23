import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Project, Pump } from '../types/database'

type PumpWithProject = Pump & {
  projects?: Pick<Project, 'name'> | null
}

const projectNameSorter = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

function Icon({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 ${className}`}
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

function PauseIcon() {
  return (
    <Icon>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </Icon>
  )
}

function PlayIcon() {
  return (
    <Icon>
      <path d="m8 5 11 7-11 7V5z" />
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

export function Admin() {
  const [pumps, setPumps] = useState<PumpWithProject[]>([])
  const [newPumpNo, setNewPumpNo] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [editingPump, setEditingPump] = useState<PumpWithProject | null>(null)
  const [editPumpNo, setEditPumpNo] = useState('')
  const [editProjectName, setEditProjectName] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<PumpWithProject | null>(null)
  const [pumpError, setPumpError] = useState('')

  async function loadAll() {
    const { data: pumpRows } = await supabase.from('pumps').select('*, projects(name)').order('pump_no')
    const sortedPumps = ((pumpRows ?? []) as PumpWithProject[]).sort((a, b) => {
      const projectCompare = projectNameSorter.compare(a.projects?.name ?? '', b.projects?.name ?? '')
      if (projectCompare !== 0) return projectCompare
      return a.pump_no - b.pump_no
    })
    setPumps(sortedPumps)
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function findOrCreateProject(projectName: string) {
    const { data: existingProject, error: projectLookupError } = await supabase
      .from('projects')
      .select('*')
      .eq('name', projectName)
      .limit(1)
      .maybeSingle()

    if (projectLookupError) return { projectId: null, error: projectLookupError.message }
    if (existingProject) return { projectId: existingProject.id, error: null }

    const { data: createdProject, error: projectCreateError } = await supabase
      .from('projects')
      .insert({ name: projectName })
      .select()
      .single()

    if (projectCreateError) return { projectId: null, error: projectCreateError.message }
    return { projectId: createdProject.id, error: null }
  }

  async function addPump(e: FormEvent) {
    e.preventDefault()
    const projectName = newProjectName.trim()
    if (!newPumpNo || !projectName) return

    setPumpError('')

    const { projectId, error: projectError } = await findOrCreateProject(projectName)
    if (projectError || !projectId) {
      setPumpError(projectError ?? 'Could not create project.')
      return
    }

    const { error } = await supabase.from('pumps').insert({
      project_id: projectId,
      pump_no: Number(newPumpNo),
      label: null,
      is_active: true,
    })

    if (error) {
      setPumpError(error.message)
      return
    }

    setNewPumpNo('')
    setNewProjectName('')
    loadAll()
  }

  function openEditPump(pump: PumpWithProject) {
    setPumpError('')
    setEditingPump(pump)
    setEditPumpNo(String(pump.pump_no))
    setEditProjectName(pump.projects?.name ?? '')
    setEditIsActive(pump.is_active)
  }

  async function savePumpEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingPump) return

    const projectName = editProjectName.trim()
    if (!editPumpNo || !projectName) return

    setPumpError('')
    const { projectId, error: projectError } = await findOrCreateProject(projectName)
    if (projectError || !projectId) {
      setPumpError(projectError ?? 'Could not create project.')
      return
    }

    const { error } = await supabase
      .from('pumps')
      .update({
        project_id: projectId,
        pump_no: Number(editPumpNo),
        is_active: editIsActive,
      })
      .eq('id', editingPump.id)

    if (error) {
      setPumpError(error.message)
      return
    }

    setEditingPump(null)
    loadAll()
  }

  async function togglePump(pump: Pump) {
    setPumpError('')
    const { error } = await supabase.from('pumps').update({ is_active: !pump.is_active }).eq('id', pump.id)
    if (error) setPumpError(error.message)
    loadAll()
  }

  async function deletePump(pump: PumpWithProject) {
    setPumpError('')
    const { error } = await supabase.from('pumps').delete().eq('id', pump.id)
    if (error) {
      setPumpError(error.message)
      return
    }
    setDeleteTarget(null)
    loadAll()
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>

      <section className="bg-white rounded-xl shadow p-5">
        <h2 className="font-medium text-slate-800 mb-3">Pumps</h2>
        {pumpError && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {pumpError}
          </p>
        )}
        <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">Project Name</th>
                <th className="px-4 py-3">Pumps</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {pumps.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{p.projects?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">Pump #{p.pump_no}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditPump(p)}
                        title="Edit pump"
                        aria-label={`Edit Pump #${p.pump_no}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePump(p)}
                        title={p.is_active ? 'Deactivate pump' : 'Activate pump'}
                        aria-label={`${p.is_active ? 'Deactivate' : 'Activate'} Pump #${p.pump_no}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-brand-600 hover:bg-brand-50"
                      >
                        {p.is_active ? <PauseIcon /> : <PlayIcon />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        title="Delete pump"
                        aria-label={`Delete Pump #${p.pump_no}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={addPump} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs font-medium mb-1">Project Name</label>
            <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Pumps</label>
            <input value={newPumpNo} onChange={(e) => setNewPumpNo(e.target.value)} type="number" className="rounded-lg border border-slate-300 px-3 py-2 w-24" />
          </div>
          <button className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm">Add Pump</button>
        </form>
      </section>

      {editingPump && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <form onSubmit={savePumpEdit} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Edit pump</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Pump #</label>
                <input
                  value={editPumpNo}
                  onChange={(e) => setEditPumpNo(e.target.value)}
                  type="number"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Project name</label>
                <input
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                Active
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingPump(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white">
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Delete pump</h2>
            <p className="mt-2 text-sm text-slate-600">
              Delete Pump #{deleteTarget.pump_no}
              {deleteTarget.projects?.name ? ` from ${deleteTarget.projects.name}` : ''}? This also deletes related daily entries.
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
                onClick={() => deletePump(deleteTarget)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
              >
                Delete pump
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
