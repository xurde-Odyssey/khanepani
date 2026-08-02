import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { DataEntry } from './pages/DataEntry'
import { BulkEntryGrid } from './pages/BulkEntryGrid'
import { Reports } from './pages/Reports'
import { ReportDetail } from './pages/ReportDetail'
import { Admin } from './pages/Admin'
import { Maintenance } from './pages/Maintenance'
import { MaintenanceReport } from './pages/MaintenanceReport'
import { Notes } from './pages/Notes'
import { Tap } from './pages/Tap'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/entry" element={<DataEntry />} />
        <Route path="/bulk-grid" element={<BulkEntryGrid />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/detail" element={<ReportDetail />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/tap" element={<Tap />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/maintenance-report" element={<MaintenanceReport />} />
        <Route path="/notes" element={<Notes />} />
      </Route>
    </Routes>
  )
}
