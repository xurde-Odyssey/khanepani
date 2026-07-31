import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import clsx from 'clsx'

type NavItem =
  | { type: 'link'; to: string; label: string; child?: boolean }
  | { type: 'heading'; label: string }

const NAV: NavItem[] = [
  { type: 'link', to: '/', label: 'Dashboard' },
  { type: 'link', to: '/entry', label: 'Data Entry' },
  { type: 'link', to: '/bulk-grid', label: 'Bulk Grid' },
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
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen flex flex-col md:block">
      <nav className="bg-brand-700 text-white flex shrink-0 md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-56 md:flex-col md:overflow-y-auto">
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
          <button
            onClick={() => signOut()}
            className="flex h-full items-center justify-center gap-2 rounded-lg border border-red-300/40 bg-red-500/20 px-3 py-2 text-sm font-semibold text-red-50 hover:bg-red-500/30 md:w-full md:justify-start"
            title="Logout"
          >
              <SignOutIcon />
              <span>Logout</span>
          </button>
        </div>
      </nav>
      <main className="flex-1 overflow-y-auto overflow-x-auto p-4 md:ml-56 md:h-screen md:p-8">
        <div className="flex min-h-full flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
          <footer className="mt-8 flex flex-col gap-2 border-t border-slate-200 pt-4 text-center text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-left print:hidden">
            <p className="m-0">Copyright 2026. All rights reserved.</p>
            <p className="designer-credit">
              <span>Designed by</span>
              <a href="https://www.bhandaridipesh.com.np/" target="_blank" rel="noopener noreferrer">
                Xurde
              </a>
              <span className="designer-credit__separator" aria-hidden="true">•</span>
              <span>Founder,</span>
              <a
                className="designer-credit__company"
                href="https://www.concoretechnologies.com.np/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Concore Technologies
              </a>
            </p>
          </footer>
        </div>
      </main>
    </div>
  )
}
