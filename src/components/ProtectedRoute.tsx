import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types/database'

export function ProtectedRoute({
  children,
  allow,
}: {
  children: ReactNode
  allow?: Role[]
}) {
  const { session, profile, loading } = useAuth()

  if (loading) return <div className="p-8 text-center text-slate-500">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  if (allow && profile && !allow.includes(profile.role)) {
    return <div className="p-8 text-center text-red-600">You don't have access to this page.</div>
  }
  return <>{children}</>
}
