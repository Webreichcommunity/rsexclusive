import { Link, Navigate } from 'react-router-dom'
import { Accessibility, CircleUserRound, Download, Gift, LogOut, Save, Settings, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { StatusPill } from '../../components/ui/StatusPill.jsx'
import { useAuth } from '../auth/authContext.js'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { useAppUser } from '../auth/useAppUser.js'
import { logout } from '../auth/firebaseClient.js'

const profileOptions = [
  { avatar: 'avatar-male', gender: 'male', label: 'Male', Icon: UserRound },
  { avatar: 'avatar-female', gender: 'female', label: 'Female', Icon: CircleUserRound },
  { avatar: 'avatar-transgender', gender: 'transgender', label: 'Transgender', Icon: Accessibility },
]

export function AccountPage() {
  const { isAuthenticated, firebaseUser, loading: authLoading } = useAuth()
  const appUser = useAppUser()
  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '', avatar: 'avatar-male', gender: '', birthDate: '', city: '', address: '' })
  const [profileStatus, setProfileStatus] = useState({ loading: false, message: '', type: '' })
  const [showProfileSettings, setShowProfileSettings] = useState(false)
  const { data, loading, error } = useAsync(
    () => (isAuthenticated ? apiFetch('/me/bookings') : Promise.resolve({ bookings: [] })),
    isAuthenticated ? 'signed-in' : 'signed-out',
  )

  useEffect(() => {
    const user = appUser.data?.user
    if (!user) return
    setProfileForm({
      fullName: user.fullName || firebaseUser?.displayName || '',
      phone: user.phone || '',
      avatar: user.profile?.avatar || 'avatar-male',
      gender: user.profile?.gender || '',
      birthDate: user.profile?.birthDate || '',
      city: user.profile?.city || '',
      address: user.profile?.address || '',
    })
  }, [appUser.data?.user, firebaseUser?.displayName])

  async function saveProfile(event) {
    event.preventDefault()
    setProfileStatus({ loading: true, message: '', type: '' })
    try {
      await apiFetch('/me', { method: 'PATCH', body: profileForm })
      setProfileStatus({ loading: false, type: 'success', message: 'Profile saved.' })
      setShowProfileSettings(false)
    } catch (error) {
      setProfileStatus({ loading: false, type: 'error', message: error.message })
    }
  }

  if (authLoading || loading || appUser.loading) return <LoadingState label="Loading account" />
  if (!isAuthenticated) {
    return (
      <main className="container-page grid min-h-[70vh] place-items-center py-12">
        <div className="panel max-w-xl p-7 text-center">
          <UserRound className="mx-auto text-amberline" size={42} />
          <h1 className="mt-4 text-4xl">Sign in to view bookings</h1>
          <Link className="btn-primary mt-6" to="/login">Continue</Link>
        </div>
      </main>
    )
  }

  if (appUser.data?.user?.role === 'super_admin') return <Navigate to="/super-admin" replace />
  if (appUser.data?.user?.role === 'hotel_admin') {
    const hotelQuery = appUser.data.user.hotel?.subdomain ? `?hotel=${appUser.data.user.hotel.subdomain}` : ''
    return <Navigate to={`/admin${hotelQuery}`} replace />
  }

  return (
    <main className="bg-ivory">
      <section className="bg-charcoal text-white">
        <div className="container-page py-12 md:py-16">
          <FadeIn viewport={false}>
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-stone-400">Guest account</p>
            <h1 className="mt-3 text-5xl font-semibold leading-none md:text-7xl">Welcome, {firebaseUser?.displayName || firebaseUser?.email}</h1>
            <button className="btn-dark mt-6" type="button" onClick={logout}><LogOut size={18} /> Logout</button>
          </FadeIn>
        </div>
      </section>

      <section className="container-page -mt-8 pb-16 md:pb-24">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <FadeIn viewport={false} className="glass-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar id={profileForm.avatar} gender={profileForm.gender} />
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold">{profileForm.fullName || firebaseUser?.email}</p>
                  <p className="truncate text-xs font-semibold text-stone-500">{firebaseUser?.email}</p>
                </div>
              </div>
              <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => setShowProfileSettings((value) => !value)}>
                <Settings size={16} /> Settings
              </button>
            </div>

            <div className="mt-5 grid gap-3 rounded-md border border-white/70 bg-white/80 p-4 text-sm shadow-sm">
              <Line label="Name" value={profileForm.fullName || '-'} />
              <Line label="Email" value={firebaseUser?.email || '-'} />
              <Line label="Phone" value={profileForm.phone || '-'} />
              <Line label="DOB" value={profileForm.birthDate || '-'} />
              <Line label="City" value={profileForm.city || '-'} />
              <Line label="Address" value={profileForm.address || '-'} />
              <Line label="Gender" value={formatProfileValue(profileForm.gender) || '-'} />
            </div>

            {profileStatus.message ? <p className={`mt-4 rounded-md border p-3 text-sm font-semibold ${profileStatus.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{profileStatus.message}</p> : null}

            {showProfileSettings ? (
              <form onSubmit={saveProfile} className="mt-5 grid gap-4">
                <div>
                  <span className="label">Avatar and gender</span>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {profileOptions.map((option) => (
                      <button
                        key={option.gender}
                        className={`flex min-h-12 items-center justify-center gap-2 rounded-md border px-3 text-sm font-extrabold transition ${profileForm.gender === option.gender ? 'border-amberline bg-amber-50 text-charcoal ring-2 ring-amberline/20' : 'border-mist bg-white text-stone-600 hover:bg-bone'}`}
                        type="button"
                        onClick={() => setProfileForm({ ...profileForm, avatar: option.avatar, gender: option.gender })}
                      >
                        <option.Icon size={18} /> {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Full name"><input className="input" value={profileForm.fullName} onChange={(event) => setProfileForm({ ...profileForm, fullName: event.target.value })} required /></Field>
                <Field label="Phone"><input className="input" value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Birth date"><input className="input" type="date" value={profileForm.birthDate} onChange={(event) => setProfileForm({ ...profileForm, birthDate: event.target.value })} /></Field>
                  <Field label="City"><input className="input" value={profileForm.city} onChange={(event) => setProfileForm({ ...profileForm, city: event.target.value })} /></Field>
                </div>
                <Field label="Address"><textarea className="input min-h-24 py-3" value={profileForm.address} onChange={(event) => setProfileForm({ ...profileForm, address: event.target.value })} /></Field>
                <button className="btn-primary" disabled={profileStatus.loading} type="submit"><Save size={18} /> {profileStatus.loading ? 'Saving...' : 'Save profile'}</button>
              </form>
            ) : null}
          </FadeIn>

          <div>
            <FadeIn viewport={false} className="glass-panel flex items-center gap-3 p-4 md:w-fit">
              <Gift className="text-amberline" size={22} />
              <div>
                <p className="text-sm font-extrabold">Loyalty points: {Number(appUser.data?.user?.loyaltyPoints || 0).toLocaleString('en-IN')}</p>
                <p className="text-xs font-semibold text-stone-500">Earn 1 point for every Rs 100 confirmed.</p>
              </div>
            </FadeIn>

            {error ? <p className="mt-6 rounded-md bg-red-50 p-3 text-red-700">{error.message}</p> : null}
            <section className="mt-7">
              <div className="mb-5">
                <p className="eyebrow">My Bookings</p>
                <h2 className="mt-2 text-4xl font-semibold">Your stays</h2>
              </div>
              <Stagger className="grid gap-4">
                {(data?.bookings || []).map((booking) => (
                  <StaggerItem key={booking.id} as="article" className="grid gap-4 rounded-lg border border-stone-200 bg-white p-5 shadow-soft lg:grid-cols-[1fr_150px_120px_170px_140px] lg:items-center">
                    <div>
                      <p className="text-2xl font-semibold">{booking.hotel_name}</p>
                      <p className="mt-1 text-sm text-stone-500">{booking.room_type_name} / {booking.booking_reference}</p>
                    </div>
                    <p className="text-sm font-semibold text-stone-600">{booking.check_in}<br />{booking.check_out}</p>
                    <StatusPill status={booking.status} />
                    <div className="rounded-md bg-bone p-3 text-sm">
                      <Line label="Total" value={money(booking.currency, booking.total_amount)} />
                      <Line label="Paid" value={money(booking.currency, booking.metadata?.paymentPlan?.paidAmount ?? booking.total_amount)} />
                      {Number(booking.metadata?.paymentPlan?.balanceDue || 0) > 0 ? <Line label="Due" value={money(booking.currency, booking.metadata.paymentPlan.balanceDue)} /> : null}
                    </div>
                    {booking.pdf_url ? <a className="btn-secondary !min-h-10 !px-3" href={booking.pdf_url}><Download size={16} /> Receipt</a> : <span className="text-sm font-semibold text-stone-400">Receipt preparing</span>}
                  </StaggerItem>
                ))}
              </Stagger>
              {!data?.bookings?.length ? <p className="panel p-6 text-sm font-semibold text-stone-500">No bookings yet.</p> : null}
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}

function Avatar({ id, gender, small }) {
  const option = profileOptions.find((item) => item.avatar === id || item.gender === gender) || profileOptions[0]
  const Icon = option.Icon
  return <span className={`grid ${small ? 'h-8 w-8' : 'h-14 w-14'} place-items-center rounded-full bg-gradient-to-br from-amberline to-wine text-white shadow-soft`}><Icon size={small ? 16 : 24} /></span>
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function Line({ label, value }) {
  return <p className="flex justify-between gap-3"><span className="text-stone-500">{label}</span><span className="font-extrabold text-charcoal">{value}</span></p>
}

function money(currency, value) {
  return `${currency || 'INR'} ${Number(value || 0).toLocaleString('en-IN')}`
}

function formatProfileValue(value) {
  return String(value || '').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
