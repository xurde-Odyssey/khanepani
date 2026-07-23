import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Pump, Profile } from '../types/database'

export function Admin() {
  const [pumps, setPumps] = useState<Pump[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [newPumpNo, setNewPumpNo] = useState('')
  const [newPumpLabel, setNewPumpLabel] = useState('')
  const [pumpError, setPumpError] = useState('')

  async function loadAll() {
    const { data: pumpRows } = await supabase.from('pumps').select('*').order('pump_no')
    setPumps((pumpRows ?? []) as Pump[])
    const { data: profileRows } = await supabase.from('profiles').select('*')
    setProfiles((profileRows ?? []) as Profile[])
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function addPump(e: FormEvent) {
    e.preventDefault()
    if (!newPumpNo) return
    setPumpError('')
    await supabase.from('pumps').insert({ pump_no: Number(newPumpNo), label: newPumpLabel || null, is_active: true })
    setNewPumpNo('')
    setNewPumpLabel('')
    loadAll()
  }

  async function togglePump(pump: Pump) {
    setPumpError('')
    const { error } = await supabase.from('pumps').update({ is_active: !pump.is_active }).eq('id', pump.id)
    if (error) setPumpError(error.message)
    loadAll()
  }

  async function deletePump(pump: Pump) {
    const label = `Pump #${pump.pump_no}${pump.label ? ` - ${pump.label}` : ''}`
    const confirmed = window.confirm(`Delete ${label}? This also deletes its related daily entries.`)
    if (!confirmed) return

    setPumpError('')
    const { error } = await supabase.from('pumps').delete().eq('id', pump.id)
    if (error) {
      setPumpError(error.message)
      return
    }
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
              <th className="py-1">Label</th>
              <th className="py-1">Status</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {pumps.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2">{p.pump_no}</td>
                <td className="py-2">{p.label ?? '—'}</td>
                <td className="py-2">{p.is_active ? 'Active' : 'Inactive'}</td>
                <td className="py-2">
                  <button onClick={() => togglePump(p)} className="text-brand-600 text-sm">
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => deletePump(p)} className="ml-4 text-red-600 text-sm">
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
            <label className="block text-xs font-medium mb-1">Label</label>
            <input value={newPumpLabel} onChange={(e) => setNewPumpLabel(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" />
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
    </div>
  )
}
