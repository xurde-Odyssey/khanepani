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

export function Layout() {
  const { profile, signOut } = useAuth()

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
        <button
          onClick={() => signOut()}
          className="px-4 py-3 text-sm text-left hover:bg-brand-600/60 md:mt-auto"
        >
          Sign out {profile?.full_name ? `(${profile.full_name})` : ''}
        </button>
      </nav>
      <main className="flex-1 p-4 md:p-8 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  )
}
