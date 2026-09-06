import { Link, Navigate } from 'react-router-dom'
import {
  Accessibility,
  CalendarDays,
  CircleUserRound,
  Download,
  Gift,
  Hotel,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Save,
  Settings,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { StatusPill } from '../../components/ui/StatusPill.jsx'
import { useAuth } from '../auth/authContext.js'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { useAppUser } from '../auth/useAppUser.js'
import { logout } from '../auth/firebaseClient.js'
import { buildHotelUrl, buildTenantPath, resolveTenantFromLocation } from '../tenant/resolveTenant.js'

const profileOptions = [
  { avatar: 'avatar-male', gender: 'male', label: 'Male', Icon: UserRound },
  { avatar: 'avatar-female', gender: 'female', label: 'Female', Icon: CircleUserRound },
  { avatar: 'avatar-transgender', gender: 'transgender', label: 'Transgender', Icon: Accessibility },
]

export function AccountPage() {
  const { isAuthenticated, firebaseUser, loading: authLoading } = useAuth()
  const appUser = useAppUser()
  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '', avatar: 'avatar-male', photoUrl: '', gender: '', birthDate: '', city: '', address: '' })
  const [profileStatus, setProfileStatus] = useState({ loading: false, message: '', type: '' })
  const [showProfileModal, setShowProfileModal] = useState(false)
  const { data, loading, error } = useAsync(
    () => (isAuthenticated ? apiFetch('/me/bookings') : Promise.resolve({ bookings: [] })),
    isAuthenticated ? `signed-in:${firebaseUser?.uid || 'unknown'}` : 'signed-out',
  )

  const bookings = useMemo(() => data?.bookings || [], [data?.bookings])
  const bookingStats = useMemo(() => ({
    bookings: bookings.length,
    hotels: new Set(bookings.map((booking) => booking.hotel_name).filter(Boolean)).size,
    paid: bookings.reduce((sum, booking) => sum + Number(booking.metadata?.paymentPlan?.paidAmount ?? booking.total_amount ?? 0), 0),
  }), [bookings])

  useEffect(() => {
    const user = appUser.data?.user
    if (!user) return
    setProfileForm({
      fullName: user.fullName || firebaseUser?.displayName || '',
      phone: user.phone || '',
      avatar: user.profile?.avatar || 'avatar-male',
      photoUrl: user.profile?.photoUrl || firebaseUser?.photoURL || '',
      gender: user.profile?.gender || '',
      birthDate: user.profile?.birthDate || '',
      city: user.profile?.city || '',
      address: user.profile?.address || '',
    })
  }, [appUser.data?.user, firebaseUser?.displayName, firebaseUser?.photoURL])

  async function saveProfile(event) {
    event.preventDefault()
    setProfileStatus({ loading: true, message: '', type: '' })
    try {
      await apiFetch('/me', { method: 'PATCH', body: profileForm })
      setProfileStatus({ loading: false, type: 'success', message: 'Profile saved.' })
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
          <Link className="btn-primary mt-6" to={buildTenantPath('/login', resolveTenantFromLocation())}>Continue</Link>
        </div>
      </main>
    )
  }

  if (appUser.data?.user?.role === 'super_admin') return <Navigate to="/super-admin" replace />
  if (appUser.data?.user?.role === 'hotel_admin') return <RedirectToHotelAdmin hotel={appUser.data.user.hotel} />

  const displayName = profileForm.fullName || firebaseUser?.displayName || firebaseUser?.email || 'Guest'
  const points = Number(appUser.data?.user?.loyaltyPoints || 0)

  return (
    <main className="overflow-hidden bg-ivory">
      <section className="relative overflow-hidden bg-charcoal text-white">
        <img src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1800&q=80" alt="" className="absolute inset-0 h-full w-full object-cover opacity-42" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/58 to-black/20" />
        <div className="container-page relative grid gap-8 py-12 md:py-16 lg:grid-cols-[1fr_360px] lg:items-end">
          <FadeIn viewport={false}>
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-amber-100">Guest account</p>
            <h1 className="mt-4 max-w-4xl break-words text-5xl font-black leading-none md:text-7xl">Welcome, {firstName(displayName)}</h1>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/78">
              Your booking history and loyalty points work across every hotel in the Ranjeet Groups collection.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button className="btn-primary" type="button" onClick={() => setShowProfileModal(true)}><Settings size={18} /> Profile details</button>
              <button className="btn-dark" type="button" onClick={logout}><LogOut size={18} /> Logout</button>
            </div>
          </FadeIn>
          <FadeIn viewport={false} delay={0.1} className="rounded-lg border border-white/18 bg-white/12 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <Avatar id={profileForm.avatar} gender={profileForm.gender} photoUrl={profileForm.photoUrl || firebaseUser?.photoURL} large />
              <div className="min-w-0">
                <p className="truncate text-xl font-extrabold">{displayName}</p>
                <p className="mt-1 truncate text-sm font-semibold text-white/66">{firebaseUser?.email}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <HeroStat icon={Gift} label="Group points" value={points.toLocaleString('en-IN')} />
              <HeroStat icon={Hotel} label="Hotels visited" value={bookingStats.hotels} />
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="container-page -mt-8 pb-16 md:pb-24">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={CalendarDays} label="Bookings" value={bookingStats.bookings} text="Across all hotels" />
          <MetricCard icon={Gift} label="Redeemable points" value={points.toLocaleString('en-IN')} text="Use at any hotel checkout" />
          <MetricCard icon={Sparkles} label="Paid value" value={`Rs ${compactMoney(bookingStats.paid)}`} text="Confirmed payment value" />
        </div>

        {error ? <p className="mt-6 rounded-md bg-red-50 p-3 text-red-700">{error.message}</p> : null}
        <section className="mt-8">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">My bookings</p>
              <h2 className="mt-2 text-4xl font-semibold">All stays in one place</h2>
            </div>
            <Link to="/" className="btn-secondary"><Hotel size={18} /> Explore hotels</Link>
          </div>
          {bookings.length ? (
            <Stagger className="grid gap-4">
              {bookings.map((booking) => (
                <StaggerItem key={booking.id} as="article" className="grid gap-4 overflow-hidden rounded-lg border border-stone-200 bg-white p-4 shadow-soft transition hover:-translate-y-1 hover:shadow-card lg:grid-cols-[minmax(0,1fr)_155px_120px_175px_140px] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-2xl font-semibold">{booking.hotel_name}</p>
                    <p className="mt-1 truncate text-sm text-stone-500">{booking.room_type_name} / {booking.booking_reference}</p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-400">{booking.nights} night{Number(booking.nights) === 1 ? '' : 's'} / {booking.rooms_count} room{Number(booking.rooms_count) === 1 ? '' : 's'}</p>
                  </div>
                  <p className="text-sm font-semibold text-stone-600">{formatDate(booking.check_in)}<br />{formatDate(booking.check_out)}</p>
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
          ) : (
            <div className="panel p-8 text-center">
              <Hotel className="mx-auto text-amberline" size={38} />
              <h3 className="mt-4 text-2xl font-extrabold">No bookings yet</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">Book from any hotel in the group and your stays will appear here.</p>
            </div>
          )}
        </section>
      </section>

      {showProfileModal ? (
        <ProfileModal
          form={profileForm}
          setForm={setProfileForm}
          email={firebaseUser?.email}
          status={profileStatus}
          saving={profileStatus.loading}
          onSave={saveProfile}
          onClose={() => setShowProfileModal(false)}
        />
      ) : null}
    </main>
  )
}

function ProfileModal({ form, setForm, email, status, saving, onSave, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-charcoal/55 p-3 backdrop-blur-sm md:place-items-center" onMouseDown={onClose}>
      <form className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-white/50 bg-ivory shadow-2xl" onSubmit={onSave} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-mist bg-white/90 p-4 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar id={form.avatar} gender={form.gender} photoUrl={form.photoUrl} />
            <div className="min-w-0">
              <p className="eyebrow">Profile details</p>
              <h2 className="truncate text-2xl font-black">{form.fullName || email}</h2>
            </div>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-md border border-mist bg-white" onClick={onClose} aria-label="Close profile"><X size={18} /></button>
        </div>

        <div className="grid gap-5 p-4 sm:p-5">
          <div className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-soft sm:grid-cols-3">
            <Info icon={Mail} label="Email" value={email || '-'} />
            <Info icon={Phone} label="Phone" value={form.phone || '-'} />
            <Info icon={MapPin} label="City" value={form.city || '-'} />
          </div>

          <div>
            <span className="label">Avatar and gender</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {profileOptions.map((option) => (
                <button
                  key={option.gender}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-md border px-3 text-sm font-extrabold transition ${form.gender === option.gender ? 'border-amberline bg-amber-50 text-charcoal ring-2 ring-amberline/20' : 'border-mist bg-white text-stone-600 hover:bg-bone'}`}
                  type="button"
                  onClick={() => setForm({ ...form, avatar: option.avatar, gender: option.gender })}
                >
                  <option.Icon size={18} /> {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><input className="input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></Field>
            <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="Birth date"><input className="input" type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} /></Field>
            <Field label="City"><input className="input" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
          </div>
          <Field label="Address"><textarea className="input min-h-24 py-3" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
          {status.message ? <p className={`rounded-md border p-3 text-sm font-semibold ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{status.message}</p> : null}
          <button className="btn-primary" disabled={saving} type="submit"><Save size={18} /> {saving ? 'Saving...' : 'Save profile'}</button>
        </div>
      </form>
    </div>
  )
}

function Avatar({ id, gender, photoUrl, large }) {
  const size = large ? 'h-20 w-20' : 'h-14 w-14'
  if (photoUrl) return <img src={photoUrl} alt="" className={`${size} shrink-0 rounded-full border border-white bg-white object-cover shadow-soft`} />
  const option = profileOptions.find((item) => item.avatar === id || item.gender === gender) || profileOptions[0]
  const Icon = option.Icon
  return <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-gradient-to-br from-amberline to-wine text-white shadow-soft`}><Icon size={large ? 30 : 24} /></span>
}

function RedirectToHotelAdmin({ hotel }) {
  useEffect(() => {
    window.location.replace(buildHotelUrl(hotel, '/admin'))
  }, [hotel])

  return <LoadingState label="Opening admin dashboard" />
}

function Field({ label, children }) {
  return <label className="min-w-0"><span className="label">{label}</span>{children}</label>
}

function Line({ label, value }) {
  return <p className="flex justify-between gap-3"><span className="text-stone-500">{label}</span><span className="font-extrabold text-charcoal">{value}</span></p>
}

function HeroStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-md border border-white/16 bg-white/10 p-3">
      <Icon size={18} className="text-amber-100" />
      <p className="mt-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-white/58">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, text }) {
  return (
    <FadeIn viewport={false} className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-glass backdrop-blur-xl">
      <span className="grid h-11 w-11 place-items-center rounded-md bg-amber-50 text-amberline"><Icon size={21} /></span>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-charcoal">{value}</p>
      <p className="mt-2 text-sm font-semibold text-stone-600">{text}</p>
    </FadeIn>
  )
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <Icon size={18} className="text-amberline" />
      <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold text-charcoal">{value}</p>
    </div>
  )
}

function money(currency, value) {
  return `${currency || 'INR'} ${Number(value || 0).toLocaleString('en-IN')}`
}

function compactMoney(value) {
  const amount = Number(value || 0)
  if (Math.abs(amount) >= 10000000) return `${(amount / 10000000).toFixed(1)}Cr`
  if (Math.abs(amount) >= 100000) return `${(amount / 100000).toFixed(1)}L`
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(1)}k`
  return amount.toLocaleString('en-IN')
}

function formatDate(value) {
  if (!value) return 'TBA'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function firstName(value) {
  return String(value || 'Guest').split(/[ @]/).filter(Boolean)[0] || 'Guest'
}
