import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabaseConfigError } from '../lib/supabase'

export function Login() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-xl shadow p-6 space-y-4">
        <h1 className="text-xl font-semibold text-brand-700">Water Supply Reporting</h1>
        {supabaseConfigError && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {supabaseConfigError}
          </p>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-600 text-white py-2.5 font-medium disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
