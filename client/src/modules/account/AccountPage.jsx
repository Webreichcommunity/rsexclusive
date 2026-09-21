import { Link, Navigate, useSearchParams } from 'react-router-dom'
import {
  Accessibility,
  CalendarDays,
  CircleUserRound,
  Download,
  Eye,
  Gift,
  Hotel,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  Save,
  Settings,
  ShieldCheck,
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
import { apiFetch, receiptDownloadUrl } from '../../services/apiClient.js'
import { useAppUser } from '../auth/useAppUser.js'
import { logout } from '../auth/firebaseClient.js'
import { buildHotelUrl, buildTenantPath, resolveTenantFromLocation } from '../tenant/resolveTenant.js'

const profileOptions = [
  { avatar: 'avatar-male', gender: 'male', label: 'Male', Icon: UserRound },
  { avatar: 'avatar-female', gender: 'female', label: 'Female', Icon: CircleUserRound },
  { avatar: 'avatar-transgender', gender: 'transgender', label: 'Transgender', Icon: Accessibility },
]
const DEFAULT_LOYALTY_REDEMPTION_MIN_POINTS = 1000
const cancellationReasons = [
  'Change in travel plan',
  'Booked wrong dates',
  'Found another accommodation',
  'Medical or family emergency',
  'Payment or budget issue',
  'Other',
]

export function AccountPage() {
  const { isAuthenticated, firebaseUser, loading: authLoading } = useAuth()
  const appUser = useAppUser()
  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '', avatar: 'avatar-male', photoUrl: '', gender: '', birthDate: '', city: '', address: '' })
  const [profileStatus, setProfileStatus] = useState({ loading: false, message: '', type: '' })
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [bookingRefreshKey, setBookingRefreshKey] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, loading, error } = useAsync(
    () => (isAuthenticated ? apiFetch('/me/bookings') : Promise.resolve({ bookings: [] })),
    isAuthenticated ? `signed-in:${firebaseUser?.uid || 'unknown'}:${bookingRefreshKey}` : 'signed-out',
  )

  const bookings = useMemo(() => data?.bookings || [], [data?.bookings])
  const requestedBookingReference = searchParams.get('booking')
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

  useEffect(() => {
    if (!requestedBookingReference || !bookings.length || selectedBooking) return
    const booking = bookings.find((item) => item.booking_reference === requestedBookingReference)
    if (booking) setSelectedBooking(booking)
  }, [bookings, requestedBookingReference, selectedBooking])

  useEffect(() => {
    const waitingForReceipt = bookings.some((booking) => booking.status === 'confirmed' && !booking.pdf_url)
    if (!waitingForReceipt) return undefined
    const timer = window.setTimeout(() => setBookingRefreshKey((value) => value + 1), 5000)
    return () => window.clearTimeout(timer)
  }, [bookings])

  useEffect(() => {
    if (!selectedBooking) return
    const latest = bookings.find((booking) => booking.booking_reference === selectedBooking.booking_reference)
    if (latest && JSON.stringify(latest) !== JSON.stringify(selectedBooking)) setSelectedBooking(latest)
  }, [bookings, selectedBooking])

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

  if (authLoading || (loading && !data) || appUser.loading) return <LoadingState label="Loading account" />
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
  const redemptionMinPoints = Math.max(0, Number(appUser.data?.user?.loyaltyRedemptionMinPoints || DEFAULT_LOYALTY_REDEMPTION_MIN_POINTS))
  const redemptionProgress = redemptionMinPoints > 0 ? Math.min(100, Math.round((points / redemptionMinPoints) * 100)) : 100
  const pointsToUnlock = Math.max(0, redemptionMinPoints - points)
  const redemptionUnlocked = points >= redemptionMinPoints
  const closeBookingDetails = () => {
    setSelectedBooking(null)
    if (requestedBookingReference) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('booking')
      setSearchParams(nextParams, { replace: true })
    }
  }

  return (
    <main className="overflow-hidden bg-ivory">
      <section className="relative overflow-hidden bg-stone-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_34%),linear-gradient(135deg,#111827,#1c1917_58%,#0c0a09)]" />
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
          <MetricCard icon={Gift} label="Group points" value={points.toLocaleString('en-IN')} text={redemptionUnlocked ? 'Eligible to redeem at checkout' : `Unlocks at ${redemptionMinPoints.toLocaleString('en-IN')} points`} />
          <MetricCard icon={Sparkles} label="Paid value" value={rupees(bookingStats.paid)} text="Confirmed payment value" />
        </div>

        <FadeIn viewport={false} className="mt-5 rounded-lg border border-white/70 bg-white/80 p-4 shadow-glass backdrop-blur-xl">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Redemption eligibility</p>
              <h2 className="mt-1 text-2xl font-black text-charcoal">{redemptionUnlocked ? 'Redeem points on your next booking' : 'Keep collecting group points'}</h2>
            </div>
            <span className="w-fit rounded-md bg-amber-50 px-3 py-2 text-sm font-black text-amber-900">{points.toLocaleString('en-IN')} / {redemptionMinPoints.toLocaleString('en-IN')} pts</span>
          </div>
          <div className="mt-4 overflow-hidden rounded-full bg-bone shadow-inner">
            <div className="h-3 rounded-full bg-[linear-gradient(90deg,#7f1d1d,#f59e0b)] transition-all duration-500" style={{ width: `${redemptionProgress}%` }} />
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-stone-600">
            {redemptionUnlocked ? 'The redeem option will appear automatically on checkout when your booking total can use points.' : `${pointsToUnlock.toLocaleString('en-IN')} more point${pointsToUnlock === 1 ? '' : 's'} needed before the redeem option appears during checkout.`}
          </p>
        </FadeIn>

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
                <StaggerItem key={booking.id} as="article" className="grid gap-4 overflow-hidden rounded-lg border border-stone-200 bg-white p-4 shadow-soft transition hover:-translate-y-1 hover:shadow-card lg:grid-cols-[minmax(0,1fr)_minmax(360px,460px)] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-2xl font-semibold">{booking.hotel_name}</p>
                    <p className="mt-1 truncate text-sm text-stone-500">{booking.room_type_name} / {booking.booking_reference}</p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-400">{booking.nights} night{Number(booking.nights) === 1 ? '' : 's'} / {booking.rooms_count} room{Number(booking.rooms_count) === 1 ? '' : 's'}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-stone-400">Booked {formatDateTime(booking.confirmed_at || booking.created_at)}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[135px_110px_minmax(0,1fr)] sm:items-center">
                    <p className="text-sm font-semibold leading-6 text-stone-600">{formatDate(booking.check_in)}<br />{formatDate(booking.check_out)}</p>
                    <StatusPill status={booking.status} />
                    <div className="rounded-md bg-bone p-3 text-sm">
                      <Line label="Total" value={money(booking.currency, booking.total_amount)} />
                      <Line label="Paid" value={money(booking.currency, booking.metadata?.paymentPlan?.paidAmount ?? booking.total_amount)} />
                      {Number(booking.metadata?.paymentPlan?.balanceDue || 0) > 0 ? <Line label="Due" value={money(booking.currency, booking.metadata.paymentPlan.balanceDue)} /> : null}
                    </div>
                    <div className="grid gap-2 sm:col-span-3 sm:grid-cols-2">
                      <button className="btn-primary !min-h-10 !px-3" type="button" onClick={() => setSelectedBooking(booking)}><Eye size={16} /> Open</button>
                      {receiptDownloadUrl(booking) ? <a className="btn-secondary !min-h-10 !px-3" href={receiptDownloadUrl(booking)} download={receiptFileName(booking)}><Download size={16} /> Receipt</a> : <span className="inline-flex min-h-10 items-center justify-center rounded-md border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-400">Preparing</span>}
                    </div>
                  </div>
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
      {selectedBooking ? (
        <BookingDetailsModal
          booking={selectedBooking}
          onCancellationRequested={(request) => {
            setSelectedBooking((current) => current ? {
              ...current,
              cancellation_request_id: request.id,
              cancellation_status: request.status,
              cancellation_reason_option: request.reason_option,
              cancellation_reason_text: request.reason_text,
              cancellation_requested_at: request.requested_at,
            } : current)
            setBookingRefreshKey((value) => value + 1)
          }}
          onClose={closeBookingDetails}
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

function BookingDetailsModal({ booking, onCancellationRequested, onClose }) {
  const metadata = booking.metadata || {}
  const pricing = metadata.pricing || {}
  const paymentPlan = metadata.paymentPlan || {}
  const gstClaim = metadata.gstClaim || booking.gst_claim || {}
  const selectedAmenities = Array.isArray(metadata.selectedAmenities) ? metadata.selectedAmenities : []
  const taxAmount = Number(booking.tax_amount || 0)
  const taxHalf = taxAmount / 2
  const [cancelForm, setCancelForm] = useState({ reasonOption: cancellationReasons[0], reasonText: '', loading: false, error: '', success: '' })
  const canRequestCancellation = ['confirmed', 'payment_pending', 'pending'].includes(booking.status) && !booking.cancellation_status

  async function requestCancellation(event) {
    event.preventDefault()
    setCancelForm((current) => ({ ...current, loading: true, error: '', success: '' }))
    try {
      const payload = {
        reasonOption: cancelForm.reasonOption,
        reasonText: cancelForm.reasonOption === 'Other' ? cancelForm.reasonText : cancelForm.reasonText || undefined,
      }
      const response = await apiFetch(`/me/bookings/${booking.booking_reference}/cancellation-requests`, { method: 'POST', body: payload })
      setCancelForm((current) => ({ ...current, loading: false, success: 'Cancellation request sent to the hotel.' }))
      onCancellationRequested?.(response.request)
    } catch (error) {
      setCancelForm((current) => ({ ...current, loading: false, error: error.message }))
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-charcoal/55 p-3 backdrop-blur-sm md:place-items-center" onMouseDown={onClose}>
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-lg border border-white/60 bg-ivory shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex flex-col justify-between gap-3 border-b border-mist bg-stone-900 p-4 text-white sm:flex-row sm:items-center sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-100">Booking details</p>
            <h2 className="mt-1 truncate text-2xl font-black sm:text-3xl">{booking.hotel_name}</h2>
            <p className="mt-1 text-sm font-semibold text-white/65">{booking.booking_reference} / {booking.room_type_name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {receiptDownloadUrl(booking) ? <a className="btn-primary !min-h-10 !px-3" href={receiptDownloadUrl(booking)} download={receiptFileName(booking)}><Download size={16} /> Download receipt</a> : <span className="inline-flex min-h-10 items-center rounded-md border border-white/20 px-3 text-sm font-bold text-white/55">Receipt preparing</span>}
            <button type="button" className="grid h-10 w-10 place-items-center rounded-md border border-white/20 bg-white/10" onClick={onClose} aria-label="Close booking details"><X size={18} /></button>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="grid gap-4">
            <div className="grid gap-3 rounded-lg border border-mist bg-white p-4 shadow-soft sm:grid-cols-4">
              <Info icon={ReceiptText} label="Reference" value={booking.booking_reference} />
              <Info icon={CalendarDays} label="Dates" value={`${formatDate(booking.check_in)} to ${formatDate(booking.check_out)}`} />
              <Info icon={Hotel} label="Rooms" value={`${booking.rooms_count} room${Number(booking.rooms_count) === 1 ? '' : 's'}`} />
              <Info icon={ShieldCheck} label="Status" value={booking.status || 'confirmed'} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DetailBlock title="Guest">
                <DetailLine label="Name" value={booking.guest_name} />
                <DetailLine label="Email" value={booking.guest_email} />
                <DetailLine label="Phone" value={booking.guest_phone || '-'} />
                <DetailLine label="Guests" value={`${booking.adults} adult${Number(booking.adults) === 1 ? '' : 's'}, ${booking.children || 0} child${Number(booking.children) === 1 ? '' : 'ren'}`} />
              </DetailBlock>
              <DetailBlock title="Room">
                <DetailLine label="Room type" value={booking.room_type_name} />
                <DetailLine label="Bed type" value={booking.bed_type || 'Premium bedding'} />
                <DetailLine label="Size" value={booking.size_sqft ? `${booking.size_sqft} sq ft` : '-'} />
                <DetailLine label="Stay" value={`${booking.nights} night${Number(booking.nights) === 1 ? '' : 's'}`} />
                <DetailLine label="Booking time" value={formatDateTime(booking.confirmed_at || booking.created_at)} />
              </DetailBlock>
            </div>

            {booking.cancellation_status ? (
              <DetailBlock title="Cancellation request">
                <DetailLine label="Status" value={booking.cancellation_status} />
                <DetailLine label="Reason" value={booking.cancellation_reason_option || '-'} />
                <DetailLine label="Requested" value={formatDateTime(booking.cancellation_requested_at)} />
                {booking.cancellation_refund_amount !== null && booking.cancellation_refund_amount !== undefined ? <DetailLine label="Manual refund" value={money(booking.currency, booking.cancellation_refund_amount)} /> : null}
                {booking.cancellation_admin_message ? <p className="text-sm font-semibold leading-7 text-stone-600">{booking.cancellation_admin_message}</p> : null}
              </DetailBlock>
            ) : null}

            {gstClaim.enabled ? (
              <DetailBlock title="GST claim details">
                <DetailLine label="Company" value={gstClaim.companyName || '-'} />
                <DetailLine label="GST number" value={gstClaim.gstNumber || '-'} />
                <DetailLine label="Address" value={gstClaim.companyAddress || '-'} />
              </DetailBlock>
            ) : null}

            {booking.room_description ? (
              <DetailBlock title="Room description">
                <p className="text-sm font-semibold leading-7 text-stone-600">{booking.room_description}</p>
              </DetailBlock>
            ) : null}

            <DetailBlock title="Selected add-ons">
              {selectedAmenities.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedAmenities.map((amenity) => (
                    <div key={amenity.id || amenity.name} className="rounded-md border border-mist bg-ivory p-3">
                      <p className="font-extrabold text-charcoal">{amenity.name}</p>
                      <p className="mt-1 text-sm font-semibold text-stone-500">{money(booking.currency, Number(amenity.price || 0) * Number(booking.rooms_count || 1))}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm font-semibold text-stone-500">No paid add-ons were selected for this booking.</p>}
            </DetailBlock>
          </section>

          <aside className="rounded-lg border border-mist bg-white p-4 shadow-soft lg:sticky lg:top-24 lg:self-start">
            <p className="eyebrow">Billing summary</p>
            <h3 className="mt-2 text-2xl font-black text-charcoal">{money(booking.currency, booking.total_amount)}</h3>
            <div className="mt-5 grid gap-3 text-sm">
              <DetailLine label="Room subtotal" value={money(booking.currency, pricing.roomSubtotal || booking.subtotal_amount)} />
              {selectedAmenities.length ? <DetailLine label="Selected add-ons" value={money(booking.currency, pricing.amenitySubtotal || 0)} /> : null}
              {metadata.offer?.discountAmount ? <DetailLine label={`Offer: ${metadata.offer.title || 'Discount'}`} value={`-${money(booking.currency, metadata.offer.discountAmount)}`} /> : null}
              {metadata.loyaltyRedemption?.amount ? <DetailLine label="Loyalty redemption" value={`-${money(booking.currency, metadata.loyaltyRedemption.amount)}`} /> : null}
              <DetailLine label="Taxable subtotal" value={money(booking.currency, booking.subtotal_amount)} />
              <DetailLine label="CGST (2.5%)" value={money(booking.currency, taxHalf)} />
              <DetailLine label="IGST (2.5%)" value={money(booking.currency, taxHalf)} />
              <div className="border-t border-mist pt-3">
                <DetailLine label="Paid now" value={money(booking.currency, paymentPlan.paidAmount ?? booking.total_amount)} strong />
                <DetailLine label="Balance due" value={money(booking.currency, paymentPlan.balanceDue || 0)} />
              </div>
            </div>
          </aside>
        </div>
        <div className="border-t border-mist bg-white/70 p-4 sm:p-5">
          {canRequestCancellation ? (
            <form className="grid gap-4 rounded-lg border border-red-100 bg-red-50/70 p-4" onSubmit={requestCancellation}>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-red-700">Cancel booking request</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-red-900/75">The hotel will review this request and share any manual refund amount.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Field label="Reason">
                  <select className="input" value={cancelForm.reasonOption} onChange={(event) => setCancelForm({ ...cancelForm, reasonOption: event.target.value })}>
                    {cancellationReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                  </select>
                </Field>
                {cancelForm.reasonOption === 'Other' ? <Field label="Other reason"><input className="input" value={cancelForm.reasonText} onChange={(event) => setCancelForm({ ...cancelForm, reasonText: event.target.value })} required /></Field> : null}
              </div>
              {cancelForm.reasonOption !== 'Other' ? <Field label="Message (optional)"><textarea className="input min-h-20 py-3" value={cancelForm.reasonText} onChange={(event) => setCancelForm({ ...cancelForm, reasonText: event.target.value })} /></Field> : null}
              {cancelForm.error ? <p className="rounded-md bg-white p-3 text-sm font-semibold text-red-700">{cancelForm.error}</p> : null}
              {cancelForm.success ? <p className="rounded-md bg-white p-3 text-sm font-semibold text-emerald-700">{cancelForm.success}</p> : null}
              <button className="btn-secondary w-full text-red-700 sm:w-fit" disabled={cancelForm.loading} type="submit">{cancelForm.loading ? 'Sending...' : 'Send cancellation request'}</button>
            </form>
          ) : booking.cancellation_status ? null : (
            <p className="rounded-md bg-bone p-3 text-sm font-semibold text-stone-500">This booking cannot be cancelled from the account panel.</p>
          )}
        </div>
      </div>
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

function DetailBlock({ title, children }) {
  return (
    <section className="rounded-lg border border-mist bg-white p-4 shadow-soft">
      <h3 className="text-lg font-black text-charcoal">{title}</h3>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  )
}

function DetailLine({ label, value, strong = false }) {
  return (
    <p className="flex items-start justify-between gap-4 text-sm">
      <span className="font-semibold text-stone-500">{label}</span>
      <span className={`max-w-[62%] break-words text-right ${strong ? 'text-base font-black text-charcoal' : 'font-extrabold text-charcoal'}`}>{value || '-'}</span>
    </p>
  )
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

function rupees(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function receiptFileName(booking) {
  return `${booking.invoice_number || `INV-${booking.booking_reference}`}.pdf`
}

function formatDate(value) {
  if (!value) return 'TBA'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function firstName(value) {
  return String(value || 'Guest').split(/[ @]/).filter(Boolean)[0] || 'Guest'
}
