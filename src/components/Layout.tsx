import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import clsx from 'clsx'

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/entry', label: 'Data Entry' },
  { to: '/entry/bulk', label: 'Bulk Grid' },
  { to: '/reports', label: 'Reports' },
  { to: '/admin', label: 'Admin' },
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <nav className="md:w-56 bg-brand-700 text-white flex md:flex-col shrink-0">
        <div className="px-4 py-4 font-semibold text-lg hidden md:block">Water Supply</div>
        <div className="flex md:flex-col overflow-x-auto md:overflow-visible flex-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'px-4 py-3 text-sm whitespace-nowrap md:whitespace-normal',
                  isActive ? 'bg-brand-600 font-medium' : 'hover:bg-brand-600/60'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="border-l border-white/10 md:mt-auto md:border-l-0 md:border-t">
          <button
            onClick={() => signOut()}
            className="flex h-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-brand-600/60 md:w-full"
          >
            <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold md:inline-flex">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden min-w-0 flex-1 md:block">
              <span className="block truncate text-xs text-white/70">Account</span>
              <span className="block truncate font-medium">{displayName}</span>
            </span>
            <span className="inline-flex items-center gap-2 md:gap-0" title="Sign out">
              <SignOutIcon />
              <span className="md:hidden">Sign out</span>
            </span>
          </button>
        </div>
      </nav>
      <main className="flex-1 p-4 md:p-8 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  )
}
