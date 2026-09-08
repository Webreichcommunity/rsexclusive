import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bath, BedDouble, CalendarCheck, CalendarDays, Check, ChevronLeft, ChevronRight, CreditCard, Gift, Loader2, Minus, Plus, ShieldCheck, UsersRound } from 'lucide-react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { AutoScrollRow } from '../../components/ui/AutoScrollRow.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { GuideToast } from '../../components/ui/GuideToast.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../auth/authContext.js'
import { apiFetch } from '../../services/apiClient.js'
import { buildTenantPath, getSavedTenantKey, resolveTenantFromLocation } from '../tenant/resolveTenant.js'

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

function queryList(params, key) {
  return String(params.get(key) || '').split(',').map((value) => value.trim()).filter(Boolean)
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
  const [selectedAmenityIds, setSelectedAmenityIds] = useState(() => queryList(params, 'amenities'))
  const [redeemPoints, setRedeemPoints] = useState(Math.max(0, Number(queryValue(params, 'redeemPoints', '0'))))
  const [paymentMode, setPaymentMode] = useState(params.get('paymentMode') === 'partial' ? 'partial' : 'full')
  const [searched, setSearched] = useState(false)
  const [status, setStatus] = useState({ loading: false, error: '', paymentError: '' })
  const [guideToast, setGuideToast] = useState(null)
  const guideToastTimer = useRef(null)
  const roomsSectionRef = useRef(null)
  const initialAvailabilityLoaded = useRef(false)
  const defaultOfferApplied = useRef(false)
  const loadAvailabilityRef = useRef(null)
  const { data, loading, error } = useAsync(() => apiFetch('/tenant'), authLoading ? 'auth-loading' : `${firebaseUser?.uid || 'guest'}:${firebaseUser?.emailVerified ? 'verified' : 'unverified'}`)
  const step = params.get('step') || 'list'

  const allRooms = useMemo(() => data?.rooms || [], [data])
  const bookableAmenities = useMemo(() => data?.amenities || [], [data])
  const offers = useMemo(() => data?.offers || [], [data])
  const availableLoyaltyPoints = Number(data?.loyaltyPoints || 0)
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
  const selectedAmenityItems = useMemo(
    () => getSelectedAmenityItems(priceRoom, bookableAmenities, selectedAmenityIds),
    [priceRoom, bookableAmenities, selectedAmenityIds],
  )
  const amenitySubtotal = roundMoney(selectedAmenityItems.reduce((sum, amenity) => sum + Number(amenity.price || 0), 0) * Number(form.roomsCount || 1))
  const roomNightPrice = priceRoom ? Number(priceRoom.subtotal ? priceRoom.subtotal / Math.max(nights, 1) : priceRoom.offer_price || priceRoom.base_price) : 0
  const roomSubtotal = priceRoom ? Number(priceRoom.subtotal || roomNightPrice * nights) * Number(form.roomsCount || 1) : 0
  const grossSubtotal = roundMoney(roomSubtotal + amenitySubtotal)
  const offerDiscount = calculateOfferDiscount(selectedOffer, grossSubtotal)
  const subtotalBeforeRedemption = Math.max(0, roundMoney(grossSubtotal - offerDiscount))
  const maxRedeemablePoints = Math.min(availableLoyaltyPoints, Math.floor(Math.max(0, subtotalBeforeRedemption - 1) / 100))
  const appliedRedeemPoints = Math.min(Math.max(0, Number(redeemPoints || 0)), maxRedeemablePoints)
  const loyaltyDiscount = roundMoney(appliedRedeemPoints * 100)
  const subtotal = Math.max(0, roundMoney(subtotalBeforeRedemption - loyaltyDiscount))
  const tax = data?.hotel ? roundMoney((subtotal * Number(data.hotel.tax_rate || 0)) / 100) : 0
  const total = roundMoney(subtotal + tax)
  const paymentDue = paymentMode === 'partial' ? roundMoney(total * 0.25) : total
  const balanceDue = roundMoney(total - paymentDue)
  const loyaltyPoints = Math.floor(total / 100)

  const syncUrl = useCallback((nextForm = form, roomTypeId = selectedRoomId, extra = {}) => {
    const next = new URLSearchParams()
    next.set('checkIn', nextForm.checkIn)
    next.set('checkOut', nextForm.checkOut)
    next.set('roomsCount', String(nextForm.roomsCount))
    next.set('adults', String(nextForm.adults))
    next.set('children', String(nextForm.children))
    if (roomTypeId) next.set('roomTypeId', roomTypeId)
    const tenant = resolveTenantFromLocation()
    const hotel = params.get('hotel') || (tenant.isTenant ? tenant.key : null) || getSavedTenantKey()
    if (hotel && ['query', 'local-storage'].includes(tenant.source)) next.set('hotel', hotel)
    if (extra.step) next.set('step', extra.step)
    const offerId = extra.offerId ?? selectedOfferId
    if (offerId) next.set('offerId', offerId)
    const amenityIds = extra.amenityIds ?? selectedAmenityIds
    if (amenityIds?.length) next.set('amenities', amenityIds.join(','))
    const points = Math.max(0, Number(extra.redeemPoints ?? redeemPoints ?? 0))
    if (points) next.set('redeemPoints', String(points))
    const mode = extra.paymentMode ?? paymentMode
    if (mode === 'partial') next.set('paymentMode', mode)
    setParams(next, { replace: true })
    return next
  }, [form, params, paymentMode, redeemPoints, selectedAmenityIds, selectedOfferId, selectedRoomId, setParams])

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
    if (!data) return
    if (selectedOfferId && !offers.some((offer) => offer.id === selectedOfferId)) {
      setSelectedOfferId('')
      syncUrl(form, selectedRoomId, { step: step === 'review' || step === 'details' ? step : undefined, offerId: '' })
    }
  }, [data, form, offers, selectedOfferId, selectedRoomId, step, syncUrl])

  useEffect(() => {
    if (defaultOfferApplied.current || !data || selectedOfferId || !offers[0]?.id) return
    defaultOfferApplied.current = true
    setSelectedOfferId(offers[0].id)
    syncUrl(form, selectedRoomId, { step: step === 'review' || step === 'details' ? step : undefined, offerId: offers[0].id })
  }, [data, form, offers, selectedOfferId, selectedRoomId, step, syncUrl])

  useEffect(() => {
    if (!priceRoom || !selectedAmenityIds.length) return
    const validIds = new Set(getBookableAmenityItems(priceRoom, bookableAmenities).map((amenity) => amenity.id).filter(Boolean))
    const nextSelected = selectedAmenityIds.filter((id) => validIds.has(id))
    if (nextSelected.length !== selectedAmenityIds.length) setSelectedAmenityIds(nextSelected)
  }, [priceRoom, bookableAmenities, selectedAmenityIds])

  useEffect(() => {
    if (!data) return
    if (redeemPoints > maxRedeemablePoints) {
      setRedeemPoints(maxRedeemablePoints)
      syncUrl(form, selectedRoomId, { step: step === 'review' ? 'review' : undefined, redeemPoints: maxRedeemablePoints })
    }
  }, [data, form, maxRedeemablePoints, redeemPoints, selectedRoomId, step, syncUrl])

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

  useEffect(() => () => window.clearTimeout(guideToastTimer.current), [])

  function showGuideToast(title, message, tone = 'warning') {
    window.clearTimeout(guideToastTimer.current)
    setGuideToast({ id: `${Date.now()}-${title}`, title, message, tone })
    guideToastTimer.current = window.setTimeout(() => setGuideToast(null), 3000)
  }

  function scrollToRooms() {
    window.requestAnimationFrame(() => {
      roomsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

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

  function chooseOffer(offerId) {
    const nextOfferId = selectedOfferId === offerId ? '' : offerId
    setSelectedOfferId(nextOfferId)
    syncUrl(form, selectedRoomId, { step: step === 'review' || step === 'details' ? step : undefined, offerId: nextOfferId })
  }

  function choosePaymentMode(mode) {
    setPaymentMode(mode)
    syncUrl(form, selectedRoomId, { step: step === 'review' ? 'review' : undefined, paymentMode: mode })
  }

  function chooseRedeemPoints(points) {
    const nextPoints = Math.min(Math.max(0, Number(points || 0)), maxRedeemablePoints)
    setRedeemPoints(nextPoints)
    syncUrl(form, selectedRoomId, { step: step === 'review' ? 'review' : undefined, redeemPoints: nextPoints })
  }

  function toggleAmenity(amenityId) {
    if (!amenityId) return
    const nextAmenityIds = selectedAmenityIds.includes(amenityId)
      ? selectedAmenityIds.filter((id) => id !== amenityId)
      : [...selectedAmenityIds, amenityId]
    setSelectedAmenityIds(nextAmenityIds)
    syncUrl(form, selectedRoomId, { step: step === 'review' || step === 'details' ? step : undefined, amenityIds: nextAmenityIds })
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
    if (stayDateError) {
      showGuideToast('Check your stay dates', stayDateError)
    }
    const availability = await loadAvailability()
    if (availability) scrollToRooms()
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
      navigate(buildTenantPath(`/login?mode=register&returnTo=${returnTo}`, resolveTenantFromLocation()))
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
    navigate(buildTenantPath(`/login?mode=register&returnTo=${returnTo}`, resolveTenantFromLocation()))
  }

  async function proceedToPayment() {
    if (status.loading) return
    if (stayDateError) {
      setStatus({ loading: false, error: stayDateError, paymentError: stayDateError })
      showGuideToast('Check your stay dates', stayDateError)
      return
    }
    if (!selectedRoom) {
      setStatus({ loading: false, error: 'Select an available room before continuing.', paymentError: 'Select an available room before continuing.' })
      showGuideToast('Select a room first', 'Choose an available room before opening secure payment.')
      return
    }
    if (!searched || !availableRooms.some((room) => room.id === selectedRoom.id)) {
      const availability = await loadAvailability({ preferredRoomId: selectedRoom.id, silent: true })
      if (!availability?.rooms.some((room) => room.id === selectedRoom.id)) {
        setStatus({ loading: false, error: 'This room is not available for the selected dates. Please choose another room.', paymentError: 'This room is not available for the selected dates. Please choose another room.' })
        showGuideToast('Room unavailable', 'Search again and choose another available room.')
        return
      }
    }
    if (!isAuthenticated) {
      requireLogin()
      return
    }
    if (!String(form.guestName || '').trim()) {
      setStatus({ loading: false, error: '', paymentError: 'Enter the guest name to continue with this booking.' })
      showGuideToast('Add guest name', 'Please enter the guest name before booking this room.')
      return
    }
    if (!String(form.guestEmail || '').trim() || !String(form.guestEmail || '').includes('@')) {
      setStatus({ loading: false, error: '', paymentError: 'Enter a valid guest email to continue with this booking.' })
      showGuideToast('Add guest email', 'Please enter a valid email address for booking updates.')
      return
    }
    if (String(form.guestPhone || '').trim().length < 7) {
      setStatus({ loading: false, error: '', paymentError: 'Enter a valid phone number to continue with this booking.' })
      showGuideToast('Add phone number', 'Please enter a valid phone number before booking this room.')
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
          selectedAmenityIds,
          redeemPoints: appliedRedeemPoints,
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
        navigate(buildTenantPath(`/confirmation/${confirmed.booking.booking_reference}`, resolveTenantFromLocation()), { state: { booking: confirmed.booking } })
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
            navigate(buildTenantPath(`/confirmation/${confirmed.booking.booking_reference}`, resolveTenantFromLocation()), { state: { booking: confirmed.booking } })
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
    return <RoomDetails room={detailRoom} hotel={data.hotel} form={form} nights={nights} amenities={bookableAmenities} offers={offers} selectedOfferId={selectedOfferId} selectedAmenityIds={selectedAmenityIds} selectedOffer={selectedOffer} offerDiscount={offerDiscount} onSelectOffer={chooseOffer} onToggleAmenity={toggleAmenity} onBook={() => selectRoom(detailRoom)} onClose={backToRooms} />
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
        amenitySubtotal={amenitySubtotal}
        selectedAmenityItems={selectedAmenityItems}
        grossSubtotal={grossSubtotal}
        subtotal={subtotal}
        subtotalBeforeRedemption={subtotalBeforeRedemption}
        selectedOffer={selectedOffer}
        selectedOfferId={selectedOfferId}
        offerDiscount={offerDiscount}
        loyaltyDiscount={loyaltyDiscount}
        redeemPoints={appliedRedeemPoints}
        maxRedeemablePoints={maxRedeemablePoints}
        availableLoyaltyPoints={availableLoyaltyPoints}
        tax={tax}
        total={total}
        paymentMode={paymentMode}
        paymentDue={paymentDue}
        balanceDue={balanceDue}
        loyaltyPoints={loyaltyPoints}
        offers={offers}
        status={status}
        guideToast={guideToast}
        isAuthenticated={isAuthenticated}
        stayDateError={stayDateError}
        onBack={backToRooms}
        onSelectOffer={chooseOffer}
        onToggleAmenity={toggleAmenity}
        onRedeemPoints={chooseRedeemPoints}
        onGuide={showGuideToast}
        onPaymentMode={choosePaymentMode}
        onPay={proceedToPayment}
      />
    )
  }

  return (
    <main className="bg-ivory">
      <GuideToast toast={guideToast} />
      <section className="relative min-h-[46svh] overflow-hidden bg-charcoal text-white md:min-h-[54svh]">
        <BookingHeroBackground hotel={data.hotel} />
        <div className="absolute inset-0 bg-black/16" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/76 via-black/38 to-black/8" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/54 to-transparent" />
        <div className="container-page relative flex min-h-[46svh] items-center py-14 md:min-h-[54svh] md:py-16">
          <FadeIn viewport={false} className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-amber-100">{data.hotel.name}</p>
            <h1 className="mt-3 text-5xl font-semibold leading-none text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.52)] md:text-7xl">Reserve your stay</h1>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/86 drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">Search live inventory, compare room experiences, review your stay, then pay securely.</p>
          </FadeIn>
        </div>
      </section>

      <section className="container-page -mt-8 pb-16 md:pb-24">
        <FadeIn viewport={false} className="relative z-20">
          <form onSubmit={searchRooms} className="glass-panel grid grid-cols-2 gap-3 p-4 lg:grid-cols-[1fr_1fr_0.8fr_0.8fr_0.8fr_auto] lg:items-end">
            <DatePicker label="Check-in" value={form.checkIn} onChange={updateCheckIn} />
            <DatePicker label="Check-out" value={form.checkOut} min={minCheckOut} onChange={updateCheckOut} />
            <Field label="Adults"><Stepper value={form.adults} min={1} onChange={(value) => updateStayForm({ ...form, adults: value })} /></Field>
            <Field label="Children"><Stepper value={form.children} min={0} onChange={(value) => updateStayForm({ ...form, children: value })} /></Field>
            <Field label="Rooms" className="col-span-2 sm:col-span-1"><Stepper value={form.roomsCount} min={1} onChange={(value) => updateStayForm({ ...form, roomsCount: value })} /></Field>
            <button className="btn-primary col-span-2 h-12 w-full px-5 sm:col-span-1 lg:col-span-1" type="submit" disabled={status.loading}>
              {status.loading ? <Loader2 size={18} className="animate-spin" /> : <CalendarCheck size={18} />} Search Rooms
            </button>
          </form>
        </FadeIn>

        {(status.error || stayDateError) ? <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{status.error || stayDateError}</p> : null}

        {offers.length ? <BookingOfferBand offers={offers} selectedOfferId={selectedOfferId} onSelectOffer={chooseOffer} /> : null}

        <div ref={roomsSectionRef} className="mt-7 scroll-mt-28">
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
              <Stagger className="grid gap-4">
                {(searched ? availableRooms : allRooms).map((room) => (
                  <RoomCard key={room.id} room={room} searched={searched} selected={room.id === selectedRoomId} loading={status.loading} offers={offers} selectedOfferId={selectedOfferId} offer={selectedOffer} nights={nights} roomsCount={form.roomsCount} onSelectOffer={chooseOffer} onDetails={() => openDetails(room)} onBook={() => selectRoom(room)} />
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
      <AutoScrollRow ariaLabel="Booking offers" className="mt-4" step={340}>
        {offers.slice(0, 8).map((offer) => (
          <OfferChoiceCard key={offer.id} offer={offer} selected={selectedOfferId === offer.id} onSelect={() => onSelectOffer(offer.id)} compact />
        ))}
      </AutoScrollRow>
    </FadeIn>
  )
}

function BookingHeroBackground({ hotel }) {
  const images = getHotelHeroImages(hotel)
  const image = images[0] || fallbackRoomImage
  const media = getBackgroundVideoSource(hotel?.branding?.youtubeEmbedUrl)

  if (media?.type === 'youtube') {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-charcoal">
        <iframe
          className="absolute left-1/2 top-1/2 min-w-full border-0"
          style={{
            width: 'max(100vw, 177.78svh)',
            height: 'max(calc(100svh + 176px), calc(56.25vw + 176px))',
            transform: 'translate(-50%, -50%) scale(1.22)',
            transformOrigin: 'center',
          }}
          src={media.src}
          title={`${hotel?.name || 'Hotel'} booking background video`}
          allow="autoplay; encrypted-media; picture-in-picture"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    )
  }

  if (media?.type === 'file') {
    return (
      <video
        className="absolute inset-0 h-full w-full object-cover object-center sm:object-top"
        src={media.src}
        poster={image}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
    )
  }

  return <HeroSlideshow images={images.length ? images : [image]} />
}

function HeroSlideshow({ images }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (images.length < 2) return undefined
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % images.length), 3600)
    return () => window.clearInterval(timer)
  }, [images.length])

  return (
    <AnimatePresence initial={false}>
      <motion.img
        key={images[index]}
        className="absolute inset-0 h-full w-full object-cover object-center sm:object-top"
        src={images[index]}
        alt=""
        aria-hidden="true"
        initial={{ opacity: 0, scale: 1.03 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.9 }}
      />
    </AnimatePresence>
  )
}

function OfferChoiceCard({ offer, selected, onSelect, compact = false }) {
  const visual = getOfferVisual(offer)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group min-h-40 w-[84vw] max-w-[22rem] shrink-0 snap-start rounded-lg border p-4 text-left shadow-sm backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-card sm:w-[20rem] ${selected ? 'border-white/80 text-white ring-2 ring-white/45' : 'border-white/70 bg-white/82 text-charcoal'}`}
      style={selected ? { backgroundImage: visual.card, boxShadow: visual.shadow } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-black uppercase ${selected ? 'bg-white/18 text-white ring-1 ring-white/25' : 'bg-charcoal text-white'}`}>
          <Gift size={15} /> {offer.badge || (offer.audience_type === 'repeat_guest' ? 'For you' : 'Offer')}
        </span>
        <span className={`rounded-md px-2 py-1 text-xs font-black ${selected ? 'bg-white/90 text-charcoal' : 'bg-bone text-stone-600'}`}>{selected ? 'Applied' : 'Apply'}</span>
      </div>
      <h3 className={`mt-4 font-extrabold leading-tight ${compact ? 'text-lg' : 'text-xl'}`}>{offer.title}</h3>
      <p className={`mt-2 text-sm font-black ${selected ? 'text-white' : 'text-amberline'}`}>{formatOfferValue(offer)}</p>
      <p className={`mt-2 line-clamp-2 text-sm leading-6 ${selected ? 'text-white/78' : 'text-stone-600'}`}>{offer.description}</p>
    </button>
  )
}

function RoomCard({ room, searched, selected, loading, offers, selectedOfferId, offer, nights, roomsCount, onSelectOffer, onDetails, onBook }) {
  const unavailable = searched && Number(room.available_rooms || 0) < 1
  const displayPrice = room.offer_price || room.base_price
  const staySubtotal = Number(room.subtotal || Number(displayPrice || 0) * Math.max(nights, 1)) * Number(roomsCount || 1)
  const cardDiscount = calculateOfferDiscount(offer, staySubtotal)
  const discountedStayTotal = Math.max(0, roundMoney(staySubtotal - cardDiscount))
  const roomPriceSaving = room.offer_price ? Math.max(0, Number(room.base_price || 0) - Number(room.offer_price || 0)) : 0
  const possibleLoyaltyPoints = Math.max(0, Math.floor(discountedStayTotal / 100))
  const stayNights = Math.max(nights, 1)
  const roomUnits = Number(roomsCount || 1)
  const bestNightPrice = roundMoney((offer ? discountedStayTotal : staySubtotal) / stayNights / roomUnits)
  const compareNightPrice = room.offer_price ? Number(room.base_price || 0) : Number(displayPrice || 0)
  const offerNightSaving = offer ? Math.max(0, roundMoney(Number(displayPrice || 0) - bestNightPrice)) : 0
  const offerVisual = offer ? getOfferVisual(offer) : null
  return (
    <StaggerItem as="article" className={`group grid overflow-hidden rounded-lg border bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-card md:grid-cols-[240px_minmax(0,1fr)_225px] lg:grid-cols-[280px_minmax(0,1fr)_235px] ${selected ? 'border-amberline ring-2 ring-amberline/25' : 'border-white/80'}`}>
      <div className="image-lift h-52 rounded-none md:h-full md:min-h-[15.5rem]">
        <RotatingRoomImage room={room} className="h-full w-full object-cover" />
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-4 md:p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{room.bed_type || 'Premium room'}</p>
          <h3 className="mt-2 text-2xl font-bold leading-tight">{room.name}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{room.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(room.amenities || []).slice(0, 3).map((amenity) => <span key={amenity} className="rounded-md bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600">{amenity}</span>)}
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(190px,0.8fr)]">
          {offers.length ? (
            <RoomCardOfferPicker offers={offers} selectedOfferId={selectedOfferId} onSelectOffer={onSelectOffer} />
          ) : null}
          <div className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 ${offers.length ? '' : 'sm:col-span-2'}`}>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-900">Loyalty</p>
            <p className="text-sm font-extrabold text-charcoal">Earn {possibleLoyaltyPoints.toLocaleString('en-IN')} pts</p>
            <p className="hidden text-xs font-semibold leading-5 text-stone-600 sm:block">Redeem saved points at checkout. 1 point = Rs 100.</p>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap gap-4 border-t border-mist pt-3 text-sm font-semibold text-stone-600">
          <span className="flex items-center gap-1"><UsersRound size={16} /> {room.occupancy_adults} adults, {room.occupancy_children} children</span>
          <span className="flex items-center gap-1"><BedDouble size={16} /> {searched ? `${room.available_rooms} available` : 'Search dates'}</span>
        </div>
      </div>
      <div className="flex flex-col justify-between border-t border-emerald-200 bg-[linear-gradient(180deg,#ecfdf5_0%,#ffffff_100%)] p-4 md:border-l md:border-t-0">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Best available price</p>
          <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-3 md:block">
            <div>
              {compareNightPrice > bestNightPrice ? <p className="text-xs font-bold text-stone-500 line-through sm:text-sm">Rs {compareNightPrice.toLocaleString('en-IN')}</p> : null}
              <p className="mt-1 text-2xl font-black leading-none text-emerald-800 sm:text-3xl">Rs {bestNightPrice.toLocaleString('en-IN')}</p>
              <p className="mt-1 text-xs font-bold text-stone-500">per night</p>
            </div>
            {roomPriceSaving ? <p className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-800 md:mt-2">Save Rs {roomPriceSaving.toLocaleString('en-IN')}</p> : null}
          </div>
          {offer ? (
            <div className="mt-2 rounded-lg border border-white/70 p-3 text-white shadow-soft backdrop-blur-xl" style={{ backgroundImage: offerVisual.card }}>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/78">Offer applied</p>
              <p className="mt-1 text-xl font-black">Rs {discountedStayTotal.toLocaleString('en-IN')}</p>
              <p className="text-xs font-bold text-white/82">{offerNightSaving ? `Rs ${offerNightSaving.toLocaleString('en-IN')} less per night. ` : ''}Stay saves Rs {cardDiscount.toLocaleString('en-IN')}</p>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={onDetails}><span className="sm:hidden">View</span><span className="hidden sm:inline">View details</span></button>
          <button className="btn-primary !min-h-10 !px-4" type="button" onClick={onBook} disabled={loading || unavailable}>
            {loading && selected ? <Loader2 size={16} className="animate-spin" /> : null}
            <span className="sm:hidden">Book</span><span className="hidden sm:inline">{searched ? 'Book room' : 'Check & book'}</span>
          </button>
        </div>
      </div>
    </StaggerItem>
  )
}

function RoomCardOfferPicker({ offers, selectedOfferId, onSelectOffer }) {
  return (
    <div className="hidden rounded-lg border border-amber-200 bg-white p-3 sm:block">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-amberline">Offers</p>
        {selectedOfferId ? (
          <button type="button" className="text-xs font-black text-stone-500 underline-offset-4 hover:text-charcoal hover:underline" onClick={() => onSelectOffer(selectedOfferId)}>
            Remove
          </button>
        ) : null}
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0">
        {offers.slice(0, 4).map((item) => {
          const selected = selectedOfferId === item.id
          const visual = getOfferVisual(item)
          return (
            <button
              key={item.id}
              type="button"
              className={`w-40 shrink-0 snap-start rounded-md border px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-soft sm:w-auto ${selected ? 'border-white/80 text-white ring-1 ring-white/40' : 'border-stone-200 bg-bone/60 text-charcoal'}`}
              style={selected ? { backgroundImage: visual.compact } : undefined}
              onClick={() => onSelectOffer(item.id)}
            >
              <span className="flex items-start justify-between gap-2">
                <span className={`line-clamp-1 text-xs font-extrabold ${selected ? 'text-white' : 'text-charcoal'}`}>{item.title}</span>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[0.64rem] font-black uppercase ${selected ? 'bg-white/90 text-charcoal' : 'bg-bone text-stone-600'}`}>{selected ? 'Applied' : 'Apply'}</span>
              </span>
              <span className={`mt-1 block text-xs font-black ${selected ? 'text-white/85' : 'text-emerald-800'}`}>{formatOfferValue(item)}</span>
            </button>
          )
        })}
      </div>
      {offers.length > 2 ? <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-stone-500 sm:hidden">Swipe left for more offers</p> : null}
    </div>
  )
}

function RotatingRoomImage({ room, className }) {
  const images = useMemo(() => getRoomImages(room), [room])
  const [index, setIndex] = useState(0)
  const [pausedUntil, setPausedUntil] = useState(0)
  const paused = pausedUntil > Date.now()

  useEffect(() => {
    if (!paused) return undefined
    const timer = window.setTimeout(() => setPausedUntil(0), Math.max(0, pausedUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [paused, pausedUntil])

  useEffect(() => {
    if (images.length < 2 || paused) return undefined
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % images.length), 2400)
    return () => window.clearInterval(timer)
  }, [images.length, paused])

  return (
    <button className="relative block h-full w-full overflow-hidden bg-stone-200 text-left" type="button" aria-label="Pause room image rotation" onClick={() => setPausedUntil(Date.now() + 5000)}>
      {images.map((image, imageIndex) => (
        <img
          key={image.url}
          src={image.url || fallbackRoomImage}
          alt={image.alt || room.name}
          loading="lazy"
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${className} ${imageIndex === index ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </button>
  )
}

function BookingReviewPage({
  data,
  priceRoom,
  fallbackRoomImage,
  form,
  setForm,
  nights,
  roomSubtotal,
  amenitySubtotal,
  selectedAmenityItems,
  grossSubtotal,
  subtotal,
  subtotalBeforeRedemption,
  selectedOffer,
  selectedOfferId,
  offerDiscount,
  loyaltyDiscount,
  redeemPoints,
  maxRedeemablePoints,
  availableLoyaltyPoints,
  tax,
  total,
  paymentMode,
  paymentDue,
  balanceDue,
  loyaltyPoints,
  offers,
  status,
  guideToast,
  isAuthenticated,
  stayDateError,
  onBack,
  onSelectOffer,
  onToggleAmenity,
  onRedeemPoints,
  onGuide,
  onPaymentMode,
  onPay,
}) {
  const roomAmenities = getBookableAmenityItems(priceRoom, data.amenities || [])
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const selectedOfferVisual = selectedOffer ? getOfferVisual(selectedOffer) : null
  return (
    <main className="bg-ivory">
      <GuideToast toast={guideToast} />
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
              {roomAmenities.length ? (
                <div className="mt-7">
                  <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
                    <div>
                      <p className="eyebrow">Add amenities</p>
                      <h3 className="mt-1 text-2xl font-extrabold">Customize your stay</h3>
                    </div>
                    {amenitySubtotal ? <p className="rounded-md bg-bone px-3 py-2 text-sm font-bold text-charcoal">Add-ons Rs {amenitySubtotal.toLocaleString('en-IN')}</p> : null}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {roomAmenities.map((amenity) => (
                      <AmenityOption key={amenity.id || amenity.name} amenity={amenity} selected={selectedAmenityItems.some((item) => item.id === amenity.id)} onToggle={() => onToggleAmenity(amenity.id)} />
                    ))}
                  </div>
                </div>
              ) : null}
              {offers.length ? (
                <div className="mt-7">
                  <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
                    <div>
                      <p className="eyebrow">Offers</p>
                      <h3 className="mt-1 text-2xl font-extrabold">Apply a booking offer</h3>
                    </div>
                    {selectedOffer ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Saving Rs {offerDiscount.toLocaleString('en-IN')}</p> : null}
                  </div>
                  <AutoScrollRow ariaLabel="Review booking offers" className="mt-4" step={340}>
                    {offers.slice(0, 4).map((offer) => (
                      <OfferChoiceCard key={offer.id} offer={offer} selected={selectedOfferId === offer.id} onSelect={() => onSelectOffer(offer.id)} />
                    ))}
                  </AutoScrollRow>
                </div>
              ) : null}
            </div>
          </div>

          <div className="glass-panel self-start overflow-hidden">
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-stone-500">Booking summary</p>
              <h2 className="mt-2 text-2xl font-extrabold">{data.hotel.name}</h2>
              <div className="mt-5 grid gap-2 rounded-lg border border-mist bg-white p-3 text-sm">
                <Line label="Dates" value={`${form.checkIn} to ${form.checkOut}`} />
                <Line label="Guests" value={`${form.adults} adults, ${form.children} children`} />
                <Line label="Rooms" value={form.roomsCount} />
                <Line label="Selected add-ons" value={selectedAmenityItems.length ? `Rs ${amenitySubtotal.toLocaleString('en-IN')}` : 'None'} />
              </div>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-between rounded-md border border-mist bg-bone px-3 py-2 text-sm font-extrabold text-charcoal transition hover:bg-white hover:shadow-soft"
                onClick={() => setBreakdownOpen((current) => !current)}
                aria-expanded={breakdownOpen}
              >
                <span>Price breakdown</span>
                <ChevronRight size={17} className={`transition ${breakdownOpen ? 'rotate-90' : ''}`} />
              </button>
              {breakdownOpen ? (
                <div className="mt-3 space-y-3 rounded-lg border border-mist bg-white p-3 text-sm">
                  <Line label="Nights" value={nights > 0 ? nights : 'Check dates'} />
                  <Line label="Room price" value={priceRoom ? `Rs ${Number(priceRoom.offer_price || priceRoom.base_price).toLocaleString('en-IN')}/night` : '-'} />
                  <Line label="Room subtotal" value={`Rs ${roomSubtotal.toLocaleString('en-IN')}`} />
                  {selectedAmenityItems.length ? <Line label="Selected amenities" value={`Rs ${amenitySubtotal.toLocaleString('en-IN')}`} /> : null}
                  {selectedAmenityItems.map((amenity) => (
                    <Line key={amenity.id} label={amenity.name} value={`Rs ${(Number(amenity.price || 0) * Number(form.roomsCount || 1)).toLocaleString('en-IN')}`} />
                  ))}
                  <Line label="Stay subtotal" value={`Rs ${grossSubtotal.toLocaleString('en-IN')}`} />
                  {selectedOffer ? <Line label={selectedOffer.title} value={`- Rs ${offerDiscount.toLocaleString('en-IN')}`} /> : null}
                  {redeemPoints ? <Line label={`${redeemPoints} group loyalty point${redeemPoints === 1 ? '' : 's'}`} value={`- Rs ${loyaltyDiscount.toLocaleString('en-IN')}`} /> : null}
                  <Line label="Taxable subtotal" value={`Rs ${subtotal.toLocaleString('en-IN')}`} />
                  <Line label="Taxes" value={`Rs ${tax.toLocaleString('en-IN')}`} />
                </div>
              ) : null}
              {selectedOffer ? (
                <div className="mt-4 rounded-md border border-white/70 p-3 text-white shadow-soft backdrop-blur-xl" style={{ backgroundImage: selectedOfferVisual.card }}>
                  <p className="flex items-center gap-2 text-sm font-extrabold"><Gift size={17} /> Offer applied</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-white/80">{formatOfferValue(selectedOffer)} has been applied to this booking. Server will recheck it before payment.</p>
                </div>
              ) : offers.length ? (
                <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Select an offer card to apply a discount before payment.</p>
              ) : null}
              <LoyaltyRedeemControl
                availablePoints={availableLoyaltyPoints}
                maxRedeemablePoints={maxRedeemablePoints}
                redeemPoints={redeemPoints}
                discount={loyaltyDiscount}
                subtotalBeforeRedemption={subtotalBeforeRedemption}
                onChange={onRedeemPoints}
                onUnavailableAction={onGuide}
                disabled={!isAuthenticated}
              />
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
                <p className="mt-1 text-xs font-semibold leading-5 text-stone-600">Every Rs 100 earns 1 group point. This booking can earn {loyaltyPoints.toLocaleString('en-IN')} point{loyaltyPoints === 1 ? '' : 's'} after payment confirmation, redeemable at any hotel.</p>
              </div>

              {isAuthenticated ? (
                <div className="mt-5 grid gap-3">
                  <Field label="Guest name"><input className="input" value={form.guestName} onChange={(event) => setForm({ ...form, guestName: event.target.value })} /></Field>
                  <Field label="Guest email"><input className="input" type="email" value={form.guestEmail} onChange={(event) => setForm({ ...form, guestEmail: event.target.value })} /></Field>
                  <Field label="Phone"><input className="input" type="tel" required value={form.guestPhone} onChange={(event) => setForm({ ...form, guestPhone: event.target.value })} /></Field>
                </div>
              ) : (
                <p className="mt-5 rounded-md bg-ivory p-3 text-sm font-semibold text-stone-600">Sign in or create a guest account to continue. Your selected room and dates will stay here.</p>
              )}

              {(status.paymentError || status.error || stayDateError) ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{status.paymentError || status.error || stayDateError}</p> : null}
              <button
                type="button"
                className="btn-primary mt-5 w-full"
                onClick={onPay}
                disabled={status.loading}
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

function LoyaltyRedeemControl({ availablePoints, maxRedeemablePoints, redeemPoints, discount, subtotalBeforeRedemption, onChange, onUnavailableAction, disabled }) {
  const cannotRedeem = disabled || maxRedeemablePoints < 1

  function showUnavailableGuide() {
    if (disabled) {
      onUnavailableAction?.('Login required', 'Sign in or create your group account to use loyalty points.')
      return
    }
    if (Number(availablePoints || 0) < 1) {
      onUnavailableAction?.('You have 0 points now', 'Earn group loyalty points after a confirmed booking, then redeem them at any hotel.')
      return
    }
    onUnavailableAction?.('No points available for this booking', `Points can be used when the subtotal is at least Rs 101 before tax.`)
  }

  return (
    <div className="mt-4 rounded-lg border border-[#d8c7a5] bg-[#fff8ea] p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="flex items-center gap-2 text-sm font-extrabold text-charcoal"><Gift size={17} className="text-amberline" /> Redeem group loyalty points</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-stone-600">You have {Number(availablePoints || 0).toLocaleString('en-IN')} group point{availablePoints === 1 ? '' : 's'}. 1 point = Rs 100 and can be used at any hotel.</p>
        </div>
        {discount ? <span className="rounded-md bg-white px-3 py-2 text-sm font-black text-emerald-800">- Rs {discount.toLocaleString('en-IN')}</span> : null}
      </div>
      <div className="mt-4 grid gap-3">
        <div className="relative">
          <input
            type="range"
            min="0"
            max={maxRedeemablePoints}
            value={redeemPoints}
            onChange={(event) => onChange(Number(event.target.value))}
            disabled={cannotRedeem}
            className="w-full accent-[#7f1d1d] disabled:opacity-50"
            aria-label="Redeem loyalty points"
          />
          {cannotRedeem ? <button type="button" className="absolute inset-0 cursor-not-allowed rounded-md" aria-label="Why loyalty points cannot be redeemed" onClick={showUnavailableGuide} /> : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:max-w-36">
            <input
              className="input h-11"
              type="number"
              min="0"
              max={maxRedeemablePoints}
              value={redeemPoints}
              onChange={(event) => onChange(Number(event.target.value))}
              disabled={cannotRedeem}
              aria-label="Loyalty points to redeem"
            />
            {cannotRedeem ? <button type="button" className="absolute inset-0 cursor-not-allowed rounded-md" aria-label="Why loyalty points cannot be redeemed" onClick={showUnavailableGuide} /> : null}
          </div>
          <p className="text-xs font-semibold leading-5 text-stone-600">
            {disabled ? 'Login to redeem points.' : maxRedeemablePoints ? `Up to ${maxRedeemablePoints.toLocaleString('en-IN')} points can be used on this booking before tax.` : `No points can be used on Rs ${subtotalBeforeRedemption.toLocaleString('en-IN')} subtotal.`}
          </p>
        </div>
      </div>
    </div>
  )
}

function AmenityOption({ amenity, selected, onToggle }) {
  const disabled = !amenity.id
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`flex min-h-28 items-start gap-3 rounded-lg border p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-card disabled:cursor-not-allowed disabled:opacity-70 ${selected ? 'border-amberline bg-amber-50 ring-2 ring-amberline/15' : 'border-mist bg-white'}`}
    >
      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${selected ? 'border-amberline bg-amberline text-white' : 'border-stone-300 bg-white text-transparent'}`}>
        <Check size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="font-extrabold text-charcoal">{amenity.name}</span>
          <span className="shrink-0 text-sm font-black text-amberline">{Number(amenity.price || 0) ? `Rs ${Number(amenity.price).toLocaleString('en-IN')}` : 'Included'}</span>
        </span>
        {amenity.description ? <span className="mt-2 block text-sm font-medium leading-6 text-stone-600">{amenity.description}</span> : null}
      </span>
    </button>
  )
}

function RoomDetails({ room, hotel, form, nights, amenities, offers, selectedOfferId, selectedAmenityIds, selectedOffer, offerDiscount, onSelectOffer, onToggleAmenity, onBook, onClose }) {
  const gallery = Array.isArray(room.gallery) && room.gallery.length ? room.gallery : [{ url: room.hero_image_url || fallbackRoomImage, alt: room.name }]
  const amenityItems = getBookableAmenityItems(room, amenities)
  const selectedAmenityItems = getSelectedAmenityItems(room, amenities, selectedAmenityIds)
  const amenitySubtotal = roundMoney(selectedAmenityItems.reduce((sum, amenity) => sum + Number(amenity.price || 0), 0) * Number(form.roomsCount || 1))
  const roomNightPrice = Number(room.subtotal ? room.subtotal / Math.max(nights, 1) : room.offer_price || room.base_price)
  const roomSubtotal = roundMoney(Number(room.subtotal || roomNightPrice * Math.max(nights, 1)) * Number(form.roomsCount || 1))
  const grossSubtotal = roundMoney(roomSubtotal + amenitySubtotal)
  const regularRoomSubtotal = roundMoney(Number(room.base_price || 0) * Math.max(nights, 1) * Number(form.roomsCount || 1))
  const regularSubtotal = roundMoney(regularRoomSubtotal + amenitySubtotal)
  const estimatedTotal = Math.max(0, roundMoney(grossSubtotal - offerDiscount))
  const totalSaving = Math.max(0, roundMoney(regularSubtotal - estimatedTotal))
  const roomPriceSaving = room.offer_price ? Math.max(0, roundMoney((Number(room.base_price || 0) - Number(room.offer_price || 0)) * Math.max(nights, 1) * Number(form.roomsCount || 1))) : 0
  const effectiveNightPrice = roundMoney(grossSubtotal / Math.max(nights, 1) / Number(form.roomsCount || 1))
  const selectedOfferVisual = selectedOffer ? getOfferVisual(selectedOffer) : null
  return (
    <main className="overflow-x-hidden bg-ivory">
      <section className="relative min-h-[42svh] overflow-hidden bg-charcoal text-white md:min-h-[50svh]">
        <BookingHeroBackground hotel={hotel} />
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/48 to-black/12" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/56 to-transparent" />
        <div className="container-page relative flex min-h-[42svh] items-center py-10 md:min-h-[50svh] md:py-16">
          <FadeIn viewport={false} className="min-w-0">
            <button className="btn-dark !min-h-10 !px-4" type="button" onClick={onClose}>Back to rooms</button>
            <p className="mt-8 text-xs font-extrabold uppercase tracking-[0.22em] text-stone-400">{hotel.name}</p>
            <h1 className="mt-3 max-w-5xl break-words text-4xl font-semibold leading-none text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.62)] sm:text-5xl md:text-7xl">{room.name}</h1>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/82 drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">{room.bed_type || 'Premium room'} / {room.size_sqft || 'Flexible'} sq ft</p>
          </FadeIn>
        </div>
      </section>

      <section className="container-page mt-8 pb-16 md:pb-24">
        <FadeIn viewport={false} className="min-w-0 overflow-hidden rounded-lg border border-mist bg-white shadow-panel">
        <div className="grid gap-2 p-2 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
          <img src={gallery[0]?.url || fallbackRoomImage} alt={gallery[0]?.alt || room.name} className="h-64 w-full rounded-md object-cover sm:h-80 lg:h-[26rem]" />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {(gallery.slice(1, 3).length ? gallery.slice(1, 3) : gallery.slice(0, 2)).map((image, index) => (
              <img key={`${image.url}-${index}`} src={image.url || fallbackRoomImage} alt={image.alt || room.name} className="h-40 w-full rounded-md object-cover sm:h-48 lg:h-[12.75rem]" />
            ))}
          </div>
        </div>
        <div className="grid min-w-0 items-start gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
          <div className="min-w-0">
            <p className="mt-3 leading-7 text-stone-600">{room.description}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Detail icon={UsersRound} label="Occupancy" value={`${room.occupancy_adults} adults, ${room.occupancy_children} children`} />
              <Detail icon={BedDouble} label="Bed" value={room.bed_type || 'Premium bedding'} />
              <Detail icon={Bath} label="Size" value={room.size_sqft ? `${room.size_sqft} sq ft` : 'Spacious'} />
            </div>
            <div className="mt-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <p className="eyebrow">Amenities</p>
                <h3 className="mt-1 text-2xl font-extrabold">Select stay add-ons</h3>
              </div>
              {amenitySubtotal ? <p className="rounded-md bg-bone px-3 py-2 text-sm font-bold text-charcoal">Selected Rs {amenitySubtotal.toLocaleString('en-IN')}</p> : null}
            </div>
            {amenityItems.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {amenityItems.map((amenity) => (
                  <AmenityOption key={amenity.id || amenity.name} amenity={amenity} selected={selectedAmenityIds.includes(amenity.id)} onToggle={() => onToggleAmenity(amenity.id)} />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-md border border-mist bg-bone p-4 text-sm font-semibold text-stone-600">The hotel has not added room-specific amenities yet.</p>
            )}
            {offers.length ? (
              <div className="mt-7">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                  <div>
                    <p className="eyebrow">Offers</p>
                    <h3 className="mt-1 text-2xl font-extrabold">Choose your saving</h3>
                  </div>
                  {selectedOffer ? (
                    <button type="button" className="btn-secondary !min-h-10 !px-4" onClick={() => onSelectOffer(selectedOffer.id)}>
                      Remove offer
                    </button>
                  ) : null}
                </div>
                <AutoScrollRow ariaLabel="Room detail offers" className="mt-4 max-w-full" step={340}>
                  {offers.slice(0, 6).map((offerItem) => (
                    <OfferChoiceCard key={offerItem.id} offer={offerItem} selected={selectedOfferId === offerItem.id} onSelect={() => onSelectOffer(offerItem.id)} compact />
                  ))}
                </AutoScrollRow>
              </div>
            ) : null}
          </div>
          <div className="min-w-0 rounded-lg border border-emerald-200 bg-[linear-gradient(180deg,#ecfdf5_0%,#fff7ed_58%,#ffffff_100%)] p-4 shadow-soft">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">Pricing preview</p>
            <div className="mt-3 overflow-hidden rounded-lg border border-emerald-300 bg-white">
              <div className="bg-emerald-700 px-4 py-3 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-100">{selectedOffer ? 'Final offer subtotal' : 'Stay subtotal'}</p>
                <p className="mt-1 text-4xl font-black leading-none">Rs {estimatedTotal.toLocaleString('en-IN')}</p>
                <p className="mt-1 text-xs font-semibold text-emerald-50">before taxes and payment option</p>
              </div>
              <div className="p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Regular with add-ons</p>
                    <p className={`mt-1 text-lg font-black text-stone-500 ${totalSaving ? 'line-through' : ''}`}>Rs {regularSubtotal.toLocaleString('en-IN')}</p>
                  </div>
                  {totalSaving ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Save Rs {totalSaving.toLocaleString('en-IN')}</p> : null}
                </div>
                <p className="mt-3 break-words text-2xl font-black text-emerald-800">Rs {effectiveNightPrice.toLocaleString('en-IN')} <span className="text-xs font-bold text-stone-500">/ night with add-ons</span></p>
                <p className="mt-1 text-xs font-semibold text-stone-500">Room + selected amenities before booking offer.</p>
                {roomPriceSaving ? <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Room-rate saving Rs {roomPriceSaving.toLocaleString('en-IN')} for this stay</p> : null}
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <Line label="Dates" value={`${form.checkIn} to ${form.checkOut}`} />
              <Line label="Nights" value={nights > 0 ? nights : 'Check dates'} />
              <Line label="Guests" value={`${form.adults} adults, ${form.children} children`} />
              <Line label="Rooms" value={form.roomsCount} />
              <Line label="Regular room subtotal" value={`Rs ${regularRoomSubtotal.toLocaleString('en-IN')}`} />
              <Line label="Offer room subtotal" value={`Rs ${roomSubtotal.toLocaleString('en-IN')}`} />
              {selectedAmenityItems.length ? <Line label="Amenities" value={`Rs ${amenitySubtotal.toLocaleString('en-IN')}`} /> : null}
              <Line label="Regular total with add-ons" value={`Rs ${regularSubtotal.toLocaleString('en-IN')}`} />
              {selectedOffer ? (
                <div className="rounded-md border border-white/70 p-3 text-white shadow-soft backdrop-blur-xl" style={{ backgroundImage: selectedOfferVisual.card }}>
                  <InvertedLine label={selectedOffer.title} value={`- Rs ${offerDiscount.toLocaleString('en-IN')}`} />
                  <p className="mt-1 text-xs font-bold text-white/82">{formatOfferValue(selectedOffer)} applied for this preview.</p>
                </div>
              ) : null}
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <Line label="Estimated subtotal" value={`Rs ${estimatedTotal.toLocaleString('en-IN')}`} />
              </div>
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
    <div className="flex h-11 items-center justify-between rounded-md border border-mist bg-white px-2 shadow-sm">
      <button className="grid h-8 w-8 place-items-center rounded-md bg-bone text-charcoal transition hover:bg-charcoal hover:text-white" type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, Number(value) - 1))}><Minus size={15} /></button>
      <span className="font-extrabold">{value}</span>
      <button className="grid h-8 w-8 place-items-center rounded-md bg-charcoal text-white transition hover:bg-amberline" type="button" aria-label="Increase" onClick={() => onChange(Number(value) + 1)}><Plus size={15} /></button>
    </div>
  )
}

function DatePicker({ label, value, min, onChange, className = '' }) {
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
    <label className={`relative min-w-0 ${className}`}>
      <span className="label">{label}</span>
      <button type="button" className="date-button" onClick={() => setOpen((next) => !next)}>
        <CalendarDays size={18} className="text-amberline" />
        <span>{formatDateLabel(value)}</span>
      </button>
      {open ? (
        <motion.div
          className="fixed left-4 right-4 top-24 z-[80] rounded-lg border border-mist bg-white p-3 text-charcoal shadow-panel sm:absolute sm:left-0 sm:right-auto sm:top-[4.5rem] sm:w-[min(19rem,calc(100vw-2rem))]"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className="calendar-nav" onClick={() => setViewDate(addMonths(viewDate, -1))} aria-label="Previous month"><ChevronLeft size={17} /></button>
            <p className="text-sm font-extrabold text-charcoal">{viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
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

function Field({ label, children, className = '' }) {
  return <label className={`min-w-0 ${className}`}><span className="label">{label}</span>{children}</label>
}

function Line({ label, value }) {
  return <div className="flex min-w-0 justify-between gap-4"><span className="min-w-0 break-words text-stone-500">{label}</span><span className="min-w-0 shrink-0 break-words text-right font-bold text-charcoal">{value}</span></div>
}

function InvertedLine({ label, value }) {
  return <div className="flex min-w-0 justify-between gap-4"><span className="min-w-0 break-words text-white/76">{label}</span><span className="min-w-0 shrink-0 break-words text-right font-bold text-white">{value}</span></div>
}

function getRoomAmenityItems(room) {
  if (!room) return []
  if (Array.isArray(room.amenity_items) && room.amenity_items.length) {
    return room.amenity_items
      .filter((amenity) => amenity?.name)
      .map((amenity) => ({
        id: amenity.id || '',
        name: amenity.name,
        description: amenity.description || '',
        price: Number(amenity.price || 0),
      }))
  }
  return (room.amenities || []).map((name) => ({ id: '', name, description: '', price: 0 }))
}

function getBookableAmenityItems(room, hotelAmenities = []) {
  const seen = new Set()
  const items = []
  for (const amenity of hotelAmenities || []) {
    if (!amenity?.name) continue
    const key = amenity.id || amenity.name
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      id: amenity.id || '',
      name: amenity.name,
      description: amenity.description || '',
      price: Number(amenity.price || 0),
      icon: amenity.icon || 'sparkles',
    })
  }
  for (const amenity of getRoomAmenityItems(room)) {
    const key = amenity.id || amenity.name
    if (seen.has(key)) continue
    seen.add(key)
    items.push(amenity)
  }
  return items
}

function getSelectedAmenityItems(room, hotelAmenities, selectedAmenityIds) {
  const selectedIds = new Set(selectedAmenityIds || [])
  return getBookableAmenityItems(room, hotelAmenities).filter((amenity) => amenity.id && selectedIds.has(amenity.id))
}

function getRoomImages(room) {
  const images = []
  if (room?.hero_image_url) images.push({ url: room.hero_image_url, alt: room.name })
  if (Array.isArray(room?.gallery)) {
    for (const image of room.gallery) {
      const url = typeof image === 'string' ? image : image?.url
      if (url && !images.some((item) => item.url === url)) images.push({ url, alt: image?.alt || room.name })
      if (images.length >= 3) break
    }
  }
  return images.length ? images : [{ url: fallbackRoomImage, alt: room?.name || 'Room' }]
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

function getHotelHeroImages(hotel) {
  const uploaded = Array.isArray(hotel?.branding?.heroImages)
    ? hotel.branding.heroImages.map((item) => (typeof item === 'string' ? item : item?.url || item?.secureUrl)).filter(Boolean)
    : []
  return [...uploaded, hotel?.hero_image_url].filter(Boolean)
}

function getOfferVisual(offer) {
  const themes = [
    {
      card: 'linear-gradient(135deg,rgba(74,17,26,0.96) 0%,rgba(127,29,29,0.88) 48%,rgba(245,158,11,0.74) 100%)',
      compact: 'linear-gradient(135deg,rgba(74,17,26,0.96),rgba(180,83,9,0.86))',
      shadow: '0 18px 44px rgba(127,29,29,0.24)',
    },
    {
      card: 'linear-gradient(135deg,rgba(6,78,59,0.95) 0%,rgba(13,148,136,0.86) 50%,rgba(250,204,21,0.68) 100%)',
      compact: 'linear-gradient(135deg,rgba(6,78,59,0.95),rgba(13,148,136,0.84))',
      shadow: '0 18px 44px rgba(13,148,136,0.22)',
    },
    {
      card: 'linear-gradient(135deg,rgba(49,46,129,0.95) 0%,rgba(126,34,206,0.82) 48%,rgba(244,114,182,0.72) 100%)',
      compact: 'linear-gradient(135deg,rgba(49,46,129,0.95),rgba(126,34,206,0.84))',
      shadow: '0 18px 44px rgba(126,34,206,0.2)',
    },
    {
      card: 'linear-gradient(135deg,rgba(12,74,110,0.95) 0%,rgba(37,99,235,0.84) 48%,rgba(45,212,191,0.7) 100%)',
      compact: 'linear-gradient(135deg,rgba(12,74,110,0.95),rgba(37,99,235,0.84))',
      shadow: '0 18px 44px rgba(37,99,235,0.2)',
    },
  ]
  const key = String(offer?.id || offer?.title || '')
  const hash = Array.from(key).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return themes[hash % themes.length]
}

function getBackgroundVideoSource(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const youtubeId = getYouTubeVideoId(raw)
  if (youtubeId) {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      controls: '0',
      loop: '1',
      playlist: youtubeId,
      start: '0',
      playsinline: '1',
      rel: '0',
      showinfo: '0',
      autohide: '1',
      modestbranding: '1',
      iv_load_policy: '3',
      disablekb: '1',
      fs: '0',
    })
    return { type: 'youtube', src: `https://www.youtube-nocookie.com/embed/${youtubeId}?${params.toString()}` }
  }

  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(raw)) return { type: 'file', src: raw }
  return null
}

function getYouTubeVideoId(value) {
  try {
    const url = new URL(value)
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/').filter(Boolean)[1] || ''
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/').filter(Boolean)[1] || ''
      return url.searchParams.get('v') || ''
    }
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || ''
  } catch {
    return ''
  }
  return ''
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
