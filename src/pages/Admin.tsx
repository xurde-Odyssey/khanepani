import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Project, Pump, Profile } from '../types/database'

type PumpWithProject = Pump & {
  projects?: Pick<Project, 'name'> | null
}

export function Admin() {
  const [pumps, setPumps] = useState<PumpWithProject[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
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
    setPumps((pumpRows ?? []) as PumpWithProject[])
    const { data: profileRows } = await supabase.from('profiles').select('*')
    setProfiles((profileRows ?? []) as Profile[])
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

  async function changeRole(profileId: string, role: Profile['role']) {
    await supabase.from('profiles').update({ role }).eq('id', profileId)
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
        <table className="text-sm w-full mb-4">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">No.</th>
              <th className="py-1">Project</th>
              <th className="py-1">Status</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {pumps.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2">{p.pump_no}</td>
                <td className="py-2">{p.projects?.name ?? '—'}</td>
                <td className="py-2">{p.is_active ? 'Active' : 'Inactive'}</td>
                <td className="py-2">
                  <button onClick={() => openEditPump(p)} className="text-slate-700 text-sm">
                    Edit
                  </button>
                  <button onClick={() => togglePump(p)} className="ml-4 text-brand-600 text-sm">
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => setDeleteTarget(p)} className="ml-4 text-red-600 text-sm">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={addPump} className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs font-medium mb-1">Pump #</label>
            <input value={newPumpNo} onChange={(e) => setNewPumpNo(e.target.value)} type="number" className="rounded-lg border border-slate-300 px-3 py-2 w-24" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Project name</label>
            <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <button className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm">Add pump</button>
        </form>
      </section>

      <section className="bg-white rounded-xl shadow p-5">
        <h2 className="font-medium text-slate-800 mb-3">Users</h2>
        <table className="text-sm w-full">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Name</th>
              <th className="py-1">Role</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2">{p.full_name ?? '—'}</td>
                <td className="py-2">
                  <select
                    value={p.role}
                    onChange={(e) => changeRole(p.id, e.target.value as Profile['role'])}
                    className="rounded-lg border border-slate-300 px-2 py-1"
                  >
                    <option value="admin">admin</option>
                    <option value="supervisor">supervisor</option>
                    <option value="operator">operator</option>
                    <option value="viewer">viewer</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
