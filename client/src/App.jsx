import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell.jsx'
import { LoadingState } from './components/ui/LoadingState.jsx'
import { useTenantMode } from './modules/tenant/useTenantMode.js'

const AccountPage = lazy(() => import('./modules/account/AccountPage.jsx').then((module) => ({ default: module.AccountPage })))
const AdminDashboard = lazy(() => import('./modules/admin/AdminDashboard.jsx').then((module) => ({ default: module.AdminDashboard })))
const BookingPage = lazy(() => import('./modules/booking/BookingPage.jsx').then((module) => ({ default: module.BookingPage })))
const ConfirmationPage = lazy(() =>
  import('./modules/booking/ConfirmationPage.jsx').then((module) => ({ default: module.ConfirmationPage })),
)
const LoginPage = lazy(() => import('./modules/auth/LoginPage.jsx').then((module) => ({ default: module.LoginPage })))
const GroupLanding = lazy(() => import('./modules/public/GroupLanding.jsx').then((module) => ({ default: module.GroupLanding })))
const HotelExperience = lazy(() =>
  import('./modules/public/HotelExperience.jsx').then((module) => ({ default: module.HotelExperience })),
)
const SuperAdminPage = lazy(() => import('./modules/super-admin/SuperAdminPage.jsx').then((module) => ({ default: module.SuperAdminPage })))

export default function App() {
  const mode = useTenantMode()

  return (
    <AppShell mode={mode}>
      <Suspense fallback={<LoadingState label="Opening experience" />}>
        <Routes>
          <Route path="/" element={mode.isTenant ? <HotelExperience /> : <GroupLanding />} />
          <Route path="/rooms" element={<HotelExperience focus="rooms" />} />
          <Route path="/book" element={<BookingPage />} />
          <Route path="/confirmation/:bookingReference" element={<ConfirmationPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/super-admin" element={<SuperAdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
