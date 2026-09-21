import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bath, BedDouble, CalendarCheck, Check, ChevronRight, CreditCard, Dumbbell, Gift, Loader2, Maximize2, Minus, Plus, ShieldCheck, Sparkles, Utensils, Waves, Wifi, UsersRound } from 'lucide-react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { AutoScrollRow } from '../../components/ui/AutoScrollRow.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { GuideToast } from '../../components/ui/GuideToast.jsx'
import { ImageLightbox } from '../../components/ui/ImageLightbox.jsx'
import { StayDateRangePicker } from '../../components/ui/StayDateRangePicker.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../auth/authContext.js'
import { useAppUser } from '../auth/useAppUser.js'
import { apiFetch } from '../../services/apiClient.js'
import { buildTenantPath, getSavedTenantKey, resolveTenantFromLocation } from '../tenant/resolveTenant.js'

const fallbackRoomImage = 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80'
const PARTIAL_PAYMENT_PERCENT = 25
const DEFAULT_LOYALTY_REDEMPTION_MIN_POINTS = 1000
const FIXED_TAX_RATE = 5
const TERMS_VERSION = '2026-09-20'
const bookingAuthDraftKey = 'rs-exclusive-booking-auth-return'
const bookingAuthDraftMaxAgeMs = 60 * 60 * 1000
const termsAndConditions = [
  'The primary guest must be at least 18 years of age to check in.',
  'Every guest above 18 must carry an original valid photo ID at check-in.',
  'Guests are responsible for damage beyond normal wear and tear.',
  'Booking-specific policies may apply and will be confirmed by the hotel.',
  'The hotel may contact guests before arrival to confirm check-in details.',
  'Guest information may be used for reservations, guest service, marketing, analytics, and record keeping by the hotel group.',
]

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

function removeBookingAuthDraft() {
  try {
    window.sessionStorage.removeItem(bookingAuthDraftKey)
  } catch {
    // Session storage can be unavailable in restricted browser modes.
  }
}

function readBookingAuthDraft() {
  try {
    const draft = JSON.parse(window.sessionStorage.getItem(bookingAuthDraftKey) || 'null')
    if (!draft?.savedAt || Date.now() - Number(draft.savedAt) > bookingAuthDraftMaxAgeMs) {
      removeBookingAuthDraft()
      return null
    }
    return draft
  } catch {
    removeBookingAuthDraft()
    return null
  }
}

export function BookingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { isAuthenticated, firebaseUser, loading: authLoading } = useAuth()
  const appUser = useAppUser()
  const [defaultCheckIn, defaultCheckOut] = defaultDates()
  const [form, setForm] = useState({
    checkIn: queryValue(params, 'checkIn', defaultCheckIn),
    checkOut: queryValue(params, 'checkOut', defaultCheckOut),
    roomsCount: Number(queryValue(params, 'roomsCount', '1')),
    adults: Number(queryValue(params, 'adults', '1')),
    children: Number(queryValue(params, 'children', '0')),
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    gstClaim: {
      enabled: false,
      companyName: '',
      gstNumber: '',
      companyAddress: '',
    },
  })
  const [availableRooms, setAvailableRooms] = useState([])
  const [selectedRoomId, setSelectedRoomId] = useState(params.get('roomTypeId') || '')
  const [selectedOfferId, setSelectedOfferId] = useState(params.get('offerId') || '')
  const [selectedAmenityIds, setSelectedAmenityIds] = useState(() => queryList(params, 'amenities'))
  const [redeemPoints, setRedeemPoints] = useState(Math.max(0, Number(queryValue(params, 'redeemPoints', '0'))))
  const [paymentMode, setPaymentMode] = useState(params.get('paymentMode') === 'partial' ? 'partial' : 'full')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [searched, setSearched] = useState(false)
  const [status, setStatus] = useState({ loading: false, error: '', paymentError: '' })
  const [guideToast, setGuideToast] = useState(null)
  const guideToastTimer = useRef(null)
  const roomsSectionRef = useRef(null)
  const initialAvailabilityLoaded = useRef(false)
  const authDraftRestored = useRef(false)
  const defaultOfferApplied = useRef(false)
  const loadAvailabilityRef = useRef(null)
  const { data, loading, error } = useAsync(() => apiFetch('/tenant'), authLoading ? 'auth-loading' : `${firebaseUser?.uid || 'guest'}:${firebaseUser?.emailVerified ? 'verified' : 'unverified'}`)
  const step = params.get('step') || 'list'

  const allRooms = useMemo(() => data?.rooms || [], [data])
  const bookableAmenities = useMemo(() => data?.amenities || [], [data])
  const offers = useMemo(() => data?.offers || [], [data])
  const availableLoyaltyPoints = Number(data?.loyaltyPoints || 0)
  const loyaltyRedemptionMinPoints = Math.max(0, Number(data?.hotel?.policies?.loyaltyRedemptionMinPoints || DEFAULT_LOYALTY_REDEMPTION_MIN_POINTS))
  const loyaltyRedeemEligible = availableLoyaltyPoints >= loyaltyRedemptionMinPoints
  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) || null,
    [offers, selectedOfferId],
  )
  const roomsForDisplay = useMemo(
    () => (searched ? availableRooms : allRooms.filter((room) => roomSupportsGuestIntent(room, form.adults, form.children))),
    [allRooms, availableRooms, form.adults, form.children, searched],
  )
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
  const priceRoom = selectedRoom || detailRoom
  const selectedOfferForRoom = useMemo(
    () => (offerAppliesToRoom(selectedOffer, priceRoom?.id || selectedRoomId) ? selectedOffer : null),
    [priceRoom?.id, selectedOffer, selectedRoomId],
  )
  const allRoomOffers = useMemo(
    () => offers.filter(isAllRoomOffer),
    [offers],
  )
  const reviewOffers = useMemo(
    () => offersForRoom(offers, priceRoom?.id || selectedRoomId),
    [offers, priceRoom?.id, selectedRoomId],
  )
  const selectedAmenityItems = useMemo(
    () => getSelectedAmenityItems(priceRoom, bookableAmenities, selectedAmenityIds, form.adults),
    [priceRoom, bookableAmenities, selectedAmenityIds, form.adults],
  )
  const amenitySubtotal = roundMoney(selectedAmenityItems.reduce((sum, amenity) => sum + Number(amenity.price || 0), 0) * Number(form.roomsCount || 1))
  const roomNightPrice = priceRoom ? Number(priceRoom.subtotal ? priceRoom.subtotal / Math.max(nights, 1) : priceRoom.offer_price || priceRoom.base_price) : 0
  const roomSubtotal = priceRoom ? Number(priceRoom.subtotal || roomNightPrice * nights) * Number(form.roomsCount || 1) : 0
  const grossSubtotal = roundMoney(roomSubtotal + amenitySubtotal)
  const offerDiscount = calculateOfferDiscount(selectedOfferForRoom, grossSubtotal)
  const subtotalBeforeRedemption = Math.max(0, roundMoney(grossSubtotal - offerDiscount))
  const maxRedeemablePoints = loyaltyRedeemEligible ? Math.min(availableLoyaltyPoints, Math.floor(Math.max(0, subtotalBeforeRedemption - 1) / 100)) : 0
  const appliedRedeemPoints = Math.min(Math.max(0, Number(redeemPoints || 0)), maxRedeemablePoints)
  const loyaltyDiscount = roundMoney(appliedRedeemPoints * 100)
  const subtotal = Math.max(0, roundMoney(subtotalBeforeRedemption - loyaltyDiscount))
  const tax = roundMoney((subtotal * FIXED_TAX_RATE) / 100)
  const total = roundMoney(subtotal + tax)
  const paymentDue = paymentMode === 'partial' ? roundMoney(total * (PARTIAL_PAYMENT_PERCENT / 100)) : total
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
    const profile = appUser.data?.user
    if ((!form.guestEmail || !form.guestPhone) && firebaseUser?.email) {
      setForm((current) => ({
        ...current,
        guestName: current.guestName || profile?.fullName || firebaseUser.displayName || '',
        guestEmail: current.guestEmail || firebaseUser.email || '',
        guestPhone: current.guestPhone || profile?.phone || '',
      }))
    }
  }, [appUser.data?.user, firebaseUser, form.guestEmail, form.guestPhone])

  useEffect(() => {
    if (authDraftRestored.current || authLoading || !isAuthenticated) return
    authDraftRestored.current = true
    const draft = readBookingAuthDraft()
    if (!draft) return

    const tenant = resolveTenantFromLocation()
    const currentHotelKey = params.get('hotel') || tenant.key || getSavedTenantKey() || ''
    if (draft.hotelKey && currentHotelKey && draft.hotelKey !== currentHotelKey) return

    if (draft.form) {
      setForm((current) => ({
        ...current,
        checkIn: draft.form.checkIn || current.checkIn,
        checkOut: draft.form.checkOut || current.checkOut,
        roomsCount: Number(draft.form.roomsCount || current.roomsCount || 1),
        adults: Number(draft.form.adults || current.adults || 1),
        children: Number(draft.form.children || current.children || 0),
        guestName: draft.form.guestName || current.guestName,
        guestEmail: draft.form.guestEmail || current.guestEmail,
        guestPhone: draft.form.guestPhone || current.guestPhone,
        gstClaim: {
          ...current.gstClaim,
          ...(draft.form.gstClaim || {}),
        },
      }))
    }
    if (draft.selectedRoomId) setSelectedRoomId(draft.selectedRoomId)
    if (typeof draft.selectedOfferId === 'string') setSelectedOfferId(draft.selectedOfferId)
    if (Array.isArray(draft.selectedAmenityIds)) setSelectedAmenityIds(draft.selectedAmenityIds)
    setRedeemPoints(Math.max(0, Number(draft.redeemPoints || 0)))
    setPaymentMode(draft.paymentMode === 'partial' ? 'partial' : 'full')
    removeBookingAuthDraft()
  }, [authLoading, isAuthenticated, params])

  useEffect(() => {
    if (!roomsForDisplay.length) return
    if (!selectedRoomId || !roomsForDisplay.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(roomsForDisplay[0].id)
    }
  }, [roomsForDisplay, selectedRoomId])

  useEffect(() => {
    if (!data) return
    if (selectedOfferId && !offers.some((offer) => offer.id === selectedOfferId && offerAppliesToRoom(offer, priceRoom?.id || selectedRoomId))) {
      setSelectedOfferId('')
      syncUrl(form, selectedRoomId, { step: step === 'review' || step === 'details' ? step : undefined, offerId: '' })
    }
  }, [data, form, offers, priceRoom?.id, selectedOfferId, selectedRoomId, step, syncUrl])

  useEffect(() => {
    if (defaultOfferApplied.current || !data || selectedOfferId || !allRoomOffers[0]?.id) return
    defaultOfferApplied.current = true
    setSelectedOfferId(allRoomOffers[0].id)
    syncUrl(form, selectedRoomId, { step: step === 'review' || step === 'details' ? step : undefined, offerId: allRoomOffers[0].id })
  }, [allRoomOffers, data, form, selectedOfferId, selectedRoomId, step, syncUrl])

  useEffect(() => {
    if (!priceRoom || !selectedAmenityIds.length) return
    const validIds = new Set(getAddOnAmenityItems(priceRoom, bookableAmenities, form.adults).map((amenity) => amenity.id).filter(Boolean))
    const nextSelected = selectedAmenityIds.filter((id) => validIds.has(id))
    if (nextSelected.length !== selectedAmenityIds.length) setSelectedAmenityIds(nextSelected)
  }, [priceRoom, bookableAmenities, selectedAmenityIds, form.adults])

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
    const checkOut = getStayDateError(checkIn, form.checkOut) ? '' : form.checkOut
    updateStayForm({ ...form, checkIn, checkOut })
  }

  function updateCheckOut(checkOut) {
    updateStayForm({ ...form, checkOut })
  }

  function updateDateRange(checkIn, checkOut) {
    updateStayForm({ ...form, checkIn, checkOut })
  }

  async function completeDateRange(checkIn, checkOut) {
    const nextForm = { ...form, checkIn, checkOut }
    const dateError = getStayDateError(checkIn, checkOut)
    if (dateError) return
    const availability = await loadAvailability({ form: nextForm, silent: true })
    if (availability) scrollToRooms()
  }

  function chooseOffer(offerId) {
    const offer = offers.find((item) => item.id === offerId)
    if (offerId && offer && !offerAppliesToRoom(offer, priceRoom?.id || selectedRoomId)) {
      showGuideToast('Offer unavailable', 'This offer is not available for the selected room category.')
      return
    }
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
    const preservedStep = ['details', 'review'].includes(options.step) ? options.step : ['details', 'review'].includes(step) ? step : undefined
    const searchForm = options.form || form
    const dateError = getStayDateError(searchForm.checkIn, searchForm.checkOut)
    if (dateError) {
      setStatus({ loading: false, error: dateError, paymentError: '' })
      return null
    }
    setStatus({ loading: true, error: '', paymentError: '' })
    syncUrl(searchForm, preferredRoomId, { step: preservedStep })
    try {
      const search = new URLSearchParams({
        checkIn: searchForm.checkIn,
        checkOut: searchForm.checkOut,
        roomsCount: String(searchForm.roomsCount),
        adults: String(searchForm.adults),
        children: String(searchForm.children),
      })
      const payload = await apiFetch(`/availability?${search.toString()}`)
      setAvailableRooms(payload.rooms)
      setSearched(true)
      const selectedStillAvailable = payload.rooms.some((room) => room.id === preferredRoomId)
      const firstRoom = payload.rooms[0]
      const nextRoomId = selectedStillAvailable ? preferredRoomId : firstRoom?.id || ''
      const nextAmenityIds = withRequiredExtraBedAmenity(selectedAmenityIds, payload.rooms, bookableAmenities, nextRoomId, searchForm.adults)
      if (nextAmenityIds.length !== selectedAmenityIds.length) setSelectedAmenityIds(nextAmenityIds)
      setSelectedRoomId(nextRoomId)
      syncUrl(searchForm, nextRoomId, { step: preservedStep, amenityIds: nextAmenityIds })
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
      return
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
    const nextStep = !isAuthenticated && step === 'details' ? 'details' : 'review'
    const next = syncUrl(form, room.id, { step: nextStep })
    if (!isAuthenticated) {
      navigateToBookingAuth(next)
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

  function saveBookingAuthDraft(nextParams) {
    const tenant = resolveTenantFromLocation()
    const hotelKey = nextParams.get('hotel') || tenant.key || getSavedTenantKey() || ''
    try {
      window.sessionStorage.setItem(bookingAuthDraftKey, JSON.stringify({
        savedAt: Date.now(),
        hotelKey,
        returnTo: `${location.pathname}?${nextParams.toString()}`,
        form,
        selectedRoomId: nextParams.get('roomTypeId') || selectedRoomId,
        selectedOfferId: nextParams.get('offerId') || selectedOfferId,
        selectedAmenityIds: queryList(nextParams, 'amenities'),
        redeemPoints: Math.max(0, Number(nextParams.get('redeemPoints') || redeemPoints || 0)),
        paymentMode: nextParams.get('paymentMode') === 'partial' ? 'partial' : paymentMode,
      }))
    } catch {
      // Session storage can be unavailable in restricted browser modes.
    }
  }

  function navigateToBookingAuth(nextParams) {
    saveBookingAuthDraft(nextParams)
    const returnTo = encodeURIComponent(`${location.pathname}?${nextParams.toString()}`)
    navigate(buildTenantPath(`/login?mode=register&returnTo=${returnTo}`, resolveTenantFromLocation()))
  }

  function requireLogin() {
    const next = syncUrl(form, selectedRoomId, { step: step === 'review' || step === 'details' ? step : 'review' })
    navigateToBookingAuth(next)
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
    if (form.gstClaim?.enabled) {
      const missingGstDetails = !String(form.gstClaim.companyName || '').trim() || !String(form.gstClaim.gstNumber || '').trim() || !String(form.gstClaim.companyAddress || '').trim()
      if (missingGstDetails) {
        setStatus({ loading: false, error: '', paymentError: 'Enter company name, GST number, and company address for GST claim.' })
        showGuideToast('GST details required', 'Complete all GST claim fields before payment.')
        return
      }
    }
    if (!termsAccepted) {
      setStatus({ loading: false, error: '', paymentError: 'Accept the booking terms and conditions to continue.' })
      showGuideToast('Terms required', 'Please accept the booking terms before secure payment.')
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
          offerId: selectedOfferForRoom?.id || undefined,
          selectedAmenityIds,
          gstClaim: form.gstClaim || { enabled: false },
          redeemPoints: appliedRedeemPoints,
          paymentMode,
          termsAccepted,
          termsVersion: TERMS_VERSION,
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
        navigate(buildTenantPath(`/account?booking=${encodeURIComponent(confirmed.booking.booking_reference)}`, resolveTenantFromLocation()), { state: { booking: confirmed.booking } })
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
            navigate(buildTenantPath(`/account?booking=${encodeURIComponent(confirmed.booking.booking_reference)}`, resolveTenantFromLocation()), { state: { booking: confirmed.booking } })
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
    return <RoomDetails room={getDisplayRoomForGuests(detailRoom, form.adults)} hotel={data.hotel} form={form} nights={nights} amenities={bookableAmenities} offers={offersForRoom(offers, detailRoom.id)} selectedOfferId={selectedOfferId} selectedAmenityIds={selectedAmenityIds} selectedOffer={offerAppliesToRoom(selectedOfferForRoom, detailRoom.id) ? selectedOfferForRoom : null} offerDiscount={offerDiscount} onSelectOffer={chooseOffer} onToggleAmenity={toggleAmenity} onBook={() => selectRoom(detailRoom)} onClose={backToRooms} />
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
        selectedOffer={selectedOfferForRoom}
        selectedOfferId={selectedOfferId}
        offerDiscount={offerDiscount}
        loyaltyDiscount={loyaltyDiscount}
        redeemPoints={appliedRedeemPoints}
        maxRedeemablePoints={maxRedeemablePoints}
        availableLoyaltyPoints={availableLoyaltyPoints}
        loyaltyRedemptionMinPoints={loyaltyRedemptionMinPoints}
        loyaltyRedeemEligible={loyaltyRedeemEligible}
        tax={tax}
        total={total}
        paymentMode={paymentMode}
        paymentDue={paymentDue}
        balanceDue={balanceDue}
        loyaltyPoints={loyaltyPoints}
        offers={reviewOffers}
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
        termsAccepted={termsAccepted}
        setTermsAccepted={setTermsAccepted}
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
            <StayDateRangePicker className="col-span-2 lg:col-span-2" checkIn={form.checkIn} checkOut={form.checkOut} onCheckInChange={updateCheckIn} onCheckOutChange={updateCheckOut} onRangeChange={updateDateRange} onRangeComplete={completeDateRange} />
            <Field label="Adults"><Stepper value={form.adults} min={1} onChange={(value) => updateStayForm({ ...form, adults: value })} /></Field>
            <Field label="Children (1-7 yrs)"><Stepper value={form.children} min={0} onChange={(value) => updateStayForm({ ...form, children: value })} /></Field>
            <Field label="Rooms" className="col-span-2 sm:col-span-1"><Stepper value={form.roomsCount} min={1} onChange={(value) => updateStayForm({ ...form, roomsCount: value })} /></Field>
            <button className="btn-primary col-span-2 h-12 w-full px-5 sm:col-span-1 lg:col-span-1" type="submit" disabled={status.loading}>
              {status.loading ? <Loader2 size={18} className="animate-spin" /> : <CalendarCheck size={18} />} Search Rooms
            </button>
          </form>
        </FadeIn>

        {(status.error || (stayDateError && form.checkIn && form.checkOut)) ? <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{status.error || stayDateError}</p> : null}

        {allRoomOffers.length ? <BookingOfferBand offers={allRoomOffers} selectedOfferId={selectedOfferId} onSelectOffer={chooseOffer} /> : null}

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

            {roomsForDisplay.length ? (
              <Stagger className="grid gap-4">
                {roomsForDisplay.map((room) => (
                  <RoomCard key={room.id} room={room} adults={form.adults} searched={searched} selected={room.id === selectedRoomId} loading={status.loading} offers={offersForRoom(offers, room.id)} selectedOfferId={selectedOfferId} offer={offerAppliesToRoom(selectedOfferForRoom, room.id) ? selectedOfferForRoom : null} nights={nights} roomsCount={form.roomsCount} onSelectOffer={chooseOffer} onDetails={() => openDetails(room)} onBook={() => selectRoom(room)} />
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
        <p className="max-w-md text-sm font-semibold leading-6 text-stone-600">These offers apply to every room. Room-specific offers appear only on eligible room cards.</p>
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

function RoomCard({ room, adults, searched, selected, loading, offers, selectedOfferId, offer, nights, roomsCount, onSelectOffer, onDetails, onBook }) {
  const displayRoom = getDisplayRoomForGuests(room, adults)
  const unavailable = searched && Number(room.available_rooms || 0) < 1
  const extraBedCount = Number(displayRoom.extra_bed_count || 0)
  const displayPrice = displayRoom.offer_price || displayRoom.base_price
  const staySubtotal = Number(displayRoom.subtotal || Number(displayPrice || 0) * Math.max(nights, 1)) * Number(roomsCount || 1)
  const cardDiscount = calculateOfferDiscount(offer, staySubtotal)
  const discountedStayTotal = Math.max(0, roundMoney(staySubtotal - cardDiscount))
  const roomPriceSaving = displayRoom.offer_price ? Math.max(0, Number(displayRoom.base_price || 0) - Number(displayRoom.offer_price || 0)) : 0
  const possibleLoyaltyPoints = Math.max(0, Math.floor(discountedStayTotal / 100))
  const stayNights = Math.max(nights, 1)
  const roomUnits = Number(roomsCount || 1)
  const bestNightPrice = roundMoney((offer ? discountedStayTotal : staySubtotal) / stayNights / roomUnits)
  const compareNightPrice = displayRoom.offer_price ? Number(displayRoom.base_price || 0) : Number(displayPrice || 0)
  const offerNightSaving = offer ? Math.max(0, roundMoney(Number(displayPrice || 0) - bestNightPrice)) : 0
  const offerVisual = offer ? getOfferVisual(offer) : null
  return (
    <StaggerItem as="article" className={`group grid overflow-visible rounded-lg border bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-card md:grid-cols-[240px_minmax(0,1fr)_225px] lg:grid-cols-[280px_minmax(0,1fr)_235px] ${selected ? 'border-amberline ring-2 ring-amberline/25' : 'border-white/80'}`}>
      <div className="image-lift h-52 rounded-none md:h-full md:min-h-[15.5rem]">
        <RotatingRoomImage room={displayRoom} className="h-full w-full object-cover" />
      </div>
      <div className="flex min-w-0 flex-col gap-3 p-4 md:p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{displayRoom.bed_type || 'Premium room'}</p>
          <h3 className="mt-2 text-2xl font-bold leading-tight">{displayRoom.name}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{displayRoom.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(displayRoom.amenities || []).slice(0, 3).map((amenity) => <span key={amenity} className="rounded-md bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600">{amenity}</span>)}
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
          <span className="flex items-center gap-1"><UsersRound size={16} /> {displayRoom.occupancy_adults} adults, {displayRoom.occupancy_children} children</span>
          <span className="flex items-center gap-1"><BedDouble size={16} /> {searched ? `${displayRoom.available_rooms} available` : 'Search dates'}</span>
        </div>
        {extraBedCount ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold leading-5 text-amber-950">
            Extra bed will be added for {extraBedCount} extra adult{extraBedCount === 1 ? '' : 's'}.
          </p>
        ) : null}
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
              className={`group/offer relative w-40 shrink-0 snap-start rounded-md border px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-amberline/20 sm:w-auto ${selected ? 'border-white/80 text-white ring-1 ring-white/40' : 'border-stone-200 bg-bone/60 text-charcoal hover:border-amberline/35 hover:bg-white'}`}
              style={selected ? { backgroundImage: visual.compact } : undefined}
              onClick={() => onSelectOffer(item.id)}
            >
              <span className="flex items-start justify-between gap-2">
                <span className={`line-clamp-1 text-xs font-extrabold ${selected ? 'text-white' : 'text-charcoal'}`}>{item.title}</span>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[0.64rem] font-black uppercase ${selected ? 'bg-white/90 text-charcoal' : 'bg-bone text-stone-600'}`}>{selected ? 'Applied' : 'Apply'}</span>
              </span>
              <span className={`mt-1 block text-xs font-black ${selected ? 'text-white/85' : 'text-emerald-800'}`}>{formatOfferValue(item)}</span>
              <span className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-0 z-20 hidden w-64 rounded-md border border-white/70 bg-charcoal p-3 text-white opacity-0 shadow-card transition duration-200 group-hover/offer:block group-hover/offer:opacity-100 group-focus/offer:block group-focus/offer:opacity-100">
                <span className="block text-xs font-black uppercase text-amber-100">{item.badge || 'Offer details'}</span>
                <span className="mt-1 block text-sm font-extrabold">{item.title}</span>
                <span className="mt-1 block text-xs font-semibold leading-5 text-white/76">{formatOfferValue(item)}. {item.description}</span>
              </span>
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
  const [openImageIndex, setOpenImageIndex] = useState(null)
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

  function openFullImage(event) {
    event.stopPropagation()
    setPausedUntil(Date.now() + 60_000)
    setOpenImageIndex(index)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-stone-200">
      <button className="relative block h-full w-full text-left" type="button" aria-label="Pause room image rotation" onClick={() => setPausedUntil(Date.now() + 5000)}>
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
      <button
        type="button"
        className="absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-white/40 bg-black/45 px-3 text-xs font-black text-white shadow-soft backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-black/62"
        onClick={openFullImage}
      >
        <Maximize2 size={15} /> View full image
      </button>
      {images.length > 1 ? (
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          {images.map((image, imageIndex) => (
            <span key={`${image.url}-dot`} className={`h-1.5 w-5 rounded-full ${imageIndex === index ? 'bg-white' : 'bg-white/45'}`} />
          ))}
        </div>
      ) : null}
      {openImageIndex !== null ? (
        <ImageLightbox
          images={images}
          index={openImageIndex}
          title={room.name}
          fallbackImage={fallbackRoomImage}
          onIndex={setOpenImageIndex}
          onClose={() => setOpenImageIndex(null)}
        />
      ) : null}
    </div>
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
  loyaltyRedemptionMinPoints,
  loyaltyRedeemEligible,
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
  termsAccepted,
  setTermsAccepted,
}) {
  const roomAmenities = getAddOnAmenityItems(priceRoom, data.amenities || [], form.adults)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const tenantMode = resolveTenantFromLocation()
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
              {Number(priceRoom?.extra_bed_count || 0) ? (
                <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-extrabold leading-6 text-amber-950">
                  Extra bed added for {Number(priceRoom.extra_bed_count)} extra adult{Number(priceRoom.extra_bed_count) === 1 ? '' : 's'}.
                </p>
              ) : null}
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
                  <Line label={`Taxes (${FIXED_TAX_RATE}%)`} value={`Rs ${tax.toLocaleString('en-IN')}`} />
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
              {isAuthenticated && loyaltyRedeemEligible ? (
                <LoyaltyRedeemControl
                  availablePoints={availableLoyaltyPoints}
                  maxRedeemablePoints={maxRedeemablePoints}
                  redeemPoints={redeemPoints}
                  discount={loyaltyDiscount}
                  subtotalBeforeRedemption={subtotalBeforeRedemption}
                  redemptionMinPoints={loyaltyRedemptionMinPoints}
                  eligible={loyaltyRedeemEligible}
                  onChange={onRedeemPoints}
                  onUnavailableAction={onGuide}
                  disabled={false}
                />
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
                  title={`Pay ${PARTIAL_PAYMENT_PERCENT}% advance`}
                  amount={roundMoney(total * (PARTIAL_PAYMENT_PERCENT / 100))}
                  note={`Pay the balance Rs ${roundMoney(total * ((100 - PARTIAL_PAYMENT_PERCENT) / 100)).toLocaleString('en-IN')} at the hotel.`}
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

              {isAuthenticated ? (
                <GstClaimCard
                  value={form.gstClaim || {}}
                  onChange={(gstClaim) => setForm({ ...form, gstClaim })}
                />
              ) : null}

              {isAuthenticated ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                  <label className="flex items-start gap-3 text-sm font-semibold leading-6 text-stone-700">
                    <input className="mt-1 h-4 w-4 accent-[#7f1d1d]" type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                    <span>I agree to the hotel booking terms, guest policies, and data consent terms.</span>
                  </label>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <Link to={buildTenantPath('/terms', tenantMode)} className="text-sm font-black text-[#7f1d1d] underline-offset-4 hover:underline">
                      Open terms and conditions
                    </Link>
                    <button type="button" className="text-sm font-black text-stone-600 underline-offset-4 hover:text-charcoal hover:underline" onClick={() => setTermsOpen((current) => !current)}>
                      {termsOpen ? 'Hide quick summary' : 'Quick summary'}
                    </button>
                  </div>
                  {termsOpen ? (
                    <ol className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-md border border-amber-200 bg-white p-3 text-xs font-semibold leading-5 text-stone-600">
                      {termsAndConditions.map((term, index) => (
                        <li key={`${index}-${term.slice(0, 14)}`}>
                          <span className="font-black text-charcoal">{index + 1}. </span>{term}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : null}

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

function GstClaimCard({ value = {}, onChange }) {
  const enabled = Boolean(value.enabled)
  const update = (patch) => onChange({
    enabled,
    companyName: value.companyName || '',
    gstNumber: value.gstNumber || '',
    companyAddress: value.companyAddress || '',
    ...patch,
  })

  return (
    <section className={`mt-4 overflow-hidden rounded-lg border transition duration-300 ${enabled ? 'border-emerald-300 bg-[linear-gradient(135deg,#ecfdf5,#ffffff_58%,#f0fdf4)] shadow-soft' : 'border-emerald-100 bg-emerald-50/70'}`}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 p-3 text-left"
        onClick={() => update({ enabled: !enabled })}
        aria-expanded={enabled}
      >
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-[0.14em] text-emerald-700">GST claim</span>
          <span className="mt-1 block text-sm font-extrabold leading-6 text-charcoal">Need invoice details for company GST?</span>
        </span>
        <span className={`mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${enabled ? 'bg-emerald-600' : 'bg-emerald-200'}`}>
          <span className={`h-4 w-4 rounded-full bg-white shadow transition ${enabled ? 'translate-x-5' : ''}`} />
        </span>
      </button>
      {enabled ? (
        <div className="grid gap-3 border-t border-emerald-100 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company name">
              <input className="input border-emerald-200 focus:border-emerald-500" value={value.companyName || ''} onChange={(event) => update({ companyName: event.target.value })} placeholder="Registered company name" />
            </Field>
            <Field label="GST number">
              <input className="input border-emerald-200 uppercase focus:border-emerald-500" value={value.gstNumber || ''} onChange={(event) => update({ gstNumber: event.target.value.toUpperCase() })} placeholder="27ABCDE1234F1Z5" />
            </Field>
          </div>
          <Field label="Company address">
            <textarea className="input min-h-24 border-emerald-200 py-3 focus:border-emerald-500" value={value.companyAddress || ''} onChange={(event) => update({ companyAddress: event.target.value })} placeholder="Billing address for GST invoice" />
          </Field>
        </div>
      ) : null}
    </section>
  )
}

function LoyaltyRedeemControl({ availablePoints, maxRedeemablePoints, redeemPoints, discount, subtotalBeforeRedemption, redemptionMinPoints, eligible, onChange, onUnavailableAction, disabled }) {
  const progress = redemptionMinPoints > 0 ? Math.min(100, Math.round((Number(availablePoints || 0) / redemptionMinPoints) * 100)) : 100
  const pointsRemaining = Math.max(0, Number(redemptionMinPoints || 0) - Number(availablePoints || 0))
  const cannotRedeem = disabled || !eligible || maxRedeemablePoints < 1

  function showUnavailableGuide() {
    if (disabled) {
      onUnavailableAction?.('Login required', 'Sign in or create your group account to use loyalty points.')
      return
    }
    if (!eligible) {
      onUnavailableAction?.('Keep collecting points', `You can redeem after reaching ${Number(redemptionMinPoints || 0).toLocaleString('en-IN')} group points.`)
      return
    }
    onUnavailableAction?.('No points available for this booking', `Points can be used when the subtotal is at least Rs 101 before tax.`)
  }

  return (
    <div className="mt-4 rounded-lg border border-[#d8c7a5] bg-[#fff8ea] p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="flex items-center gap-2 text-sm font-extrabold text-charcoal"><Gift size={17} className="text-amberline" /> Redeem group loyalty points</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-stone-600">You have {Number(availablePoints || 0).toLocaleString('en-IN')} group point{availablePoints === 1 ? '' : 's'}. Redemption opens at {Number(redemptionMinPoints || 0).toLocaleString('en-IN')} points. 1 point = Rs 100.</p>
        </div>
        {discount ? <span className="rounded-md bg-white px-3 py-2 text-sm font-black text-emerald-800">- Rs {discount.toLocaleString('en-IN')}</span> : null}
      </div>
      <div className="mt-4 overflow-hidden rounded-full bg-white shadow-inner">
        <div className="h-2.5 rounded-full bg-[linear-gradient(90deg,#7f1d1d,#f59e0b)] transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs font-bold text-stone-600">
        {eligible ? 'Eligible to redeem on checkout.' : `${pointsRemaining.toLocaleString('en-IN')} more point${pointsRemaining === 1 ? '' : 's'} needed before redemption.`}
      </p>
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
            {disabled ? 'Login to redeem points.' : !eligible ? 'Redemption control unlocks after the required point balance.' : maxRedeemablePoints ? `Up to ${maxRedeemablePoints.toLocaleString('en-IN')} points can be used on this booking before tax.` : `No points can be used on Rs ${subtotalBeforeRedemption.toLocaleString('en-IN')} subtotal.`}
          </p>
        </div>
      </div>
    </div>
  )
}

function AmenityOption({ amenity, selected, onToggle }) {
  const disabled = !amenity.id
  const [open, setOpen] = useState(false)
  const hasDescription = Boolean(String(amenity.description || '').trim())
  return (
    <div className={`rounded-lg border p-3 transition duration-300 hover:-translate-y-0.5 hover:shadow-card ${selected ? 'border-amberline bg-amber-50 ring-2 ring-amberline/15' : 'border-mist bg-white'} ${disabled ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border ${selected ? 'border-amberline bg-amberline text-white' : 'border-stone-300 bg-white text-stone-300'} disabled:cursor-not-allowed`}
          aria-label={selected ? `Remove ${amenity.name}` : `Select ${amenity.name}`}
        >
          <Check size={16} />
        </button>
        <div className="grid h-9 w-9 shrink-0 place-items-center text-amberline">
          <AmenityVisual amenity={amenity} className="h-8 w-8" iconSize={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="break-words text-sm font-extrabold text-charcoal">{amenity.name}</p>
            <span className="shrink-0 rounded-md bg-bone px-2 py-1 text-xs font-black text-amberline">{Number(amenity.price || 0) ? `Rs ${Number(amenity.price).toLocaleString('en-IN')}` : 'Included'}</span>
          </div>
          {hasDescription ? (
            <button type="button" className="mt-1 text-xs font-black text-[#7f1d1d] underline-offset-4 hover:underline" onClick={() => setOpen((current) => !current)}>
              {open ? 'Show less' : 'Read more'}
            </button>
          ) : null}
          {open && hasDescription ? <p className="mt-2 text-sm font-medium leading-6 text-stone-600">{amenity.description}</p> : null}
        </div>
      </div>
    </div>
  )
}

function AmenityInfoCard({ amenity }) {
  const [open, setOpen] = useState(false)
  const hasDescription = Boolean(String(amenity.description || '').trim())
  return (
    <article className="min-w-0 rounded-md border border-white/70 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center text-amberline">
          <AmenityVisual amenity={amenity} className="h-9 w-9" iconSize={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-extrabold text-charcoal">{amenity.name}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-800">Included</p>
          {hasDescription ? (
            <button type="button" className="mt-1 text-xs font-black text-[#7f1d1d] underline-offset-4 hover:underline" onClick={() => setOpen((current) => !current)}>
              {open ? 'Show less' : 'Read more'}
            </button>
          ) : null}
        </div>
      </div>
      {open && hasDescription ? <p className="mt-2 text-sm font-medium leading-6 text-stone-600">{amenity.description}</p> : null}
    </article>
  )
}

function RoomDetails({ room, hotel, form, nights, amenities, offers, selectedOfferId, selectedAmenityIds, selectedOffer, offerDiscount, onSelectOffer, onToggleAmenity, onBook, onClose }) {
  const gallery = Array.isArray(room.gallery) && room.gallery.length ? room.gallery : [{ url: room.hero_image_url || fallbackRoomImage, alt: room.name }]
  const { included: includedAmenities, addOns: addOnAmenities } = splitAmenityItems(room, amenities, form.adults)
  const selectedAmenityItems = getSelectedAmenityItems(room, amenities, selectedAmenityIds, form.adults)
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
            {includedAmenities.length ? (
              <div className="mt-5 rounded-lg border border-mist bg-bone/70 p-3">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                  <div>
                    <p className="eyebrow">Already included</p>
                    <h3 className="mt-1 text-xl font-extrabold text-charcoal">Room amenities</h3>
                  </div>
                  <span className="rounded-md bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-800">Included</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {includedAmenities.slice(0, 9).map((amenity) => <AmenityInfoCard key={amenity.id || amenity.name} amenity={amenity} />)}
                </div>
              </div>
            ) : null}
            {Number(room.extra_bed_count || 0) ? (
              <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-extrabold leading-6 text-amber-950">
                Extra bed will be added automatically for {Number(room.extra_bed_count)} extra adult{Number(room.extra_bed_count) === 1 ? '' : 's'}.
              </p>
            ) : null}
            <div className="mt-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <p className="eyebrow">Add-ons</p>
                <h3 className="mt-1 text-2xl font-extrabold">Select paid stay add-ons</h3>
              </div>
              {amenitySubtotal ? <p className="rounded-md bg-bone px-3 py-2 text-sm font-bold text-charcoal">Selected Rs {amenitySubtotal.toLocaleString('en-IN')}</p> : null}
            </div>
            {addOnAmenities.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {addOnAmenities.map((amenity) => (
                  <AmenityOption key={amenity.id || amenity.name} amenity={amenity} selected={selectedAmenityIds.includes(amenity.id)} onToggle={() => onToggleAmenity(amenity.id)} />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-md border border-mist bg-bone p-4 text-sm font-semibold text-stone-600">No paid add-ons are available for this room right now.</p>
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
        icon: amenity.icon || 'sparkles',
      }))
  }
  return (room.amenities || []).map((name) => ({ id: '', name, description: '', price: 0, icon: 'sparkles' }))
}

function splitAmenityItems(room, hotelAmenities = [], adults = 1) {
  const hotelItems = (hotelAmenities || [])
    .filter((amenity) => amenity?.name)
    .map((amenity) => ({
      id: amenity.id || '',
      name: amenity.name,
      description: amenity.description || '',
      price: Number(amenity.price || 0),
      icon: amenity.icon || 'sparkles',
    }))
  const hotelById = new Map(hotelItems.filter((amenity) => amenity.id).map((amenity) => [amenity.id, amenity]))
  const hotelByName = new Map(hotelItems.map((amenity) => [String(amenity.name || '').toLowerCase(), amenity]))
  const roomItems = getRoomAmenityItems(room).map((amenity) => {
    const catalogAmenity = (amenity.id && hotelById.get(amenity.id)) || hotelByName.get(String(amenity.name || '').toLowerCase())
    return catalogAmenity ? { ...catalogAmenity, ...amenity, icon: catalogAmenity.icon || amenity.icon, description: catalogAmenity.description || amenity.description } : amenity
  })
  const included = []
  const addOns = []
  const includedKeys = new Set()
  const addOnKeys = new Set()

  for (const amenity of roomItems) {
    const key = amenity.id || amenity.name
    if (Number(amenity.price || 0) > 0) {
      if (!addOnKeys.has(key)) {
        addOnKeys.add(key)
        addOns.push(amenity)
      }
      continue
    }
    if (!includedKeys.has(key)) {
      includedKeys.add(key)
      included.push(amenity)
    }
  }

  for (const amenity of hotelItems) {
    if (isExtraBedAmenity(amenity) && Number(adults || 1) !== 3) continue
    const key = amenity.id || amenity.name
    if (Number(amenity.price || 0) <= 0) {
      if (!includedKeys.has(key)) {
        includedKeys.add(key)
        included.push(amenity)
      }
      continue
    }
    if (!addOnKeys.has(key)) {
      addOnKeys.add(key)
      addOns.push(amenity)
    }
  }

  return { included, addOns }
}

function getAddOnAmenityItems(room, hotelAmenities = [], adults = 1) {
  return splitAmenityItems(room, hotelAmenities, adults).addOns
}

function getSelectedAmenityItems(room, hotelAmenities, selectedAmenityIds, adults = 1) {
  const selectedIds = new Set(selectedAmenityIds || [])
  return getAddOnAmenityItems(room, hotelAmenities, adults).filter((amenity) => amenity.id && selectedIds.has(amenity.id))
}

function getDisplayRoomForGuests(room, adults = 1) {
  if (!room || room.selected_rate_category) return room
  const rates = room.rate_options || {}
  const category = Number(adults || 1) <= 1 && rates.single ? 'single' : Number(adults || 1) <= 1 && rates.double ? 'double' : rates.double ? 'double' : ''
  const rate = category ? rates[category] : null
  if (!rate) return room
  return {
    ...room,
    occupancy_adults: rate.occupancyAdults ?? room.occupancy_adults,
    occupancy_children: rate.occupancyChildren ?? room.occupancy_children,
    base_price: rate.basePrice ?? room.base_price,
    offer_price: rate.offerPrice ?? null,
    size_sqft: rate.sizeSqft ?? room.size_sqft,
    selected_rate_category: category,
  }
}

function roomSupportsGuestIntent(room, adults = 1, children = 0) {
  if (!room) return false
  const requestedAdults = Number(adults || 1)
  const requestedChildren = Number(children || 0)
  const rates = room.rate_options || {}
  const candidate = requestedAdults <= 1
    ? (rates.single || rates.double || null)
    : (rates.double || null)
  if (!candidate) return requestedAdults <= 1 && Number(room.occupancy_adults || 0) >= requestedAdults && Number(room.occupancy_children || 0) >= requestedChildren
  const adultsCapacity = Number(candidate.occupancyAdults ?? room.occupancy_adults ?? 0)
  const childrenCapacity = Number(candidate.occupancyChildren ?? room.occupancy_children ?? 0)
  const extraAdultCapacity = requestedAdults >= 3 ? 1 : 0
  return adultsCapacity + extraAdultCapacity >= requestedAdults && childrenCapacity >= requestedChildren
}

function getAmenityIcon(amenity) {
  const value = String(amenity?.icon || amenity?.name || '').toLowerCase()
  if (value.includes('wifi') || value.includes('internet')) return Wifi
  if (value.includes('pool') || value.includes('spa')) return Waves
  if (value.includes('gym') || value.includes('fitness')) return Dumbbell
  if (value.includes('dining') || value.includes('breakfast') || value.includes('restaurant') || value.includes('food')) return Utensils
  if (value.includes('bath')) return Bath
  if (value.includes('bed') || value.includes('linen')) return BedDouble
  return Sparkles
}

function AmenityVisual({ amenity, className = 'h-8 w-8', iconSize = 22 }) {
  const Icon = getAmenityIcon(amenity)
  if (isUrl(amenity?.icon)) return <img src={amenity.icon} alt="" className={`${className} object-contain`} loading="lazy" />
  return <Icon size={iconSize} strokeWidth={2} />
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function findExtraBedAmenity(amenities = []) {
  return amenities.find((amenity) => isExtraBedAmenity(amenity))
}

function isExtraBedAmenity(amenity) {
  return /extra\s*bed|additional\s*bed|rollaway/i.test(String(amenity?.name || ''))
}

function withRequiredExtraBedAmenity(currentIds = [], rooms = [], amenities = [], selectedRoomId = '', adults = 1) {
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || rooms[0]
  if (Number(adults || 1) !== 3 || Number(selectedRoom?.extra_bed_count || 0) <= 0) return currentIds
  const amenity = findExtraBedAmenity(amenities)
  if (!amenity?.id || currentIds.includes(amenity.id)) return currentIds
  return [...currentIds, amenity.id]
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

function offerAppliesToRoom(offer, roomTypeId) {
  if (!offer) return false
  if (isAllRoomOffer(offer) || !roomTypeId) return true
  const roomTypeIds = Array.isArray(offer.room_type_ids) ? offer.room_type_ids : []
  return roomTypeIds.includes(roomTypeId)
}

function isAllRoomOffer(offer) {
  const roomTypeIds = Array.isArray(offer?.room_type_ids) ? offer.room_type_ids : []
  return roomTypeIds.length === 0
}

function offersForRoom(offers = [], roomTypeId = '') {
  return offers.filter((offer) => offerAppliesToRoom(offer, roomTypeId))
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
