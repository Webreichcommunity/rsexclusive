import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell.jsx'
import { LoadingState } from './components/ui/LoadingState.jsx'
import { useAuth } from './modules/auth/authContext.js'
import { useAppUser } from './modules/auth/useAppUser.js'
import { useTenantMode } from './modules/tenant/useTenantMode.js'
import { buildTenantPath, stripTenantFromPath } from './modules/tenant/resolveTenant.js'

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
const TermsPage = lazy(() => import('./modules/public/PolicyPages.jsx').then((module) => ({ default: module.TermsPage })))
const FaqPage = lazy(() => import('./modules/public/PolicyPages.jsx').then((module) => ({ default: module.FaqPage })))
const SuperAdminPage = lazy(() => import('./modules/super-admin/SuperAdminPage.jsx').then((module) => ({ default: module.SuperAdminPage })))

export default function App() {
  const mode = useTenantMode()

  return (
    <AppShell mode={mode}>
      <Suspense fallback={<LoadingState label="Opening experience" />}>
        <Routes>
          <Route path="/" element={mode.isTenant ? <HotelExperience /> : <GroupLanding />} />
          <Route path="/:hotelKey" element={<HotelExperience />} />
          <Route path="/:hotelKey/rooms" element={<HotelExperience focus="rooms" />} />
          <Route path="/:hotelKey/book" element={<BookingPage />} />
          <Route path="/:hotelKey/terms" element={<TermsPage />} />
          <Route path="/:hotelKey/faq" element={<FaqPage />} />
          <Route path="/:hotelKey/confirmation/:bookingReference" element={<ConfirmationPage />} />
          <Route path="/:hotelKey/account" element={<AccountPage />} />
          <Route path="/:hotelKey/login" element={<LoginPage />} />
          <Route path="/:hotelKey/admin/login" element={<LoginPage />} />
          <Route path="/:hotelKey/admin" element={<RequireConsoleAuth mode={mode}><AdminDashboard /></RequireConsoleAuth>} />
          <Route path="/rooms" element={<HotelExperience focus="rooms" />} />
          <Route path="/book" element={<BookingPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/confirmation/:bookingReference" element={<ConfirmationPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin" element={<RequireConsoleAuth mode={mode}><AdminDashboard /></RequireConsoleAuth>} />
          <Route path="/super-admin" element={<RequireConsoleAuth mode={mode}><SuperAdminPage /></RequireConsoleAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}

function RequireConsoleAuth({ children, mode }) {
  const location = useLocation()
  const { isAuthenticated, loading } = useAuth()
  const appUser = useAppUser()
  const appPath = stripTenantFromPath(location.pathname, mode)
  const user = appUser.data?.user
  const isStaff = user?.role === 'hotel_admin' || user?.role === 'super_admin'
  const isSuperAdminRoute = appPath.startsWith('/super-admin')
  const hotelAdminPath = user?.hotel ? buildTenantPath('/admin', { isTenant: true, key: user.hotel.subdomain || user.hotel.slug, source: 'path' }) : buildTenantPath('/admin', mode)
  const targetPath = user?.role === 'super_admin' ? '/super-admin' : hotelAdminPath

  if (loading) return <LoadingState label="Checking secure access" />
  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}`)
    const loginPath = appPath.startsWith('/admin')
      ? buildTenantPath('/admin/login', mode)
      : '/admin/login'
    const separator = loginPath.includes('?') ? '&' : '?'
    return <Navigate to={`${loginPath}${separator}returnTo=${returnTo}`} replace />
  }
  if (appUser.loading) return <LoadingState label="Restoring console session" />
  if (appUser.error) {
    return (
      <main className="container-page grid min-h-[70vh] place-items-center py-12">
        <div className="panel max-w-xl p-6 text-center">
          <h1 className="text-2xl font-black text-charcoal">Could not restore admin session</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-stone-600">
            You are signed in, but the admin API could not verify your staff access. Check the frontend API URL and backend CORS/domain settings.
          </p>
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{appUser.error.message}</p>
        </div>
      </main>
    )
  }
  if (!isStaff) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}`)
    const loginPath = appPath.startsWith('/admin') ? buildTenantPath('/admin/login', mode) : '/admin/login'
    const separator = loginPath.includes('?') ? '&' : '?'
    return <Navigate to={`${loginPath}${separator}returnTo=${returnTo}`} replace />
  }
  if (isSuperAdminRoute && user.role !== 'super_admin') return <Navigate to={hotelAdminPath} replace />
  if (!isSuperAdminRoute && user.role === 'hotel_admin' && targetPath !== location.pathname) return <Navigate to={targetPath} replace />
  return children
}
