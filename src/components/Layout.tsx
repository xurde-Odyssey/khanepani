import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import clsx from 'clsx'

type NavItem =
  | { type: 'link'; to: string; label: string; child?: boolean }
  | { type: 'heading'; label: string }

const NAV: NavItem[] = [
  { type: 'link', to: '/', label: 'Dashboard' },
  { type: 'link', to: '/entry', label: 'Data Entry' },
  { type: 'link', to: '/entry/bulk', label: 'Bulk Grid' },
  { type: 'link', to: '/reports', label: 'Reports' },
  { type: 'link', to: '/admin', label: 'Admin' },
  { type: 'heading', label: 'Records' },
  { type: 'link', to: '/tap', label: 'Tap', child: true },
  { type: 'link', to: '/maintenance', label: 'Maintenance', child: true },
  { type: 'link', to: '/notes', label: 'Notes', child: true },
]

function SignOutIcon() {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

export function Layout() {
  const { profile, signOut } = useAuth()
  const displayName = profile?.full_name || 'Signed in'
  const roleLabel = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'Account'

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <nav className="md:w-56 bg-brand-700 text-white flex md:flex-col shrink-0">
        <div className="px-4 py-4 font-semibold text-lg hidden md:block">Water Supply</div>
        <div className="flex md:flex-col overflow-x-auto md:overflow-visible flex-1">
          {NAV.map((item) =>
            item.type === 'heading' ? (
              <div
                key={item.label}
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/60 md:pb-1 md:pt-4"
              >
                {item.label}
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'px-4 py-3 text-sm whitespace-nowrap md:whitespace-normal',
                    item.child && 'md:py-2 md:pl-8 text-xs md:text-sm bg-brand-800/20',
                    isActive ? 'bg-brand-600 font-medium' : 'hover:bg-brand-600/60'
                  )
                }
              >
                {item.label}
              </NavLink>
            )
          )}
        </div>
        <div className="border-l border-white/10 p-2 md:mt-auto md:border-l-0 md:border-t md:p-3">
          <div className="hidden items-center gap-3 rounded-lg bg-white/10 px-3 py-3 md:flex">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{displayName}</span>
              <span className="block truncate text-xs text-white/70">{roleLabel}</span>
            </span>
          </div>
          <button
            onClick={() => signOut()}
            className="mt-0 flex h-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10 md:mt-2 md:w-full md:justify-start"
            title="Sign out"
          >
              <SignOutIcon />
              <span className="hidden md:inline">Sign out</span>
              <span className="md:hidden">Logout</span>
          </button>
        </div>
      </nav>
      <main className="flex-1 p-4 md:p-8 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  )
}
