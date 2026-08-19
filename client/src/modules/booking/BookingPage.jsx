import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bath, BedDouble, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, CreditCard, Gift, Loader2, ShieldCheck, UsersRound, Wifi } from 'lucide-react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../auth/authContext.js'
import { apiFetch } from '../../services/apiClient.js'
import { getSavedTenantKey, resolveTenantFromLocation } from '../tenant/resolveTenant.js'

const fallbackRoomImage = 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80'

function defaultDates() {
  const start = new Date()
  start.setDate(start.getDate() + 1)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
}

function queryValue(params, key, fallback) {
  return params.get(key) || fallback
}

export function BookingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { isAuthenticated, firebaseUser, loading: authLoading } = useAuth()
  const [defaultCheckIn, defaultCheckOut] = defaultDates()
  const [form, setForm] = useState({
    checkIn: queryValue(params, 'checkIn', defaultCheckIn),
    checkOut: queryValue(params, 'checkOut', defaultCheckOut),
    roomsCount: Number(queryValue(params, 'roomsCount', '1')),
    adults: Number(queryValue(params, 'adults', '2')),
    children: Number(queryValue(params, 'children', '0')),
    guestName: '',
    guestEmail: '',
    guestPhone: '',
  })
  const [availableRooms, setAvailableRooms] = useState([])
  const [selectedRoomId, setSelectedRoomId] = useState(params.get('roomTypeId') || '')
  const [selectedOfferId, setSelectedOfferId] = useState(params.get('offerId') || '')
  const [paymentMode, setPaymentMode] = useState(params.get('paymentMode') === 'partial' ? 'partial' : 'full')
  const [searched, setSearched] = useState(false)
  const [status, setStatus] = useState({ loading: false, error: '', paymentError: '' })
  const initialAvailabilityLoaded = useRef(false)
  const loadAvailabilityRef = useRef(null)
  const { data, loading, error } = useAsync(() => apiFetch('/tenant'), authLoading ? 'auth-loading' : `${firebaseUser?.uid || 'guest'}:${firebaseUser?.emailVerified ? 'verified' : 'unverified'}`)
  const step = params.get('step') || 'list'

  const allRooms = useMemo(() => data?.rooms || [], [data])
  const offers = useMemo(() => data?.offers || [], [data])
  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) || null,
    [offers, selectedOfferId],
  )
  const roomsForDisplay = searched ? availableRooms : allRooms
  const hasInitialSearchParams = Boolean(params.get('checkIn') && params.get('checkOut'))
  const selectedRoom = useMemo(
    () => roomsForDisplay.find((room) => room.id === selectedRoomId) || null,
    [roomsForDisplay, selectedRoomId],
  )
  const detailRoom = useMemo(
    () => selectedRoom || roomsForDisplay[0] || null,
    [roomsForDisplay, selectedRoom],
  )
  const nights = useMemo(() => nightsBetween(form.checkIn, form.checkOut), [form.checkIn, form.checkOut])
  const stayDateError = useMemo(() => getStayDateError(form.checkIn, form.checkOut), [form.checkIn, form.checkOut])
  const minCheckOut = useMemo(() => addDays(form.checkIn, 1), [form.checkIn])
  const priceRoom = selectedRoom || detailRoom
  const roomNightPrice = priceRoom ? Number(priceRoom.subtotal ? priceRoom.subtotal / Math.max(nights, 1) : priceRoom.offer_price || priceRoom.base_price) : 0
  const roomSubtotal = priceRoom ? Number(priceRoom.subtotal || roomNightPrice * nights) * Number(form.roomsCount || 1) : 0
  const offerDiscount = calculateOfferDiscount(selectedOffer, roomSubtotal)
  const subtotal = Math.max(0, roundMoney(roomSubtotal - offerDiscount))
  const tax = data?.hotel ? roundMoney((subtotal * Number(data.hotel.tax_rate || 0)) / 100) : 0
  const total = roundMoney(subtotal + tax)
  const paymentDue = paymentMode === 'partial' ? roundMoney(total * 0.25) : total
  const balanceDue = roundMoney(total - paymentDue)
  const loyaltyPoints = Math.floor(total / 100)

  useEffect(() => {
    if (!form.guestEmail && firebaseUser?.email) {
      setForm((current) => ({
        ...current,
        guestName: current.guestName || firebaseUser.displayName || '',
        guestEmail: current.guestEmail || firebaseUser.email || '',
      }))
    }
  }, [firebaseUser, form.guestEmail])

  useEffect(() => {
    if (!selectedRoomId && allRooms[0]) {
      setSelectedRoomId(allRooms[0].id)
    }
  }, [allRooms, selectedRoomId])

  useEffect(() => {
    if (selectedOfferId && offers.length && !offers.some((offer) => offer.id === selectedOfferId)) {
      setSelectedOfferId('')
    }
  }, [offers, selectedOfferId])

  useEffect(() => {
    loadAvailabilityRef.current = loadAvailability
  })

  useEffect(() => {
    if (initialAvailabilityLoaded.current || loading || !allRooms.length || !hasInitialSearchParams || stayDateError) return
    initialAvailabilityLoaded.current = true
    void loadAvailabilityRef.current?.({
      preferredRoomId: selectedRoomId || params.get('roomTypeId') || allRooms[0]?.id || '',
      silent: true,
    })
  }, [allRooms, hasInitialSearchParams, loading, params, selectedRoomId, stayDateError])

  function updateStayForm(next) {
    setForm(next)
    setSearched(false)
    setAvailableRooms([])
    setStatus({ loading: false, error: '', paymentError: '' })
  }

  function updateCheckIn(checkIn) {
    const checkOut = getStayDateError(checkIn, form.checkOut) ? addDays(checkIn, 1) : form.checkOut
    updateStayForm({ ...form, checkIn, checkOut })
  }

  function updateCheckOut(checkOut) {
    updateStayForm({ ...form, checkOut })
  }

  function syncUrl(nextForm = form, roomTypeId = selectedRoomId, extra = {}) {
    const next = new URLSearchParams()
    next.set('checkIn', nextForm.checkIn)
    next.set('checkOut', nextForm.checkOut)
    next.set('roomsCount', String(nextForm.roomsCount))
    next.set('adults', String(nextForm.adults))
    next.set('children', String(nextForm.children))
    if (roomTypeId) next.set('roomTypeId', roomTypeId)
    const tenant = resolveTenantFromLocation()
    const hotel = params.get('hotel') || (tenant.isTenant ? tenant.key : null) || getSavedTenantKey()
    if (hotel) next.set('hotel', hotel)
    if (extra.step) next.set('step', extra.step)
    const offerId = extra.offerId ?? selectedOfferId
    if (offerId) next.set('offerId', offerId)
    const mode = extra.paymentMode ?? paymentMode
    if (mode === 'partial') next.set('paymentMode', mode)
    setParams(next, { replace: true })
    return next
  }

  function chooseOffer(offerId) {
    const nextOfferId = selectedOfferId === offerId ? '' : offerId
    setSelectedOfferId(nextOfferId)
    syncUrl(form, selectedRoomId, { step: step === 'review' ? 'review' : undefined, offerId: nextOfferId })
  }

  function choosePaymentMode(mode) {
    setPaymentMode(mode)
    syncUrl(form, selectedRoomId, { step: step === 'review' ? 'review' : undefined, paymentMode: mode })
  }

  async function loadAvailability(options = {}) {
    const preferredRoomId = options.preferredRoomId ?? selectedRoomId
    const dateError = getStayDateError(form.checkIn, form.checkOut)
    if (dateError) {
      setStatus({ loading: false, error: dateError, paymentError: '' })
      return null
    }
    setStatus({ loading: true, error: '', paymentError: '' })
    syncUrl(form, preferredRoomId)
    try {
      const search = new URLSearchParams({
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        roomsCount: String(form.roomsCount),
        adults: String(form.adults),
        children: String(form.children),
      })
      const payload = await apiFetch(`/availability?${search.toString()}`)
      setAvailableRooms(payload.rooms)
      setSearched(true)
      const selectedStillAvailable = payload.rooms.some((room) => room.id === preferredRoomId)
      const firstRoom = payload.rooms[0]
      const nextRoomId = selectedStillAvailable ? preferredRoomId : firstRoom?.id || ''
      setSelectedRoomId(nextRoomId)
      syncUrl(form, nextRoomId)
      setStatus({ loading: false, error: payload.rooms.length || options.silent ? '' : 'No rooms are available for those dates. Try another date range.', paymentError: '' })
      return { rooms: payload.rooms, nextRoomId }
    } catch (err) {
      setStatus({ loading: false, error: err.message, paymentError: '' })
      return null
    }
  }

  async function searchRooms(event) {
    event?.preventDefault()
    await loadAvailability()
  }

  async function selectRoom(room) {
    if (status.loading) return
    if (stayDateError) {
      setStatus({ loading: false, error: stayDateError, paymentError: '' })
      backToRooms()
      return
    }

    const availability = searched ? { rooms: availableRooms } : await loadAvailability({ preferredRoomId: room.id, silent: true })
    if (!availability) return

    const availableRoom = availability.rooms.find((availableRoom) => availableRoom.id === room.id)
    if (!availableRoom) {
      setStatus({ loading: false, error: 'This room is not available for the selected dates. Try another date range.', paymentError: '' })
      return
    }
    setSelectedRoomId(room.id)
    const next = syncUrl(form, room.id, { step: 'review' })
    if (!isAuthenticated) {
      const returnTo = encodeURIComponent(`${location.pathname}?${next.toString()}`)
      navigate(`/login?returnTo=${returnTo}`)
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openDetails(room) {
    if (stayDateError) {
      setStatus({ loading: false, error: stayDateError, paymentError: '' })
      return
    }
    if (searched && !availableRooms.some((availableRoom) => availableRoom.id === room.id)) {
      setStatus({ loading: false, error: 'This room is not available for the selected dates. Try another date range.', paymentError: '' })
      return
    }
    setSelectedRoomId(room.id)
    syncUrl(form, room.id, { step: 'details' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function backToRooms() {
    syncUrl(form, selectedRoomId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function requireLogin() {
    const next = syncUrl(form, selectedRoomId)
    const returnTo = encodeURIComponent(`${location.pathname}?${next.toString()}`)
    navigate(`/login?returnTo=${returnTo}`)
  }

  async function proceedToPayment() {
    if (status.loading) return
    if (stayDateError) {
      setStatus({ loading: false, error: stayDateError, paymentError: stayDateError })
      return
    }
    if (!selectedRoom) {
      setStatus({ loading: false, error: 'Select an available room before continuing.', paymentError: 'Select an available room before continuing.' })
      return
    }
    if (!searched || !availableRooms.some((room) => room.id === selectedRoom.id)) {
      const availability = await loadAvailability({ preferredRoomId: selectedRoom.id, silent: true })
      if (!availability?.rooms.some((room) => room.id === selectedRoom.id)) {
        setStatus({ loading: false, error: 'This room is not available for the selected dates. Please choose another room.', paymentError: 'This room is not available for the selected dates. Please choose another room.' })
        return
      }
    }
    if (!isAuthenticated) {
      requireLogin()
      return
    }

    setStatus({ loading: true, error: '', paymentError: '' })
    try {
      const hold = await apiFetch('/bookings/hold', {
        method: 'POST',
        body: {
          roomTypeId: selectedRoom.id,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          roomsCount: Number(form.roomsCount),
          adults: Number(form.adults),
          children: Number(form.children),
          guestName: form.guestName || firebaseUser?.displayName || firebaseUser?.email,
          guestEmail: form.guestEmail || firebaseUser?.email,
          guestPhone: form.guestPhone || undefined,
          offerId: selectedOffer?.id || undefined,
          paymentMode,
        },
      })

      if (hold.paymentOrder.id.startsWith('order_dev_')) {
        const confirmed = await apiFetch('/payments/verify', {
          method: 'POST',
          body: {
            razorpayOrderId: hold.paymentOrder.id,
            razorpayPaymentId: `dev_payment_${hold.booking.booking_reference}`,
            razorpaySignature: `dev_signature_${hold.booking.booking_reference}`,
          },
        })
        navigate(`/confirmation/${confirmed.booking.booking_reference}`, { state: { booking: confirmed.booking } })
        return
      }

      if (!window.Razorpay) {
        setStatus({ loading: false, error: '', paymentError: 'Payment checkout could not load. Please refresh and try again.' })
        return
      }

      const checkout = new window.Razorpay({
        key: hold.paymentOrder.keyId,
        order_id: hold.paymentOrder.id,
        amount: hold.paymentOrder.amount,
        currency: hold.paymentOrder.currency,
        name: data.hotel.name,
        description: `${selectedRoom.name} / ${form.checkIn} to ${form.checkOut}`,
        prefill: {
          name: form.guestName || firebaseUser?.displayName,
          email: form.guestEmail || firebaseUser?.email,
          contact: form.guestPhone,
        },
        config: {
          display: {
            blocks: {
              upi: {
                name: 'Pay via UPI',
                instruments: [{ method: 'upi' }],
              },
            },
            sequence: ['block.upi'],
            preferences: {
              show_default_blocks: true,
            },
          },
        },
        handler: async (response) => {
          try {
            const confirmed = await apiFetch('/payments/verify', {
              method: 'POST',
              body: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            })
            navigate(`/confirmation/${confirmed.booking.booking_reference}`, { state: { booking: confirmed.booking } })
          } catch (err) {
            setStatus({ loading: false, error: '', paymentError: err.message })
          }
        },
        modal: {
          ondismiss: () => setStatus({ loading: false, error: '', paymentError: 'Payment was cancelled. Your details are still here so you can retry.' }),
        },
      })
      checkout.on('payment.failed', (response) => {
        setStatus({ loading: false, error: '', paymentError: response.error?.description || 'Payment failed. Please try again.' })
      })
      checkout.open()
    } catch (err) {
      const unavailable = err.message.toLowerCase().includes('available') || err.message.toLowerCase().includes('inventory')
      setStatus({
        loading: false,
        error: unavailable ? 'That room changed during checkout. Please search again and choose another available room.' : err.message,
        paymentError: unavailable ? 'That room is not available for the selected dates. Please search again.' : err.message,
      })
      if (unavailable) {
        setAvailableRooms([])
        setSearched(false)
      }
    }
  }

  if (loading || authLoading) return <LoadingState label="Preparing secure booking" />
  if (error) return <main className="container-page py-12 text-red-700">{error.message}</main>

  if (!data.rooms.length) {
    return (
      <main className="container-page grid min-h-[70vh] place-items-center py-12">
        <section className="surface max-w-xl p-7 text-center shadow-soft">
          <p className="eyebrow">{data.hotel.name}</p>
          <h1 className="mt-2 text-4xl">Booking is not open yet</h1>
          <p className="mt-4 text-sm leading-6 text-stone-600">This hotel is live, but room categories and inventory are not published yet.</p>
        </section>
      </main>
    )
  }

  if (step === 'details' && detailRoom) {
    return <RoomDetails room={detailRoom} hotel={data.hotel} form={form} nights={nights} onBook={() => selectRoom(detailRoom)} onClose={backToRooms} />
  }

  if (step === 'review') {
    return (
      <BookingReviewPage
        data={data}
        priceRoom={priceRoom}
        fallbackRoomImage={fallbackRoomImage}
        form={form}
        setForm={setForm}
        nights={nights}
        roomSubtotal={roomSubtotal}
        subtotal={subtotal}
        selectedOffer={selectedOffer}
        selectedOfferId={selectedOfferId}
        offerDiscount={offerDiscount}
        tax={tax}
        total={total}
        paymentMode={paymentMode}
        paymentDue={paymentDue}
        balanceDue={balanceDue}
        loyaltyPoints={loyaltyPoints}
        offers={offers}
        status={status}
        isAuthenticated={isAuthenticated}
        selectedRoom={selectedRoom}
        stayDateError={stayDateError}
        onBack={backToRooms}
        onSelectOffer={chooseOffer}
        onPaymentMode={choosePaymentMode}
        onPay={proceedToPayment}
      />
    )
  }

  return (
    <main className="bg-ivory">
      <section className="bg-charcoal text-white">
        <div className="container-page py-12 md:py-16">
          <FadeIn viewport={false}>
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-stone-400">{data.hotel.name}</p>
            <h1 className="mt-3 text-5xl font-semibold leading-none md:text-7xl">Reserve your stay</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-300">Search live inventory, compare room experiences, review your stay, then pay securely.</p>
          </FadeIn>
        </div>
      </section>

      <section className="container-page -mt-8 pb-16 md:pb-24">
        <FadeIn viewport={false} className="relative z-20">
          <form onSubmit={searchRooms} className="glass-panel grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.8fr_0.8fr_0.8fr_auto] lg:items-end">
            <DatePicker label="Check-in" value={form.checkIn} onChange={updateCheckIn} />
            <DatePicker label="Check-out" value={form.checkOut} min={minCheckOut} onChange={updateCheckOut} />
            <Field label="Adults"><Stepper value={form.adults} min={1} onChange={(value) => updateStayForm({ ...form, adults: value })} /></Field>
            <Field label="Children"><Stepper value={form.children} min={0} onChange={(value) => updateStayForm({ ...form, children: value })} /></Field>
            <Field label="Rooms"><Stepper value={form.roomsCount} min={1} onChange={(value) => updateStayForm({ ...form, roomsCount: value })} /></Field>
            <button className="btn-primary h-12 w-full px-5" type="submit" disabled={status.loading || Boolean(stayDateError)}>
              {status.loading ? <Loader2 size={18} className="animate-spin" /> : <CalendarCheck size={18} />} Search Rooms
            </button>
          </form>
        </FadeIn>

        {(status.error || stayDateError) ? <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{status.error || stayDateError}</p> : null}

        {offers.length ? <BookingOfferBand offers={offers} selectedOfferId={selectedOfferId} onSelectOffer={chooseOffer} /> : null}

        <div className="mt-7">
          <section className="grid gap-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-4xl font-semibold">{searched ? 'Available rooms' : 'Room choices'}</h2>
                <p className="mt-1 text-sm text-stone-600">
                  {searched ? `${availableRooms.length} room type${availableRooms.length === 1 ? '' : 's'} match your dates` : 'Choose dates, search availability, then book your room.'}
                </p>
              </div>
            </div>

            {(searched ? availableRooms : allRooms).length ? (
              <Stagger className="grid gap-5 md:grid-cols-2">
                {(searched ? availableRooms : allRooms).map((room) => (
                  <RoomCard key={room.id} room={room} searched={searched} selected={room.id === selectedRoomId} loading={status.loading} onDetails={() => openDetails(room)} onBook={() => selectRoom(room)} />
                ))}
              </Stagger>
            ) : (
              <div className="panel p-8 text-center">
                <h3 className="text-3xl">No rooms available</h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">Try another date range or reduce the number of guests.</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

function BookingOfferBand({ offers, selectedOfferId, onSelectOffer }) {
  return (
    <FadeIn className="relative z-0 mt-6 rounded-lg border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(247,247,247,0.9),rgba(127,29,29,0.08))] p-4 shadow-soft backdrop-blur-xl">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Apply offer</p>
          <h2 className="mt-1 text-2xl font-extrabold">Direct booking savings</h2>
        </div>
        <p className="max-w-md text-sm font-semibold leading-6 text-stone-600">Choose an offer now; final eligibility and discount are checked again before payment.</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {offers.slice(0, 3).map((offer) => (
          <OfferChoiceCard key={offer.id} offer={offer} selected={selectedOfferId === offer.id} onSelect={() => onSelectOffer(offer.id)} compact />
        ))}
      </div>
    </FadeIn>
  )
}

function OfferChoiceCard({ offer, selected, onSelect, compact = false }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group min-h-40 rounded-md border bg-white/90 p-4 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-card ${selected ? 'border-amberline ring-2 ring-amberline/20' : 'border-mist'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-md bg-charcoal px-3 py-2 text-xs font-black uppercase text-white">
          <Gift size={15} /> {offer.badge || (offer.audience_type === 'repeat_guest' ? 'For you' : 'Offer')}
        </span>
        <span className={`rounded-md px-2 py-1 text-xs font-black ${selected ? 'bg-amberline text-white' : 'bg-bone text-stone-600'}`}>{selected ? 'Applied' : 'Apply'}</span>
      </div>
      <h3 className={`mt-4 font-extrabold leading-tight ${compact ? 'text-lg' : 'text-xl'}`}>{offer.title}</h3>
      <p className="mt-2 text-sm font-black text-amberline">{formatOfferValue(offer)}</p>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{offer.description}</p>
    </button>
  )
}

function RoomCard({ room, searched, selected, loading, onDetails, onBook }) {
  const unavailable = searched && Number(room.available_rooms || 0) < 1
  const displayPrice = room.offer_price || room.base_price
  return (
    <StaggerItem as="article" className={`group flex h-full flex-col overflow-hidden rounded-lg border border-mist bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-card ${selected ? 'ring-2 ring-amberline' : ''}`}>
      <div className="image-lift rounded-none">
        <img src={room.hero_image_url || fallbackRoomImage} alt={room.name} className="h-56 w-full object-cover" />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{room.bed_type || 'Premium room'}</p>
            <h3 className="mt-2 text-2xl font-bold leading-tight">{room.name}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">{room.description}</p>
          </div>
          <div className="shrink-0">
            <p className="text-xs font-bold uppercase text-stone-500">From</p>
            {room.offer_price ? <p className="text-sm font-bold text-stone-400 line-through">Rs {Number(room.base_price).toLocaleString('en-IN')}</p> : null}
            <p className="text-2xl font-black">Rs {Number(displayPrice).toLocaleString('en-IN')}</p>
            <p className="text-xs font-semibold text-stone-500">per night</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(room.amenities || []).slice(0, 4).map((amenity) => <span key={amenity} className="rounded-md bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600">{amenity}</span>)}
        </div>
        <div className="mt-auto grid gap-3 border-t border-mist pt-4">
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-stone-600">
            <span className="flex items-center gap-1"><UsersRound size={16} /> {room.occupancy_adults} adults, {room.occupancy_children} children</span>
            <span className="flex items-center gap-1"><BedDouble size={16} /> {searched ? `${room.available_rooms} available` : 'Search dates'}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={onDetails}>View details</button>
            <button className="btn-primary !min-h-10 !px-4" type="button" onClick={onBook} disabled={loading || unavailable}>
              {loading && selected ? <Loader2 size={16} className="animate-spin" /> : null}
              {searched ? 'Book room' : 'Check & book'}
            </button>
          </div>
        </div>
      </div>
    </StaggerItem>
  )
}

function BookingReviewPage({ data, priceRoom, fallbackRoomImage, form, setForm, nights, roomSubtotal, subtotal, selectedOffer, selectedOfferId, offerDiscount, tax, total, paymentMode, paymentDue, balanceDue, loyaltyPoints, offers, status, isAuthenticated, selectedRoom, stayDateError, onBack, onSelectOffer, onPaymentMode, onPay }) {
  return (
    <main className="bg-ivory">
      <section className="bg-charcoal text-white">
        <div className="container-page py-12 md:py-16">
          <FadeIn viewport={false}>
            <button className="btn-dark !min-h-10 !px-4" type="button" onClick={onBack}>Back to rooms</button>
            <p className="mt-8 text-xs font-extrabold uppercase tracking-[0.22em] text-stone-400">Booking review</p>
            <h1 className="mt-3 text-5xl font-semibold leading-none md:text-7xl">{priceRoom?.name || 'Select a room'}</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-300">Confirm guest details and complete the payment securely.</p>
          </FadeIn>
        </div>
      </section>

      <section className="container-page -mt-8 pb-16 md:pb-24">
        <FadeIn viewport={false} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
          <div className="panel self-start overflow-hidden">
            {priceRoom ? <img src={priceRoom.hero_image_url || fallbackRoomImage} alt={priceRoom.name} className="h-80 w-full object-cover" /> : null}
            <div className="p-5 md:p-7">
              <p className="eyebrow">Selected room</p>
              <h2 className="mt-2 text-3xl font-bold">{priceRoom?.name || 'Room not selected'}</h2>
              <p className="mt-3 leading-7 text-stone-600">{priceRoom?.description}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Detail icon={UsersRound} label="Occupancy" value={priceRoom ? `${priceRoom.occupancy_adults} adults, ${priceRoom.occupancy_children} children` : '-'} />
                <Detail icon={BedDouble} label="Bed" value={priceRoom?.bed_type || 'Premium bedding'} />
                <Detail icon={Bath} label="Size" value={priceRoom?.size_sqft ? `${priceRoom.size_sqft} sq ft` : 'Spacious'} />
              </div>
              {offers.length ? (
                <div className="mt-7">
                  <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
                    <div>
                      <p className="eyebrow">Offers</p>
                      <h3 className="mt-1 text-2xl font-extrabold">Apply a booking offer</h3>
                    </div>
                    {selectedOffer ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Saving Rs {offerDiscount.toLocaleString('en-IN')}</p> : null}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {offers.slice(0, 4).map((offer) => (
                      <OfferChoiceCard key={offer.id} offer={offer} selected={selectedOfferId === offer.id} onSelect={() => onSelectOffer(offer.id)} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="glass-panel self-start overflow-hidden">
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-stone-500">Booking summary</p>
              <h2 className="mt-2 text-2xl font-extrabold">{data.hotel.name}</h2>
              <div className="mt-5 space-y-3 border-y border-mist py-4 text-sm">
                <Line label="Dates" value={`${form.checkIn} to ${form.checkOut}`} />
                <Line label="Nights" value={nights > 0 ? nights : 'Check dates'} />
                <Line label="Guests" value={`${form.adults} adults, ${form.children} children`} />
                <Line label="Rooms" value={form.roomsCount} />
                <Line label="Room price" value={priceRoom ? `Rs ${Number(priceRoom.offer_price || priceRoom.base_price).toLocaleString('en-IN')}/night` : '-'} />
                <Line label="Room subtotal" value={`Rs ${roomSubtotal.toLocaleString('en-IN')}`} />
                {selectedOffer ? <Line label={selectedOffer.title} value={`- Rs ${offerDiscount.toLocaleString('en-IN')}`} /> : null}
                <Line label="Taxable subtotal" value={`Rs ${subtotal.toLocaleString('en-IN')}`} />
                <Line label="Taxes" value={`Rs ${tax.toLocaleString('en-IN')}`} />
              </div>
              {selectedOffer ? (
                <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-900"><Gift size={17} /> Offer applied</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-stone-600">{formatOfferValue(selectedOffer)} has been applied to this booking. Server will recheck it before payment.</p>
                </div>
              ) : offers.length ? (
                <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Select an offer card to apply a discount before payment.</p>
              ) : null}
              <div className="mt-4 flex items-end justify-between">
                <span className="text-sm font-bold text-stone-500">Booking total</span>
                <span className="text-2xl font-black">Rs {total.toLocaleString('en-IN')}</span>
              </div>
              <div className="mt-5 grid gap-3">
                <p className="text-xs font-bold uppercase text-stone-500">Payment option</p>
                <PaymentOption
                  active={paymentMode === 'full'}
                  title="Pay full amount"
                  amount={total}
                  note="Complete payment now. No balance remains at check-in."
                  onClick={() => onPaymentMode('full')}
                />
                <PaymentOption
                  active={paymentMode === 'partial'}
                  title="Pay 25% advance"
                  amount={roundMoney(total * 0.25)}
                  note={`Pay the balance Rs ${roundMoney(total * 0.75).toLocaleString('en-IN')} at the hotel.`}
                  onClick={() => onPaymentMode('partial')}
                />
              </div>
              <div className="mt-4 rounded-md border border-mist bg-white p-3 text-sm">
                <Line label="Pay now" value={`Rs ${paymentDue.toLocaleString('en-IN')}`} />
                <Line label="Balance due" value={`Rs ${balanceDue.toLocaleString('en-IN')}`} />
              </div>
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900"><Gift size={17} /> Loyalty rewards</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-stone-600">Every Rs 100 earns 1 point. This booking can earn {loyaltyPoints.toLocaleString('en-IN')} point{loyaltyPoints === 1 ? '' : 's'} after payment confirmation.</p>
              </div>

              {isAuthenticated ? (
                <div className="mt-5 grid gap-3">
                  <Field label="Guest name"><input className="input" value={form.guestName} onChange={(event) => setForm({ ...form, guestName: event.target.value })} /></Field>
                  <Field label="Guest email"><input className="input" type="email" value={form.guestEmail} onChange={(event) => setForm({ ...form, guestEmail: event.target.value })} /></Field>
                  <Field label="Phone"><input className="input" value={form.guestPhone} onChange={(event) => setForm({ ...form, guestPhone: event.target.value })} /></Field>
                </div>
              ) : (
                <p className="mt-5 rounded-md bg-ivory p-3 text-sm font-semibold text-stone-600">Sign in or create a guest account to continue. Your selected room and dates will stay here.</p>
              )}

              {(status.paymentError || status.error || stayDateError) ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{status.paymentError || status.error || stayDateError}</p> : null}
              <button
                className="btn-primary mt-5 w-full"
                onClick={onPay}
                disabled={status.loading || !selectedRoom || Boolean(stayDateError) || (isAuthenticated && (!form.guestEmail || !form.guestName))}
              >
                {status.loading ? <Loader2 size={18} className="animate-spin" /> : isAuthenticated ? <CreditCard size={18} /> : <ChevronRight size={18} />}
                {isAuthenticated ? `Pay Rs ${paymentDue.toLocaleString('en-IN')}` : 'Login / Sign up to Book'}
              </button>
              <p className="mt-4 flex items-start gap-2 text-xs font-semibold leading-5 text-stone-500">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-amberline" />
                Availability and final price are rechecked on the server before payment order creation.
              </p>
            </div>
          </div>
        </FadeIn>
      </section>
    </main>
  )
}

function PaymentOption({ active, title, amount, note, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-card ${active ? 'border-amberline bg-amber-50 ring-2 ring-amberline/15' : 'border-mist bg-white'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-extrabold text-charcoal">{title}</span>
        <span className={`rounded-md px-2 py-1 text-xs font-black uppercase ${active ? 'bg-amberline text-white' : 'bg-bone text-stone-600'}`}>{active ? 'Selected' : 'Select'}</span>
      </div>
      <p className="mt-2 text-xl font-black">Rs {Number(amount || 0).toLocaleString('en-IN')}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-stone-600">{note}</p>
    </button>
  )
}

function RoomDetails({ room, hotel, form, nights, onBook, onClose }) {
  const gallery = Array.isArray(room.gallery) && room.gallery.length ? room.gallery : [{ url: room.hero_image_url || fallbackRoomImage, alt: room.name }]
  const amenityItems = Array.isArray(room.amenity_items) ? room.amenity_items : []
  return (
    <main className="bg-ivory">
      <section className="bg-charcoal text-white">
        <div className="container-page py-12 md:py-16">
          <FadeIn viewport={false}>
            <button className="btn-dark !min-h-10 !px-4" type="button" onClick={onClose}>Back to rooms</button>
            <p className="mt-8 text-xs font-extrabold uppercase tracking-[0.22em] text-stone-400">{hotel.name}</p>
            <h1 className="mt-3 text-5xl font-semibold leading-none md:text-7xl">{room.name}</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-300">{room.bed_type || 'Premium room'} / {room.size_sqft || 'Flexible'} sq ft</p>
          </FadeIn>
        </div>
      </section>

      <section className="container-page -mt-8 pb-16 md:pb-24">
        <FadeIn viewport={false} className="overflow-hidden rounded-lg border border-mist bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-mist bg-white p-4">
          <div>
            <p className="eyebrow">Room details</p>
            <h2 className="text-2xl font-bold">{room.name}</h2>
          </div>
          <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={onBook}>Book room</button>
        </div>

        <div className="grid gap-2 p-2 md:grid-cols-[1.4fr_0.8fr]">
          <img src={gallery[0]?.url || fallbackRoomImage} alt={gallery[0]?.alt || room.name} className="h-80 w-full rounded-md object-cover" />
          <div className="grid gap-2">
            {(gallery.slice(1, 3).length ? gallery.slice(1, 3) : gallery.slice(0, 2)).map((image, index) => (
              <img key={`${image.url}-${index}`} src={image.url || fallbackRoomImage} alt={image.alt || room.name} className="h-[9.75rem] w-full rounded-md object-cover" />
            ))}
          </div>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_300px]">
          <div>
            <p className="mt-3 leading-7 text-stone-600">{room.description}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Detail icon={UsersRound} label="Occupancy" value={`${room.occupancy_adults} adults, ${room.occupancy_children} children`} />
              <Detail icon={BedDouble} label="Bed" value={room.bed_type || 'Premium bedding'} />
              <Detail icon={Bath} label="Size" value={room.size_sqft ? `${room.size_sqft} sq ft` : 'Spacious'} />
            </div>
            <h3 className="mt-6 font-extrabold">Amenities</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(amenityItems.length ? amenityItems : (room.amenities?.length ? room.amenities.map((name) => ({ name })) : ['Premium linen', 'Housekeeping', 'Secure booking', 'Concierge'].map((name) => ({ name })))).map((amenity) => (
                <span key={amenity.id || amenity.name} className="flex items-center justify-between gap-2 text-sm font-semibold text-stone-600"><span className="flex items-center gap-2"><Wifi size={16} className="text-amberline" /> {amenity.name}</span><span>{amenity.price ? `Rs ${Number(amenity.price).toLocaleString('en-IN')}` : 'Included'}</span></span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-bone p-4">
            <p className="text-xs font-bold uppercase text-stone-500">Selected stay</p>
            <div className="mt-4 space-y-3 text-sm">
              <Line label="Dates" value={`${form.checkIn} to ${form.checkOut}`} />
              <Line label="Nights" value={nights > 0 ? nights : 'Check dates'} />
              <Line label="Guests" value={`${form.adults} adults, ${form.children} children`} />
              <Line label="Policy" value={hotel.policies?.cancellation || 'Hotel policy applies'} />
            </div>
            <button className="btn-primary mt-5 w-full" type="button" onClick={onBook}>Book room</button>
          </div>
        </div>
      </FadeIn>
      </section>
    </main>
  )
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="rounded-md border border-mist bg-white p-3">
      <Icon size={18} className="text-amberline" />
      <p className="mt-2 text-xs font-bold uppercase text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-extrabold">{value}</p>
    </div>
  )
}

function Stepper({ value, min, onChange }) {
  return (
    <div className="flex h-12 items-center justify-between rounded-md border border-mist bg-white px-2">
      <button className="grid h-8 w-8 place-items-center rounded-md bg-steel text-lg font-black" type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, Number(value) - 1))}>-</button>
      <span className="font-extrabold">{value}</span>
      <button className="grid h-8 w-8 place-items-center rounded-md bg-steel text-lg font-black" type="button" aria-label="Increase" onClick={() => onChange(Number(value) + 1)}>+</button>
    </div>
  )
}

function DatePicker({ label, value, min, onChange }) {
  const [open, setOpen] = useState(false)
  const current = parseDateValue(value) || new Date()
  const [viewDate, setViewDate] = useState(new Date(current.getFullYear(), current.getMonth(), 1))
  const days = useMemo(() => calendarDays(viewDate), [viewDate])
  const minDate = min ? parseDateValue(min) : null

  function selectDay(day) {
    if (!day || (minDate && startOfDay(day) < startOfDay(minDate))) return
    onChange(toDateValue(day))
    setOpen(false)
  }

  return (
    <label className="relative">
      <span className="label">{label}</span>
      <button type="button" className="date-button" onClick={() => setOpen((next) => !next)}>
        <CalendarDays size={18} className="text-amberline" />
        <span>{formatDateLabel(value)}</span>
      </button>
      {open ? (
        <motion.div
          className="absolute left-0 top-[4.5rem] z-[80] w-[min(19rem,calc(100vw-2rem))] rounded-lg border border-mist bg-white p-3 shadow-panel"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className="calendar-nav" onClick={() => setViewDate(addMonths(viewDate, -1))} aria-label="Previous month"><ChevronLeft size={17} /></button>
            <p className="text-sm font-extrabold">{viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
            <button type="button" className="calendar-nav" onClick={() => setViewDate(addMonths(viewDate, 1))} aria-label="Next month"><ChevronRight size={17} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[0.68rem] font-black uppercase text-stone-400">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              const disabled = !day || (minDate && startOfDay(day) < startOfDay(minDate))
              const selected = day && toDateValue(day) === value
              return (
                <button
                  key={day ? toDateValue(day) : `empty-${index}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  className={`calendar-day ${selected ? 'calendar-day-active' : ''}`}
                >
                  {day?.getDate() || ''}
                </button>
              )
            })}
          </div>
        </motion.div>
      ) : null}
    </label>
  )
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function Line({ label, value }) {
  return <div className="flex justify-between gap-4"><span className="text-stone-500">{label}</span><span className="text-right font-bold text-charcoal">{value}</span></div>
}

function nightsBetween(checkIn, checkOut) {
  const start = new Date(`${checkIn}T00:00:00Z`)
  const end = new Date(`${checkOut}T00:00:00Z`)
  const nights = Math.round((end - start) / 86_400_000)
  return Number.isFinite(nights) && nights > 0 ? nights : 0
}

function rawNightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return Number.NaN
  const start = new Date(`${checkIn}T00:00:00Z`)
  const end = new Date(`${checkOut}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}

function getStayDateError(checkIn, checkOut) {
  const nights = rawNightsBetween(checkIn, checkOut)
  if (!Number.isFinite(nights)) return 'Select valid check-in and check-out dates.'
  if (nights < 1) return 'Check-out date must be after check-in date.'
  if (nights > 30) return 'Stay cannot be more than 30 nights.'
  return ''
}

function addDays(dateString, days) {
  if (!dateString) return ''
  const date = new Date(`${dateString}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function calculateOfferDiscount(offer, subtotal) {
  if (!offer) return 0
  const base = Math.max(0, Number(subtotal || 0))
  const value = Math.max(0, Number(offer.discount_value || 0))
  const rawDiscount = offer.discount_type === 'percentage' ? base * Math.min(value, 100) / 100 : value
  return roundMoney(Math.min(rawDiscount, base))
}

function formatOfferValue(offer) {
  const value = Number(offer.discount_value || 0)
  if (offer.discount_type === 'percentage') return `${value}% off`
  return `Rs ${value.toLocaleString('en-IN')} off`
}

function formatDateLabel(value) {
  const date = parseDateValue(value)
  if (!date) return 'Select date'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function calendarDays(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const days = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= total; day += 1) days.push(new Date(date.getFullYear(), date.getMonth(), day))
  return days
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function parseDateValue(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function toDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
