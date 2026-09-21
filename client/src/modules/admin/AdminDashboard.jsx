import { Link } from 'react-router-dom'
import {
  Accessibility,
  BadgePercent,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CircleUserRound,
  ClipboardPlus,
  Download,
  Eye,
  Gift,
  HelpCircle,
  Home,
  Hotel,
  ImagePlus,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { StatusPill } from '../../components/ui/StatusPill.jsx'
import { StayDateRangePicker } from '../../components/ui/StayDateRangePicker.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch, receiptDownloadUrl } from '../../services/apiClient.js'
import { uploadImageToCloudinary } from '../../services/cloudinaryUpload.js'
import { logout } from '../auth/firebaseClient.js'
import { buildTenantPath, resolveTenantFromLocation } from '../tenant/resolveTenant.js'
import { logoDisplayUrl } from '../../utils/logoUrl.js'

const tabs = [
  { key: 'summary', Icon: LayoutDashboard, label: 'Dashboard', text: 'Hotel summary' },
  { key: 'rooms', Icon: BedDouble, label: 'Rooms', text: 'Room types and inventory' },
  { key: 'inventory', Icon: CalendarDays, label: 'Inventory', text: 'Sold-out rooms and availability' },
  { key: 'rates', Icon: IndianRupee, label: 'Rate calendar', text: 'Date-wise room pricing' },
  { key: 'create-booking', Icon: ClipboardPlus, label: 'Create booking', text: 'Manual reservations' },
  { key: 'bookings', Icon: CalendarDays, label: 'Bookings', text: 'Arrivals and history' },
  { key: 'cancellations', Icon: CircleAlert, label: 'Cancellations', text: 'Guest cancellation requests' },
  { key: 'users', Icon: UsersRound, label: 'Users', text: 'Guest profiles' },
  { key: 'feedback', Icon: MessageSquare, label: 'Feedback', text: 'Guest messages' },
  { key: 'amenities', Icon: Sparkles, label: 'Amenities', text: 'Hotel add-ons' },
  { key: 'faqs', Icon: HelpCircle, label: 'FAQ', text: 'Guest questions' },
  { key: 'offers', Icon: Gift, label: 'Offers', text: 'Discount rules' },
  { key: 'settings', Icon: Settings, label: 'Settings', text: 'Loyalty rules' },
]

const profileOptions = [
  { avatar: 'avatar-male', gender: 'male', Icon: UserRound },
  { avatar: 'avatar-female', gender: 'female', Icon: CircleUserRound },
  { avatar: 'avatar-transgender', gender: 'transgender', Icon: Accessibility },
]

const emptyRoom = {
  id: '',
  name: '',
  description: '',
  roomCategories: ['single'],
  rateOptions: {
    single: { basePrice: '', offerPrice: '', sizeSqft: '', physicalRooms: 1, occupancyAdults: 1, occupancyChildren: 2 },
    double: { basePrice: '', offerPrice: '', sizeSqft: '', physicalRooms: 1, occupancyAdults: 2, occupancyChildren: 2 },
  },
  bedType: '',
  customAmenities: '',
  selectedAmenityIds: [],
  image1: '',
  image2: '',
  image3: '',
  showOnHomepage: false,
  active: true,
  inventoryDays: 180,
}

const emptyAmenity = { id: '', name: '', description: '', price: 0, icon: '', active: true }
const emptyFaq = { id: '', question: '', answer: '', sortOrder: 0, active: true }
const emptyOffer = {
  id: '',
  title: '',
  description: '',
  code: '',
  discountType: 'percentage',
  discountValue: 10,
  roomTypeIds: [],
  startsAt: new Date().toISOString().slice(0, 16),
  endsAt: nextMonthDateTime(),
  active: true,
  audienceType: 'general',
  minCompletedBookings: 2,
  badge: 'Limited offer',
  highlightColor: '#f59e0b',
  imageUrl: '',
}
const emptyManualBooking = {
  roomTypeId: '',
  checkIn: nextDay(1),
  checkOut: nextDay(2),
  roomsCount: 1,
  adults: 1,
  children: 0,
  guestName: '',
  guestEmail: '',
  guestPhone: '',
  status: 'confirmed',
  totalAmount: '',
}
const emptyInventoryForm = {
  roomTypeId: '',
  startDate: nextDay(1),
  endDate: nextDay(1),
  offlineRooms: 0,
  closed: false,
  note: '',
}
const emptyRateForm = {
  roomTypeId: '',
  startDate: nextDay(1),
  endDate: nextDay(7),
  rateCategory: 'all',
  price: '',
}

const DEFAULT_LOYALTY_REDEMPTION_MIN_POINTS = 1000

export function AdminDashboard() {
  const [refreshKeys, setRefreshKeys] = useState({
    dashboard: 0,
    rooms: 0,
    bookings: 0,
    cancellations: 0,
    users: 0,
    feedback: 0,
    amenities: 0,
    faqs: 0,
    offers: 0,
    inventory: 0,
    rates: 0,
    settings: 0,
  })
  const [activePage, setActivePage] = useState('summary')
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [roomForm, setRoomForm] = useState(emptyRoom)
  const [showRoomForm, setShowRoomForm] = useState(false)
  const [amenityForm, setAmenityForm] = useState(emptyAmenity)
  const [showAmenityForm, setShowAmenityForm] = useState(false)
  const [faqForm, setFaqForm] = useState(emptyFaq)
  const [showFaqForm, setShowFaqForm] = useState(false)
  const [offerForm, setOfferForm] = useState(emptyOffer)
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [bookingForm, setBookingForm] = useState(null)
  const [manualBooking, setManualBooking] = useState(emptyManualBooking)
  const [inventoryForm, setInventoryForm] = useState(emptyInventoryForm)
  const [rateForm, setRateForm] = useState(emptyRateForm)
  const [inventoryEditTarget, setInventoryEditTarget] = useState(null)
  const [rateEditTarget, setRateEditTarget] = useState(null)
  const [inventorySummaryRoomId, setInventorySummaryRoomId] = useState('')
  const [rateSummaryRoomId, setRateSummaryRoomId] = useState('')
  const [removedInventoryEntryIds, setRemovedInventoryEntryIds] = useState(() => new Set())
  const [removedRateEntryIds, setRemovedRateEntryIds] = useState(() => new Set())
  const [showInventoryBulk, setShowInventoryBulk] = useState(false)
  const [showRateBulk, setShowRateBulk] = useState(false)
  const [showInventoryEntries, setShowInventoryEntries] = useState(false)
  const [showRateEntries, setShowRateEntries] = useState(false)
  const [inventoryDayEditor, setInventoryDayEditor] = useState(null)
  const [rateDayEditor, setRateDayEditor] = useState(null)
  const [entryDetails, setEntryDetails] = useState(null)
  const [activeUser, setActiveUser] = useState(null)
  const [filters, setFilters] = useState({ rooms: '', bookings: '', bookingStatus: 'all', cancellations: '', cancellationStatus: 'requested', users: '', feedback: '', amenities: '', faqs: '', offers: '', offerAudience: 'all' })
  const [settingsForm, setSettingsForm] = useState({ loyaltyRedemptionMinPoints: DEFAULT_LOYALTY_REDEMPTION_MIN_POINTS })

  const dashboard = useAsync(() => apiFetch('/admin/dashboard'), refreshKeys.dashboard)
  const rooms = useAsync(() => apiFetch('/admin/rooms'), refreshKeys.rooms)
  const bookings = useAsync(() => apiFetch('/admin/bookings'), refreshKeys.bookings)
  const cancellations = useAsync(() => apiFetch('/admin/cancellation-requests'), refreshKeys.cancellations)
  const users = useAsync(() => apiFetch('/admin/users'), refreshKeys.users)
  const feedback = useAsync(() => apiFetch('/admin/feedback'), refreshKeys.feedback)
  const amenities = useAsync(() => apiFetch('/admin/amenities'), refreshKeys.amenities)
  const faqs = useAsync(() => apiFetch('/admin/faqs'), refreshKeys.faqs)
  const offers = useAsync(() => apiFetch('/admin/offers'), refreshKeys.offers)
  const inventoryBlocks = useAsync(() => apiFetch('/admin/inventory-blocks'), refreshKeys.inventory)
  const ratePlans = useAsync(() => apiFetch('/admin/rate-plans'), refreshKeys.rates)

  const roomList = rooms.data?.rooms || []
  const amenityList = amenities.data?.amenities || []
  const faqList = faqs.data?.faqs || []
  const bookingList = bookings.data?.bookings || []
  const cancellationList = cancellations.data?.requests || []
  const userList = users.data?.users || []
  const feedbackList = feedback.data?.feedback || []
  const offerList = offers.data?.offers || []
  const inventoryEntries = (inventoryBlocks.data?.entries || []).filter((entry) => !removedInventoryEntryIds.has(entry.id))
  const rateEntries = (ratePlans.data?.entries || []).filter((entry) => !removedRateEntryIds.has(entry.id))
  const firstRoomId = roomList[0]?.id || ''
  const inventorySummary = useAsync(
    () => inventorySummaryRoomId ? apiFetch(`/admin/rooms/${inventorySummaryRoomId}/calendar-summary`) : Promise.resolve({ room: null, days: [] }),
    `${refreshKeys.inventory}:inventory-summary:${inventorySummaryRoomId}`,
  )
  const rateSummary = useAsync(
    () => rateSummaryRoomId ? apiFetch(`/admin/rooms/${rateSummaryRoomId}/calendar-summary`) : Promise.resolve({ room: null, days: [] }),
    `${refreshKeys.rates}:rate-summary:${rateSummaryRoomId}`,
  )

  function refresh(message, type = 'success', scopes = ['dashboard']) {
    setNotice({ type, message })
    setRefreshKeys((current) => {
      const next = { ...current }
      for (const scope of scopes) next[scope] = (next[scope] || 0) + 1
      return next
    })
  }

  function startRoomEdit(room) {
    const amenityItems = Array.isArray(room.amenity_items) ? room.amenity_items : []
    const gallery = Array.isArray(room.gallery) ? room.gallery : []
    const rateOptions = normalizeRoomRateOptions(room)
    const roomCategories = Object.entries(rateOptions).filter(([, option]) => option.enabled).map(([category]) => category)
    setRoomForm({
      id: room.id,
      name: room.name || '',
      description: room.description || '',
      roomCategories: roomCategories.length ? roomCategories : ['single'],
      rateOptions,
      bedType: room.bed_type || '',
      customAmenities: (room.amenities || []).filter((name) => !amenityItems.some((item) => item.name === name)).join(', '),
      selectedAmenityIds: amenityItems.map((item) => item.id).filter(Boolean),
      image1: room.hero_image_url || gallery[0]?.url || '',
      image2: gallery[1]?.url || '',
      image3: gallery[2]?.url || '',
      showOnHomepage: Boolean(room.show_on_homepage),
      active: Boolean(room.active ?? true),
      inventoryDays: room.inventory_days || 180,
    })
    setShowRoomForm(true)
    setActivePage('rooms')
  }

  async function saveRoom(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    const selectedAmenities = amenityList.filter((amenity) => roomForm.selectedAmenityIds.includes(amenity.id))
    const customAmenities = splitList(roomForm.customAmenities).map((name) => ({ name, price: 0 }))
    const amenityItems = [
      ...selectedAmenities.map((amenity) => ({ id: amenity.id, name: amenity.name, description: amenity.description || '', price: Number(amenity.price || 0), icon: amenity.icon || 'sparkles' })),
      ...customAmenities,
    ]
    const images = [roomForm.image1, roomForm.image2, roomForm.image3].filter(Boolean)
    const rateOptions = buildRateOptionsPayload(roomForm)
    const primaryRate = rateOptions.double || rateOptions.single
    try {
      const payload = {
        name: roomForm.name,
        description: roomForm.description,
        occupancyAdults: Math.max(...Object.values(rateOptions).map((option) => Number(option.occupancyAdults || 1))),
        occupancyChildren: Math.max(...Object.values(rateOptions).map((option) => Number(option.occupancyChildren || 0))),
        basePrice: Number(primaryRate.basePrice),
        offerPrice: primaryRate.offerPrice === undefined ? undefined : Number(primaryRate.offerPrice),
        rateOptions,
        sizeSqft: primaryRate.sizeSqft ? Number(primaryRate.sizeSqft) : undefined,
        bedType: roomForm.bedType || undefined,
        amenities: amenityItems.map((item) => item.name),
        amenityItems,
        heroImageUrl: images[0] || '',
        gallery: images.map((url, index) => ({ url, alt: `${roomForm.name} image ${index + 1}` })),
        showOnHomepage: Boolean(roomForm.showOnHomepage),
        active: Boolean(roomForm.active),
        physicalRooms: Math.max(...Object.values(rateOptions).map((option) => Number(option.physicalRooms || 1))),
        inventoryDays: Number(roomForm.inventoryDays),
      }
      if (roomForm.id) await apiFetch(`/admin/rooms/${roomForm.id}`, { method: 'PATCH', body: payload })
      else await apiFetch('/admin/rooms', { method: 'POST', body: payload })
      setRoomForm(emptyRoom)
      setShowRoomForm(false)
      refresh(roomForm.id ? 'Room details updated.' : 'Room category, gallery, amenities and inventory created.', 'success', ['dashboard', 'rooms', 'inventory', 'rates'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function uploadRoomImage(file, field) {
    if (!file) return
    setSaving(true)
    setNotice(null)
    try {
      const image = await uploadImageToCloudinary(file, { signatureUrl: '/media/signature', folder: 'room-images' })
      setRoomForm((current) => ({ ...current, [field]: image.secureUrl }))
      setNotice({ type: 'success', message: 'Room image uploaded.' })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function deleteRoom(room) {
    if (!window.confirm(`Permanently delete ${room.name}? Existing bookings keep a saved room snapshot, but the live room, images, inventory, and rate data will be removed.`)) return
    setSaving(true)
    try {
      await apiFetch(`/admin/rooms/${room.id}`, { method: 'DELETE' })
      refresh('Room deleted with its inventory, rate data, and room media cleaned up.', 'success', ['dashboard', 'rooms', 'inventory', 'rates', 'bookings'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function toggleHomepageRoom(room) {
    setSaving(true)
    try {
      await apiFetch(`/admin/rooms/${room.id}/homepage`, { method: 'PATCH', body: { showOnHomepage: !room.show_on_homepage } })
      refresh(room.show_on_homepage ? 'Room removed from homepage.' : 'Room featured on homepage.', 'success', ['rooms'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function saveInventoryBlock(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      if (!inventoryForm.roomTypeId) throw new Error('Select a room category first.')
      const payload = {
        startDate: inventoryForm.startDate,
        endDate: inventoryForm.endDate,
        offlineRooms: Number(inventoryForm.offlineRooms || 0),
        closed: Boolean(inventoryForm.closed),
        note: inventoryForm.note || undefined,
      }
      if (inventoryEditTarget) {
        await apiFetch(`/admin/rooms/${inventoryEditTarget.room_type_id}/inventory-blocks`, {
          method: 'DELETE',
          body: { startDate: toDateInput(inventoryEditTarget.start_date), endDate: toDateInput(inventoryEditTarget.end_date) },
        })
      }
      const result = await apiFetch(`/admin/rooms/${inventoryForm.roomTypeId}/inventory-blocks`, { method: 'PATCH', body: payload })
      setInventoryEditTarget(null)
      setRemovedInventoryEntryIds(new Set())
      setShowInventoryBulk(false)
      refresh(inventoryEditTarget ? `Inventory entry replaced for ${result.updatedDays} day${result.updatedDays === 1 ? '' : 's'}.` : `Inventory updated for ${result.updatedDays} day${result.updatedDays === 1 ? '' : 's'}.`, 'success', ['dashboard', 'rooms', 'inventory'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function saveRatePlan(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      if (!rateForm.roomTypeId) throw new Error('Select a room category first.')
      const payload = {
        startDate: rateForm.startDate,
        endDate: rateForm.endDate,
        rateCategory: rateForm.rateCategory,
        price: Number(rateForm.price || 0),
        minNights: 1,
      }
      if (rateEditTarget) {
        await apiFetch(`/admin/rooms/${rateEditTarget.room_type_id}/rates`, {
          method: 'DELETE',
          body: { startDate: toDateInput(rateEditTarget.start_date), endDate: toDateInput(rateEditTarget.end_date), rateCategory: rateEditTarget.rate_category || 'all' },
        })
      }
      const result = await apiFetch(`/admin/rooms/${rateForm.roomTypeId}/rates`, { method: 'PATCH', body: payload })
      setRateEditTarget(null)
      setRemovedRateEntryIds(new Set())
      setShowRateBulk(false)
      refresh(rateEditTarget ? `Rate entry replaced for ${result.updatedDays} day${result.updatedDays === 1 ? '' : 's'}.` : `Rate calendar updated for ${result.updatedDays} day${result.updatedDays === 1 ? '' : 's'}.`, 'success', ['dashboard', 'rooms', 'rates'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  function editInventoryEntry(entry) {
    setInventoryEditTarget(entry)
    setInventoryForm({
      roomTypeId: entry.room_type_id,
      startDate: toDateInput(entry.start_date),
      endDate: toDateInput(entry.end_date),
      offlineRooms: Number(entry.offline_rooms || 0),
      closed: Boolean(entry.closed),
      note: '',
    })
    setActivePage('inventory')
    setShowInventoryBulk(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteInventoryEntry(entry) {
    if (!window.confirm(`Remove inventory rule for ${entry.room_name} from ${formatDate(entry.start_date)} to ${formatDate(entry.end_date)}?`)) return
    setSaving(true)
    setNotice(null)
    try {
      const result = await apiFetch(`/admin/rooms/${entry.room_type_id}/inventory-blocks`, {
        method: 'DELETE',
        body: { startDate: toDateInput(entry.start_date), endDate: toDateInput(entry.end_date) },
      })
      setInventoryEditTarget(null)
      setRemovedInventoryEntryIds((current) => new Set([...current, entry.id]))
      refresh(result.remainingBlockedDays
        ? `Inventory reset ran, but ${result.remainingBlockedDays} day${result.remainingBlockedDays === 1 ? '' : 's'} still show sold out. Check room capacity and reservations.`
        : `Inventory entry removed for ${result.updatedDays} day${result.updatedDays === 1 ? '' : 's'}.`,
      result.remainingBlockedDays ? 'error' : 'success', ['dashboard', 'rooms', 'inventory'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  function editRateEntry(entry) {
    setRateEditTarget(entry)
    setRateForm({
      roomTypeId: entry.room_type_id,
      startDate: toDateInput(entry.start_date),
      endDate: toDateInput(entry.end_date),
      rateCategory: entry.rate_category || 'all',
      price: Number(entry.price || 0),
    })
    setActivePage('rates')
    setShowRateBulk(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteRateEntry(entry) {
    if (!window.confirm(`Remove ${rateCategoryLabel(entry.rate_category).toLowerCase()} rate for ${entry.room_name} from ${formatDate(entry.start_date)} to ${formatDate(entry.end_date)}?`)) return
    setSaving(true)
    setNotice(null)
    try {
      const result = await apiFetch(`/admin/rooms/${entry.room_type_id}/rates`, {
        method: 'DELETE',
        body: { startDate: toDateInput(entry.start_date), endDate: toDateInput(entry.end_date), rateCategory: entry.rate_category || 'all' },
      })
      setRateEditTarget(null)
      setRemovedRateEntryIds((current) => new Set([...current, entry.id]))
      refresh(result.remainingOverrideDays
        ? `Rate reset ran, but ${result.remainingOverrideDays} override day${result.remainingOverrideDays === 1 ? '' : 's'} still remain.`
        : `Rate entry removed for ${result.updatedDays} day${result.updatedDays === 1 ? '' : 's'}.`,
      result.remainingOverrideDays ? 'error' : 'success', ['dashboard', 'rooms', 'rates'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  function openInventoryDayEditor(day) {
    const capacity = Number(inventorySummary.data?.room?.capacity || 0)
    setInventoryDayEditor({
      roomTypeId: inventorySummaryRoomId,
      roomName: inventorySummary.data?.room?.name || '',
      date: toDateInput(day.stay_date),
      capacity,
      reservedRooms: Number(day.reserved_rooms || 0),
      soldOutRooms: day.closed ? capacity : Number(day.offline_rooms || 0),
      sellableOnline: Number(day.sellable_online || 0),
    })
  }

  async function saveInventoryDay(event) {
    event.preventDefault()
    if (!inventoryDayEditor?.roomTypeId) return
    setSaving(true)
    setNotice(null)
    try {
      const soldOutRooms = Math.max(0, Math.min(Number(inventoryDayEditor.soldOutRooms || 0), Number(inventoryDayEditor.capacity || 0)))
      await apiFetch(`/admin/rooms/${inventoryDayEditor.roomTypeId}/inventory-blocks`, {
        method: 'PATCH',
        body: {
          startDate: inventoryDayEditor.date,
          endDate: inventoryDayEditor.date,
          offlineRooms: soldOutRooms,
          closed: soldOutRooms >= Number(inventoryDayEditor.capacity || 0),
        },
      })
      setInventoryDayEditor(null)
      setRemovedInventoryEntryIds(new Set())
      refresh('Inventory calendar updated.', 'success', ['dashboard', 'rooms', 'inventory'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function deleteInventoryDay() {
    if (!inventoryDayEditor?.roomTypeId) return
    setSaving(true)
    setNotice(null)
    try {
      const result = await apiFetch(`/admin/rooms/${inventoryDayEditor.roomTypeId}/inventory-blocks`, {
        method: 'DELETE',
        body: { startDate: inventoryDayEditor.date, endDate: inventoryDayEditor.date },
      })
      setInventoryDayEditor(null)
      refresh(result.remainingBlockedDays ? 'Inventory reset ran, but this date still shows sold out.' : 'Inventory date cleared.', result.remainingBlockedDays ? 'error' : 'success', ['dashboard', 'rooms', 'inventory'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  function openRateDayEditor(day, rateCategory = 'all') {
    setRateDayEditor({
      roomTypeId: rateSummaryRoomId,
      roomName: rateSummary.data?.room?.name || '',
      date: toDateInput(day.stay_date),
      rateCategory,
      singlePrice: day.single_override_price ?? rateSummary.data?.room?.baseRates?.single ?? '',
      doublePrice: day.double_override_price ?? rateSummary.data?.room?.baseRates?.double ?? '',
      baseSingle: rateSummary.data?.room?.baseRates?.single ?? null,
      baseDouble: rateSummary.data?.room?.baseRates?.double ?? null,
    })
  }

  async function saveRateDay(event) {
    event.preventDefault()
    if (!rateDayEditor?.roomTypeId) return
    setSaving(true)
    setNotice(null)
    try {
      const requests = []
      if (rateDayEditor.rateCategory !== 'double' && rateDayEditor.singlePrice !== '') {
        requests.push(apiFetch(`/admin/rooms/${rateDayEditor.roomTypeId}/rates`, {
          method: 'PATCH',
          body: { startDate: rateDayEditor.date, endDate: rateDayEditor.date, rateCategory: 'single', price: Number(rateDayEditor.singlePrice || 0), minNights: 1 },
        }))
      }
      if (rateDayEditor.rateCategory !== 'single' && rateDayEditor.doublePrice !== '') {
        requests.push(apiFetch(`/admin/rooms/${rateDayEditor.roomTypeId}/rates`, {
          method: 'PATCH',
          body: { startDate: rateDayEditor.date, endDate: rateDayEditor.date, rateCategory: 'double', price: Number(rateDayEditor.doublePrice || 0), minNights: 1 },
        }))
      }
      await Promise.all(requests)
      setRateDayEditor(null)
      setRemovedRateEntryIds(new Set())
      refresh('Rate calendar updated.', 'success', ['dashboard', 'rooms', 'rates'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function deleteRateDay() {
    if (!rateDayEditor?.roomTypeId) return
    setSaving(true)
    setNotice(null)
    try {
      const result = await apiFetch(`/admin/rooms/${rateDayEditor.roomTypeId}/rates`, {
        method: 'DELETE',
        body: { startDate: rateDayEditor.date, endDate: rateDayEditor.date, rateCategory: rateDayEditor.rateCategory || 'all' },
      })
      setRateDayEditor(null)
      refresh(result.remainingOverrideDays ? 'Rate reset ran, but this date still has an override.' : 'Rate date cleared.', result.remainingOverrideDays ? 'error' : 'success', ['dashboard', 'rooms', 'rates'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function saveAmenity(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const body = { ...amenityForm, price: Number(amenityForm.price || 0), active: Boolean(amenityForm.active) }
      if (amenityForm.id) await apiFetch(`/admin/amenities/${amenityForm.id}`, { method: 'PATCH', body })
      else await apiFetch('/admin/amenities', { method: 'POST', body })
      setAmenityForm(emptyAmenity)
      setShowAmenityForm(false)
      refresh('Amenity catalog saved.', 'success', ['amenities', 'rooms'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function deleteAmenity(amenity) {
    if (!window.confirm(`Delete amenity ${amenity.name}?`)) return
    setSaving(true)
    try {
      await apiFetch(`/admin/amenities/${amenity.id}`, { method: 'DELETE' })
      refresh('Amenity deleted.', 'success', ['amenities', 'rooms'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function saveFaq(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const body = {
        question: faqForm.question,
        answer: faqForm.answer,
        sortOrder: Number(faqForm.sortOrder || 0),
        active: Boolean(faqForm.active),
      }
      if (faqForm.id) await apiFetch(`/admin/faqs/${faqForm.id}`, { method: 'PATCH', body })
      else await apiFetch('/admin/faqs', { method: 'POST', body })
      setFaqForm(emptyFaq)
      setShowFaqForm(false)
      refresh('FAQ saved and synced to the hotel website.', 'success', ['faqs'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function deleteFaq(faq) {
    if (!window.confirm(`Delete FAQ "${faq.question}"?`)) return
    setSaving(true)
    try {
      await apiFetch(`/admin/faqs/${faq.id}`, { method: 'DELETE' })
      refresh('FAQ deleted.', 'success', ['faqs'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function saveOffer(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const body = {
        ...offerForm,
        discountValue: Number(offerForm.discountValue || 0),
        minCompletedBookings: offerForm.audienceType === 'repeat_guest' ? Number(offerForm.minCompletedBookings || 1) : 0,
        roomTypeIds: Array.isArray(offerForm.roomTypeIds) ? offerForm.roomTypeIds.filter(Boolean) : [],
        imageUrl: offerForm.imageUrl || '',
        code: offerForm.code || undefined,
      }
      if (offerForm.id) await apiFetch(`/admin/offers/${offerForm.id}`, { method: 'PATCH', body })
      else await apiFetch('/admin/offers', { method: 'POST', body })
      setOfferForm(emptyOffer)
      setShowOfferForm(false)
      refresh('Offer saved and synced to guest pages.', 'success', ['dashboard', 'offers'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function deleteOffer(offer) {
    if (!window.confirm(`Delete offer ${offer.title}?`)) return
    setSaving(true)
    try {
      await apiFetch(`/admin/offers/${offer.id}`, { method: 'DELETE' })
      refresh('Offer deleted.', 'success', ['dashboard', 'offers'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  function openBookingEditor(booking) {
    setBookingForm({
      ...booking,
      guestName: booking.guest_name || '',
      guestEmail: booking.guest_email || '',
      guestPhone: booking.guest_phone || '',
      adults: booking.adults || 1,
      children: booking.children || 0,
      internalNote: booking.metadata?.internalNote || '',
    })
  }

  async function updateBooking(event) {
    event.preventDefault()
    if (!bookingForm?.id) return
    setSaving(true)
    try {
      await apiFetch(`/admin/bookings/${bookingForm.id}`, {
        method: 'PATCH',
        body: {
          guestName: bookingForm.guestName,
          guestEmail: bookingForm.guestEmail,
          guestPhone: bookingForm.guestPhone,
          adults: Number(bookingForm.adults),
          children: Number(bookingForm.children),
          internalNote: bookingForm.internalNote,
        },
      })
      setBookingForm(null)
      refresh('Booking details updated.', 'success', ['dashboard', 'bookings'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function createManualBooking(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/admin/bookings', {
        method: 'POST',
        body: {
          ...manualBooking,
          roomsCount: Number(manualBooking.roomsCount),
          adults: Number(manualBooking.adults),
          children: Number(manualBooking.children),
          totalAmount: manualBooking.totalAmount ? Number(manualBooking.totalAmount) : undefined,
        },
      })
      setManualBooking(emptyManualBooking)
      setActivePage('bookings')
      refresh('Manual booking created.', 'success', ['dashboard', 'bookings', 'rooms', 'inventory'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function deleteBooking(booking) {
    if (!window.confirm(`Delete booking ${booking.booking_reference}? Inventory will be released, but refunds are not automatic.`)) return
    setSaving(true)
    try {
      await apiFetch(`/admin/bookings/${booking.id}`, { method: 'DELETE' })
      setBookingForm(null)
      refresh('Booking deleted and inventory released.', 'success', ['dashboard', 'bookings', 'rooms', 'inventory'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function reviewCancellationRequest(request, status, payload = {}) {
    setSaving(true)
    try {
      await apiFetch(`/admin/cancellation-requests/${request.id}`, {
        method: 'PATCH',
        body: {
          status,
          refundAmount: payload.refundAmount ? Number(payload.refundAmount) : 0,
          adminMessage: payload.adminMessage || '',
        },
      })
      refresh(status === 'approved' ? 'Cancellation approved and marked for manual refund.' : 'Cancellation request rejected.', 'success', ['dashboard', 'bookings', 'cancellations', 'rooms', 'inventory'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function openUserProfile(user) {
    setActiveUser({ loading: true, user, bookings: [] })
    try {
      const payload = await apiFetch(`/admin/users/${user.id}`)
      setActiveUser({ loading: false, ...payload })
    } catch (error) {
      setActiveUser({ loading: false, error: error.message, user, bookings: [] })
    }
  }

  async function deleteCustomer(user) {
    if (!window.confirm(`Delete ${user.full_name || user.email} from Firebase Auth and this platform?`)) return
    setSaving(true)
    try {
      await apiFetch(`/admin/users/${user.id}`, { method: 'DELETE' })
      setActiveUser(null)
      refresh('Customer deleted from Firebase Auth and hotel records.', 'success', ['dashboard', 'users'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  const metrics = dashboard.data?.metrics || {}
  const hotel = dashboard.data?.hotel || {}
  const loyaltyRedemptionMinPoints = Math.max(0, Number(hotel.policies?.loyaltyRedemptionMinPoints || DEFAULT_LOYALTY_REDEMPTION_MIN_POINTS))
  const hotelName = hotel.branding?.logoText || hotel.name || 'Hotel workspace'
  const hotelLogo = hotel.branding?.logoUrl || ''
  const hotelLocation = [hotel.address?.city, hotel.address?.state].filter(Boolean).join(', ')

  useEffect(() => {
    setSettingsForm({ loyaltyRedemptionMinPoints })
  }, [loyaltyRedemptionMinPoints])

  useEffect(() => {
    if (!firstRoomId) return
    setInventorySummaryRoomId((value) => value || firstRoomId)
    setRateSummaryRoomId((value) => value || firstRoomId)
  }, [firstRoomId])

  async function saveSettings(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/admin/hotel-settings', {
        method: 'PATCH',
        body: { loyaltyRedemptionMinPoints: Number(settingsForm.loyaltyRedemptionMinPoints || 0) },
      })
      refresh('Loyalty redemption settings updated.', 'success', ['dashboard', 'settings'])
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  if (dashboard.loading) return <LoadingState label="Loading hotel operations" />

  const navCounts = {
    summary: 'Live',
    rooms: roomList.length,
    inventory: 'Dates',
    rates: 'Rates',
    'create-booking': 'New',
    bookings: bookingList.length,
    users: userList.length,
    feedback: feedbackList.length,
    amenities: amenityList.length,
    faqs: faqList.length,
    offers: offerList.length,
    settings: 'Rules',
  }

  function changePage(page) {
    setActivePage(page)
  }

  return (
    <main className="admin-console min-h-screen bg-[linear-gradient(135deg,#fff7ed_0%,#f8fafc_34%,#eef2ff_68%,#fff1f2_100%)]">
      <div className="mx-auto grid w-full max-w-[1720px] gap-3 px-3 py-3 sm:gap-5 sm:px-5 sm:py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <MobileConsoleHeader
          hotelName={hotelName}
          hotelLogo={hotelLogo}
          hotelLocation={hotelLocation}
          activePage={activePage}
          metrics={metrics}
          onPage={changePage}
        />

        <aside className="hidden lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-3rem)]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/70 bg-white/70 shadow-glass backdrop-blur-xl">
            <div className="border-b border-white/60 bg-white/40 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <BrandLogo name={hotelName} logoUrl={hotelLogo} />
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-black leading-tight text-charcoal sm:text-xl">{hotelName}</h1>
                  <p className="mt-1 truncate text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{hotelLocation || 'Admin workspace'}</p>
                </div>
              </div>
              <div className="mt-3 hidden rounded-md border border-white/70 bg-white/50 px-3 py-2 shadow-sm backdrop-blur sm:block">
                <p className="text-sm font-semibold leading-6 text-stone-600">Manage bookings, rooms, guests, amenities, and offers from one hotel console.</p>
              </div>
            </div>

            <nav className="flex gap-2 overflow-x-auto p-2 sm:p-3 lg:grid lg:overflow-y-auto lg:overflow-x-hidden">
              {tabs.map(({ key, Icon, label, text }) => (
                <button
                  key={key}
                  className={`group flex min-h-[70px] min-w-[106px] flex-col items-center justify-center gap-1 rounded-md px-2 text-center transition lg:min-h-[52px] lg:w-full lg:min-w-0 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-left ${activePage === key ? 'bg-[linear-gradient(135deg,#7f1d1d,#222222)] text-white shadow-card' : 'text-stone-600 hover:bg-white/70 hover:text-charcoal hover:shadow-sm'}`}
                  type="button"
                  onClick={() => changePage(key)}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md lg:h-9 lg:w-9 ${activePage === key ? 'bg-white/20 text-white' : 'bg-white/75 text-amberline shadow-sm group-hover:bg-white'}`}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 lg:flex-1">
                    <span className="block text-xs font-extrabold leading-tight sm:text-sm">{label}</span>
                    <span className={`hidden truncate text-xs font-semibold lg:block ${activePage === key ? 'text-white/70' : 'text-stone-400'}`}>{text}</span>
                  </span>
                  <span className={`hidden rounded-md px-2 py-1 text-xs font-black sm:inline-flex ${activePage === key ? 'bg-white/15 text-white' : 'bg-ivory text-stone-500'}`}>{navCounts[key]}</span>
                </button>
              ))}
            </nav>

            <div className="grid grid-cols-2 gap-2 border-t border-white/55 p-2 sm:p-3 lg:mt-auto lg:grid-cols-1">
              <Link to={buildTenantPath('/', resolveTenantFromLocation())} className="btn-secondary !min-h-10 border-white/70 bg-white/75 !px-3 backdrop-blur"><Home size={16} /> View hotel site</Link>
              <button className="btn-secondary !min-h-10 border-white/70 bg-white/75 !px-3 text-red-700 backdrop-blur" type="button" onClick={logout}><LogOut size={16} /> Logout</button>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="mb-3 hidden rounded-lg border border-white/70 bg-white/70 p-3 shadow-glass backdrop-blur-xl sm:mb-5 sm:p-5 lg:block">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="eyebrow">{activePageLabel(activePage)}</p>
                <h2 className="mt-2 text-2xl font-extrabold leading-tight text-charcoal sm:text-3xl md:text-4xl">{activePageTitle(activePage)}</h2>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
                <MiniStat label="Upcoming" value={metrics.upcoming_bookings || 0} />
                <MiniStat label="Revenue" value={`Rs ${Number(metrics.revenue || 0).toLocaleString('en-IN')}`} />
                <MiniStat label="Guests" value={metrics.guests || 0} />
              </div>
            </div>
          </header>

          {dashboard.error ? <Notice type="error" message={dashboard.error.message} /> : null}
          {notice ? <Notice type={notice.type} message={notice.message} /> : null}

          <div className="[&>section]:mt-0">
            {activePage === 'summary' ? <SummaryPanel dashboard={dashboard} bookings={bookingList} rooms={roomList} offers={offerList} users={userList} feedback={feedbackList} amenities={amenityList} faqs={faqList} onTab={changePage} /> : null}
            {activePage === 'rooms' ? (
              <RoomsPanel
                rooms={roomList}
                amenities={amenityList}
                filters={filters}
                setFilters={setFilters}
                roomForm={roomForm}
                setRoomForm={setRoomForm}
                showRoomForm={showRoomForm}
                setShowRoomForm={setShowRoomForm}
                saving={saving}
                onSave={saveRoom}
                onUpload={uploadRoomImage}
                onEdit={startRoomEdit}
                onDelete={deleteRoom}
                onToggleHomepage={toggleHomepageRoom}
              />
            ) : null}
            {activePage === 'inventory' ? (
              <InventoryPanel
                rooms={roomList}
                entries={inventoryEntries}
                loading={inventoryBlocks.loading}
                form={inventoryForm}
                setForm={setInventoryForm}
                editingEntry={inventoryEditTarget}
                onCancelEdit={() => {
                  setInventoryEditTarget(null)
                  setInventoryForm(emptyInventoryForm)
                }}
                summary={inventorySummary.data}
                summaryLoading={inventorySummary.loading}
                summaryRoomId={inventorySummaryRoomId}
                setSummaryRoomId={setInventorySummaryRoomId}
                saving={saving}
                onSave={saveInventoryBlock}
                onView={(entry) => setEntryDetails({ type: 'inventory', ...entry })}
                onEdit={editInventoryEntry}
                onDelete={deleteInventoryEntry}
                showBulk={showInventoryBulk}
                setShowBulk={setShowInventoryBulk}
                showEntries={showInventoryEntries}
                setShowEntries={setShowInventoryEntries}
                onOpenDay={openInventoryDayEditor}
              />
            ) : null}
            {activePage === 'rates' ? (
              <RateCalendarPanel
                rooms={roomList}
                entries={rateEntries}
                loading={ratePlans.loading}
                form={rateForm}
                setForm={setRateForm}
                editingEntry={rateEditTarget}
                onCancelEdit={() => {
                  setRateEditTarget(null)
                  setRateForm(emptyRateForm)
                }}
                summary={rateSummary.data}
                summaryLoading={rateSummary.loading}
                summaryRoomId={rateSummaryRoomId}
                setSummaryRoomId={setRateSummaryRoomId}
                saving={saving}
                onSave={saveRatePlan}
                onView={(entry) => setEntryDetails({ type: 'rate', ...entry })}
                onEdit={editRateEntry}
                onDelete={deleteRateEntry}
                showBulk={showRateBulk}
                setShowBulk={setShowRateBulk}
                showEntries={showRateEntries}
                setShowEntries={setShowRateEntries}
                onOpenDay={openRateDayEditor}
              />
            ) : null}
            {activePage === 'create-booking' ? (
              <CreateBookingPanel rooms={roomList} manualBooking={manualBooking} setManualBooking={setManualBooking} saving={saving} onCreateManual={createManualBooking} />
            ) : null}
            {activePage === 'bookings' ? (
              <BookingsPanel
                bookings={bookingList}
                rooms={roomList}
                filters={filters}
                setFilters={setFilters}
                saving={saving}
                onEdit={openBookingEditor}
                onDelete={deleteBooking}
                onCreateClick={() => changePage('create-booking')}
              />
            ) : null}
            {activePage === 'cancellations' ? (
              <CancellationRequestsPanel
                requests={cancellationList}
                filters={filters}
                setFilters={setFilters}
                saving={saving}
                onReview={reviewCancellationRequest}
              />
            ) : null}
            {activePage === 'users' ? <UsersPanel users={userList} filters={filters} setFilters={setFilters} saving={saving} onOpen={openUserProfile} onDelete={deleteCustomer} /> : null}
            {activePage === 'feedback' ? <FeedbackPanel feedback={feedbackList} filters={filters} setFilters={setFilters} /> : null}
            {activePage === 'amenities' ? <AmenitiesPanel amenities={amenityList} form={amenityForm} setForm={setAmenityForm} showForm={showAmenityForm} setShowForm={setShowAmenityForm} filters={filters} setFilters={setFilters} saving={saving} onSave={saveAmenity} onDelete={deleteAmenity} /> : null}
            {activePage === 'faqs' ? <FaqPanel faqs={faqList} form={faqForm} setForm={setFaqForm} showForm={showFaqForm} setShowForm={setShowFaqForm} filters={filters} setFilters={setFilters} saving={saving} onSave={saveFaq} onDelete={deleteFaq} /> : null}
            {activePage === 'offers' ? <OffersPanel offers={offerList} rooms={roomList} form={offerForm} setForm={setOfferForm} showForm={showOfferForm} setShowForm={setShowOfferForm} filters={filters} setFilters={setFilters} saving={saving} onSave={saveOffer} onDelete={deleteOffer} /> : null}
            {activePage === 'settings' ? <SettingsPanel form={settingsForm} setForm={setSettingsForm} saving={saving} onSave={saveSettings} /> : null}
          </div>
        </section>
      </div>

      {bookingForm ? <BookingEditor form={bookingForm} setForm={setBookingForm} saving={saving} onSubmit={updateBooking} onDelete={deleteBooking} onClose={() => setBookingForm(null)} /> : null}
      {entryDetails ? <EntryDetailsModal entry={entryDetails} onClose={() => setEntryDetails(null)} /> : null}
      {inventoryDayEditor ? <InventoryDayEditor form={inventoryDayEditor} setForm={setInventoryDayEditor} saving={saving} onSave={saveInventoryDay} onDelete={deleteInventoryDay} onClose={() => setInventoryDayEditor(null)} /> : null}
      {rateDayEditor ? <RateDayEditor form={rateDayEditor} setForm={setRateDayEditor} saving={saving} onSave={saveRateDay} onDelete={deleteRateDay} onClose={() => setRateDayEditor(null)} /> : null}
      {activeUser ? <UserProfileModal profile={activeUser} saving={saving} onDelete={deleteCustomer} onClose={() => setActiveUser(null)} /> : null}
    </main>
  )
}

function MobileConsoleHeader({ hotelName, hotelLogo, hotelLocation, activePage, metrics, onPage }) {
  return (
    <section className="sticky top-0 z-30 -mx-3 border-b border-white/65 bg-white/82 px-3 pb-3 pt-3 shadow-soft backdrop-blur-xl sm:-mx-5 sm:px-5 lg:hidden">
      <div className="flex items-center gap-3">
        <BrandLogo name={hotelName} logoUrl={hotelLogo} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-black leading-tight text-charcoal">{hotelName}</h1>
          <p className="mt-1 truncate text-[0.64rem] font-black uppercase tracking-[0.12em] text-stone-500">{hotelLocation || 'Admin workspace'}</p>
        </div>
        <button className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/70 bg-white/75 text-red-700 shadow-sm backdrop-blur" type="button" onClick={logout} aria-label="Logout">
          <LogOut size={17} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <label className="relative min-w-0">
          <span className="sr-only">Admin page</span>
          <select className="input h-11 pr-9 text-sm font-extrabold" value={activePage} onChange={(event) => onPage(event.target.value)}>
            {tabs.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
          </select>
        </label>
        <Link to={buildTenantPath('/', resolveTenantFromLocation())} className="btn-secondary !min-h-11 !px-3 text-xs"><Home size={15} /> Site</Link>
      </div>

      <div className="mt-3 rounded-md border border-white/70 bg-[linear-gradient(135deg,rgba(127,29,29,0.10),rgba(245,158,11,0.12),rgba(255,255,255,0.55))] p-3 shadow-sm">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-amberline">{activePageLabel(activePage)}</p>
        <h2 className="mt-1 text-xl font-black leading-tight text-charcoal">{activePageTitle(activePage)}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Arrivals" value={metrics.upcoming_bookings || 0} />
          <MiniStat label="Revenue" value={`Rs ${compactMoney(metrics.revenue || 0)}`} />
          <MiniStat label="Guests" value={metrics.guests || 0} />
        </div>
      </div>
    </section>
  )
}

function SummaryPanel({ dashboard, bookings, rooms, offers, users, feedback, amenities, faqs, onTab }) {
  const metrics = dashboard.data?.metrics || {}
  const arrivals = dashboard.data?.arrivals || []
  const activeRooms = rooms.filter((room) => room.active).length
  const featuredRooms = rooms.filter((room) => room.show_on_homepage).length
  const activeAmenities = amenities.filter((amenity) => amenity.active).length
  const activeFaqs = faqs.filter((faq) => faq.active).length
  const liveOffers = offers.filter((offer) => offer.active).length
  const pendingBookings = bookings.filter((booking) => booking.status === 'payment_pending').length
  const averageRating = Number(metrics.average_rating || 0)
  return (
    <section className="grid gap-3 sm:gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <Metric icon={CalendarDays} label="Upcoming arrivals" value={metrics.upcoming_bookings || 0} detail={`${metrics.confirmed_bookings || 0} confirmed bookings`} />
        <Metric icon={IndianRupee} label="Revenue" value={`Rs ${Number(metrics.revenue || 0).toLocaleString('en-IN')}`} detail="Confirmed and completed bookings" />
        <Metric icon={BedDouble} label="Room types" value={metrics.rooms || rooms.length} detail={`${activeRooms} active, ${featuredRooms}/3 featured`} />
        <Metric icon={UsersRound} label="Guest users" value={metrics.guests || users.length} detail={`${users.length} profiles in this hotel`} />
        <Metric icon={MessageSquare} label="Feedback" value={metrics.feedback_count || feedback.length} detail={averageRating ? `${averageRating.toFixed(1)} average rating` : 'Guest feedback inbox'} />
      </div>

      <div className="grid gap-3 sm:gap-6 xl:grid-cols-[1fr_360px]">
        <div className="panel overflow-hidden">
          <PanelHeader icon={CalendarDays} title="Upcoming arrivals" action={<button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => onTab('bookings')}>Manage bookings</button>} />
          {arrivals.length ? (
            <div className="grid divide-y divide-mist">
              {arrivals.map((booking) => (
                <div key={booking.booking_reference} className="grid gap-3 p-4 md:grid-cols-[1fr_170px_120px_130px] md:items-center">
                  <div>
                    <p className="font-bold">{booking.guest_name}</p>
                    <p className="text-sm text-stone-500">{booking.booking_reference}</p>
                  </div>
                  <p className="text-sm font-semibold text-stone-600">{formatDate(booking.check_in)} to {formatDate(booking.check_out)}</p>
                  <StatusPill status={booking.status} />
                  <p className="font-extrabold">Rs {Number(booking.total_amount || 0).toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No upcoming arrivals" text="Confirmed arrivals will appear here." />}
        </div>

        <div className="grid gap-3 sm:gap-6">
          <div className="panel p-5">
            <PanelMiniTitle icon={Hotel} title="Hotel health" />
            <div className="mt-4 grid gap-3">
              <StatRow label="Active room types" value={`${activeRooms}/${rooms.length || 0}`} />
              <StatRow label="Homepage room banners" value={`${featuredRooms}/3`} />
              <StatRow label="Active amenities" value={`${activeAmenities}/${amenities.length || 0}`} />
              <StatRow label="Published FAQs" value={`${activeFaqs}/${faqs.length || 0}`} />
              <StatRow label="Live offers" value={liveOffers} />
              <StatRow label="Feedback received" value={feedback.length} />
              <StatRow label="Pending payments" value={pendingBookings} />
            </div>
          </div>
          <div className="panel p-5">
            <PanelMiniTitle icon={BadgePercent} title="Offer summary" />
            <div className="mt-4 grid gap-3">
              <StatRow label="General offers" value={offers.filter((offer) => offer.audience_type === 'general').length} />
              <StatRow label="Repeat guest offers" value={offers.filter((offer) => offer.audience_type === 'repeat_guest').length} />
              <StatRow label="Rooms with offer price" value={rooms.filter((room) => room.offer_price).length} />
            </div>
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <PanelHeader icon={LayoutDashboard} title="Operational summary" action={<button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => onTab('create-booking')}>Create booking</button>} />
        <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5 md:grid-cols-3">
          <SummaryCard title="Rooms" value={`${activeRooms} active`} text={`${rooms.length} categories, ${featuredRooms} featured on homepage.`} />
          <SummaryCard title="Bookings" value={`${bookings.length} total`} text={`${metrics.completed_bookings || 0} completed and ${metrics.pending_bookings || 0} payment pending.`} />
          <SummaryCard title="Guests" value={`${users.length} profiles`} text="Open user profiles to review booking history and loyalty points." />
          <SummaryCard title="Feedback" value={`${feedback.length} notes`} text="Guest messages are saved against this hotel only." />
          <SummaryCard title="Amenities" value={`${activeAmenities} active`} text="Use logo URLs to make amenities easier to scan." />
          <SummaryCard title="FAQ" value={`${activeFaqs} published`} text="Guest questions are shown on this hotel's FAQ page." />
          <SummaryCard title="Offers" value={`${liveOffers} active`} text="General and repeat-guest offers are validated during checkout." />
        </div>
      </div>
    </section>
  )
}

function SummaryCard({ title, value, text }) {
  return (
    <article className="rounded-md border border-white/60 bg-white/55 p-3 shadow-sm backdrop-blur sm:p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-stone-500">{title}</p>
      <p className="mt-2 text-xl font-extrabold text-charcoal">{value}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{text}</p>
    </article>
  )
}

function RoomsPanel({ rooms, amenities, filters, setFilters, roomForm, setRoomForm, showRoomForm, setShowRoomForm, saving, onSave, onUpload, onEdit, onDelete, onToggleHomepage }) {
  const filteredRooms = filterByText(rooms, filters.rooms, ['name', 'description', 'bed_type', 'slug', 'amenities', 'amenity_items'])
  const activeAmenities = amenities.filter((amenity) => amenity.active)
  if (showRoomForm) {
    return (
      <section className="grid gap-6">
        <div className="panel p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <PanelMiniTitle icon={BedDouble} title={roomForm.id ? 'Edit room category' : 'Add room category'} />
            <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => {
              setRoomForm(emptyRoom)
              setShowRoomForm(false)
            }}>Back to rooms</button>
          </div>
          <form onSubmit={onSave} className="mt-5 grid gap-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Room name with room type"><input className="input" value={roomForm.name} onChange={(event) => setRoomForm({ ...roomForm, name: event.target.value })} placeholder="Deluxe room, Executive suite" required /></Field>
              <Field label="Bed type"><input className="input" value={roomForm.bedType} onChange={(event) => setRoomForm({ ...roomForm, bedType: event.target.value })} /></Field>
            </div>
            <Field label="Description"><textarea className="input min-h-28 py-3" value={roomForm.description} onChange={(event) => setRoomForm({ ...roomForm, description: event.target.value })} required /></Field>
            <div className="rounded-lg border border-mist bg-white p-3">
              <span className="label">Room category</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {['single', 'double'].map((category) => {
                  const selected = roomForm.roomCategories.includes(category)
                  return (
                    <label key={category} className={`flex min-h-12 items-center gap-3 rounded-md border px-3 text-sm font-black capitalize ${selected ? 'border-amberline bg-amber-50 text-charcoal' : 'border-mist bg-ivory text-stone-600'}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...new Set([...roomForm.roomCategories, category])]
                            : roomForm.roomCategories.filter((item) => item !== category)
                          setRoomForm({ ...roomForm, roomCategories: next.length ? next : [category] })
                        }}
                      />
                      {category} room
                    </label>
                  )
                })}
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {roomForm.roomCategories.includes('single') ? <RateOptionEditor category="single" roomForm={roomForm} setRoomForm={setRoomForm} /> : null}
                {roomForm.roomCategories.includes('double') ? <RateOptionEditor category="double" roomForm={roomForm} setRoomForm={setRoomForm} /> : null}
              </div>
            </div>
            <div>
              <span className="label">Amenity catalog</span>
              <div className="grid gap-2 rounded-md border border-mist bg-white p-3 md:grid-cols-2 xl:grid-cols-3">
                {activeAmenities.length ? activeAmenities.map((amenity) => (
                  <label key={amenity.id} className="flex min-h-12 items-center justify-between gap-3 rounded-md bg-ivory px-3 text-sm font-semibold">
                    <span className="flex min-w-0 items-center gap-2">
                      <input type="checkbox" checked={roomForm.selectedAmenityIds.includes(amenity.id)} onChange={(event) => {
                        setRoomForm({
                          ...roomForm,
                          selectedAmenityIds: event.target.checked
                            ? [...roomForm.selectedAmenityIds, amenity.id]
                            : roomForm.selectedAmenityIds.filter((id) => id !== amenity.id),
                        })
                      }} />
                      <AmenityLogo amenity={amenity} small />
                      <span className="truncate">{amenity.name}</span>
                    </span>
                    <span className="shrink-0 text-stone-500">Rs {Number(amenity.price || 0).toLocaleString('en-IN')}</span>
                  </label>
                )) : <p className="text-sm text-stone-500">Add amenities from the Amenities page, or type custom ones below.</p>}
              </div>
            </div>
            <Field label="Extra amenities"><input className="input" placeholder="Balcony, bathtub, minibar" value={roomForm.customAmenities} onChange={(event) => setRoomForm({ ...roomForm, customAmenities: event.target.value })} /></Field>
            <div className="grid gap-4 lg:grid-cols-3">
              {['image1', 'image2', 'image3'].map((field, index) => (
                <div key={field}>
                  <span className="label">Image {index + 1}</span>
                  <div className="grid gap-2">
                    <input className="input" type="url" value={roomForm[field]} onChange={(event) => setRoomForm({ ...roomForm, [field]: event.target.value })} placeholder="https://..." />
                    <label className="btn-secondary !min-h-10 cursor-pointer">
                      <ImagePlus size={17} /> Upload image
                      <input className="hidden" type="file" accept="image/*" onChange={(event) => onUpload(event.target.files?.[0], field)} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold"><input type="checkbox" checked={roomForm.showOnHomepage} onChange={(event) => setRoomForm({ ...roomForm, showOnHomepage: event.target.checked })} /> Homepage banner</label>
              <label className="flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold"><input type="checkbox" checked={roomForm.active} onChange={(event) => setRoomForm({ ...roomForm, active: event.target.checked })} /> Active room</label>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button className="btn-primary flex-1" type="submit" disabled={saving}><Plus size={18} /> {saving ? 'Saving...' : roomForm.id ? 'Save room' : 'Create room'}</button>
              <button className="btn-secondary" type="button" onClick={() => {
                setRoomForm(emptyRoom)
                setShowRoomForm(false)
              }}>Cancel</button>
            </div>
          </form>
        </div>
      </section>
    )
  }

  return (
    <section className="grid gap-3 sm:gap-6">
      <div className="panel overflow-hidden">
        <PanelHeader
          icon={BedDouble}
          title="Room management"
          action={(
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <SearchBox value={filters.rooms} onChange={(value) => setFilters({ ...filters, rooms: value })} placeholder="Search rooms" />
              <button className="btn-primary !min-h-10 !px-4" type="button" onClick={() => {
                setRoomForm(emptyRoom)
                setShowRoomForm(true)
              }}><Plus size={16} /> Add room</button>
            </div>
          )}
        />
        {filteredRooms.length ? (
          <div className="grid gap-3 p-3 sm:p-5">
            {filteredRooms.map((room) => <RoomCard key={room.id} room={room} onEdit={onEdit} onDelete={onDelete} onToggleHomepage={onToggleHomepage} />)}
          </div>
        ) : <EmptyState title="No rooms found" text="Try a different search, or add a new room category." />}
      </div>
    </section>
  )
}

function RateOptionEditor({ category, roomForm, setRoomForm }) {
  const option = roomForm.rateOptions[category]
  const title = category === 'single' ? 'Single rate' : 'Double rate'
  function update(field, value) {
    setRoomForm({
      ...roomForm,
      rateOptions: {
        ...roomForm.rateOptions,
        [category]: { ...option, [field]: value },
      },
    })
  }
  return (
    <section className="rounded-lg border border-stone-200 bg-ivory p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-charcoal">{title}</p>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-black uppercase text-amberline">{category}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Regular price"><input className="input" type="number" min="0" value={option.basePrice} onChange={(event) => update('basePrice', event.target.value)} required /></Field>
        <Field label="Offer price"><input className="input" type="number" min="0" value={option.offerPrice} onChange={(event) => update('offerPrice', event.target.value)} /></Field>
        <Field label="Size sq ft"><input className="input" type="number" min="1" value={option.sizeSqft} onChange={(event) => update('sizeSqft', event.target.value)} /></Field>
        <Field label="Physical rooms"><input className="input" type="number" min="1" value={option.physicalRooms} onChange={(event) => update('physicalRooms', event.target.value)} /></Field>
        <Field label="Adults"><input className="input" type="number" min="1" value={option.occupancyAdults} onChange={(event) => update('occupancyAdults', event.target.value)} /></Field>
        <Field label="Children"><input className="input" type="number" min="0" value={option.occupancyChildren} onChange={(event) => update('occupancyChildren', event.target.value)} /></Field>
      </div>
    </section>
  )
}

function InventoryPanel({ rooms, entries, loading, form, setForm, editingEntry, onCancelEdit, summary, summaryLoading, summaryRoomId, setSummaryRoomId, saving, onSave, onView, onEdit, onDelete, showBulk, setShowBulk, showEntries, setShowEntries, onOpenDay }) {
  const room = rooms.find((item) => item.id === form.roomTypeId)
  const capacity = room ? getRoomCapacity(room) : 0
  const offlineRooms = form.closed ? capacity : Math.min(Number(form.offlineRooms || 0), capacity || Number(form.offlineRooms || 0))
  const sellableRooms = form.closed ? 0 : Math.max(0, capacity - offlineRooms)
  return (
    <section className="grid gap-3 sm:gap-6">
      <div className="panel p-3 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <PanelMiniTitle icon={CalendarDays} title="Inventory control" />
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-primary !min-h-10 !px-4" type="button" onClick={() => setShowBulk(true)}><Plus size={16} /> Bulk update</button>
            <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => setShowEntries(!showEntries)}><Eye size={16} /> {showEntries ? 'Hide entries' : 'Saved entries'}</button>
          </div>
        </div>
      </div>
      {showBulk ? <form onSubmit={onSave} className="panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PanelMiniTitle icon={CalendarDays} title="Bulk inventory update" />
          <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => setShowBulk(false)}>Close</button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="grid gap-4">
            {editingEntry ? (
              <EditNotice
                title="Editing saved inventory entry"
                text={`${editingEntry.room_name} / ${formatDate(editingEntry.start_date)} to ${formatDate(editingEntry.end_date)}. Saving will replace this entry instead of creating a duplicate.`}
                onCancel={onCancelEdit}
              />
            ) : null}
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-start">
              <Field label="Room category">
                <select className="input" value={form.roomTypeId} onChange={(event) => setForm({ ...form, roomTypeId: event.target.value })} required>
                  <option value="">Select room</option>
                  {rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <AdminDateRangePicker form={form} setForm={setForm} />
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
              <Field label="Sold out rooms"><input className="input" type="number" min="0" max={capacity || undefined} value={form.offlineRooms} onChange={(event) => setForm({ ...form, offlineRooms: event.target.value, closed: false })} /></Field>
              <label className="flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold">
                <input type="checkbox" checked={form.closed} onChange={(event) => setForm({ ...form, closed: event.target.checked })} />
                Mark full room category sold out
              </label>
            </div>
            <Field label="Internal note"><input className="input" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Sold out from direct booking, maintenance, group booking" /></Field>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button className="btn-primary flex-1" type="submit" disabled={saving || !rooms.length}><CalendarDays size={18} /> {saving ? 'Updating...' : editingEntry ? 'Save inventory changes' : 'Update inventory'}</button>
              <button className="btn-secondary" type="button" onClick={onCancelEdit}>{editingEntry ? 'Cancel edit' : 'Reset'}</button>
            </div>
          </div>
          <div className="rounded-lg border border-white/70 bg-white/72 p-4 shadow-soft">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Availability preview</p>
            <h3 className="mt-2 text-xl font-black text-charcoal">{room?.name || 'Select a room category'}</h3>
            <dl className="mt-4 grid gap-2">
              <CompactStat label="Physical capacity" value={capacity || '-'} />
              <CompactStat label="Sold out" value={room ? offlineRooms : '-'} />
              <CompactStat label="Sellable online" value={room ? sellableRooms : '-'} />
            </dl>
            <p className="mt-4 text-sm font-semibold leading-6 text-stone-600">For the selected dates, online availability will be reduced by the sold-out rooms. If marked sold out, this category will not appear in guest search.</p>
          </div>
        </div>
      </form> : null}
      <InventoryRoomSummary
        rooms={rooms}
        summary={summary}
        loading={summaryLoading}
        selectedRoomId={summaryRoomId}
        onSelectRoom={setSummaryRoomId}
        onSelectDate={onOpenDay}
      />
      {showEntries ? (
        <EntriesModal title="Inventory entries" onClose={() => setShowEntries(false)}>
          <InventoryEntriesList entries={entries} loading={loading} saving={saving} onView={onView} onEdit={onEdit} onDelete={onDelete} />
        </EntriesModal>
      ) : null}
    </section>
  )
}

function RateCalendarPanel({ rooms, entries, loading, form, setForm, editingEntry, onCancelEdit, summary, summaryLoading, summaryRoomId, setSummaryRoomId, saving, onSave, onView, onEdit, onDelete, showBulk, setShowBulk, showEntries, setShowEntries, onOpenDay }) {
  const room = rooms.find((item) => item.id === form.roomTypeId)
  const rates = room ? normalizeRoomRateOptions(room) : null
  return (
    <section className="grid gap-3 sm:gap-6">
      <div className="panel p-3 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <PanelMiniTitle icon={IndianRupee} title="Rate calendar" />
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-primary !min-h-10 !px-4" type="button" onClick={() => setShowBulk(true)}><Plus size={16} /> Bulk update</button>
            <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => setShowEntries(!showEntries)}><Eye size={16} /> {showEntries ? 'Hide entries' : 'Saved entries'}</button>
          </div>
        </div>
      </div>
      {showBulk ? <form onSubmit={onSave} className="panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PanelMiniTitle icon={IndianRupee} title="Bulk rate update" />
          <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => setShowBulk(false)}>Close</button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="grid gap-4">
            {editingEntry ? (
              <EditNotice
                title="Editing saved rate entry"
                text={`${editingEntry.room_name} / ${rateCategoryLabel(editingEntry.rate_category)} / ${formatDate(editingEntry.start_date)} to ${formatDate(editingEntry.end_date)}. Saving will replace this entry instead of creating a duplicate.`}
                onCancel={onCancelEdit}
              />
            ) : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
              <Field label="Room category">
                <select className="input" value={form.roomTypeId} onChange={(event) => setForm({ ...form, roomTypeId: event.target.value })} required>
                  <option value="">Select room</option>
                  {rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="Rate type">
                <select className="input" value={form.rateCategory} onChange={(event) => setForm({ ...form, rateCategory: event.target.value })}>
                  <option value="all">Single and double</option>
                  <option value="single">Single only</option>
                  <option value="double">Double only</option>
                </select>
              </Field>
              <AdminDateRangePicker form={form} setForm={setForm} />
            </div>
            <div className="grid gap-4">
              <Field label="New nightly rate"><input className="input" type="number" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="8000" required /></Field>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button className="btn-primary flex-1" type="submit" disabled={saving || !rooms.length}><IndianRupee size={18} /> {saving ? 'Updating...' : editingEntry ? 'Save rate changes' : 'Update rate calendar'}</button>
              <button className="btn-secondary" type="button" onClick={onCancelEdit}>{editingEntry ? 'Cancel edit' : 'Reset'}</button>
            </div>
          </div>
          <div className="rounded-lg border border-white/70 bg-white/72 p-4 shadow-soft">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Current base rates</p>
            <h3 className="mt-2 text-xl font-black text-charcoal">{room?.name || 'Select a room category'}</h3>
            <dl className="mt-4 grid gap-2">
              <CompactStat label="Single" value={rates?.single?.enabled ? `Rs ${Number(rates.single.offerPrice || rates.single.basePrice || 0).toLocaleString('en-IN')}` : '-'} />
              <CompactStat label="Double" value={rates?.double?.enabled ? `Rs ${Number(rates.double.offerPrice || rates.double.basePrice || 0).toLocaleString('en-IN')}` : '-'} />
              <CompactStat label="Selected override" value={form.price ? `Rs ${Number(form.price).toLocaleString('en-IN')}` : '-'} />
            </dl>
            <p className="mt-4 text-sm font-semibold leading-6 text-stone-600">Guests searching inside this date range will see this nightly rate for the selected rate type while other dates keep their normal room rate.</p>
          </div>
        </div>
      </form> : null}
      <RateRoomSummary
        rooms={rooms}
        summary={summary}
        loading={summaryLoading}
        selectedRoomId={summaryRoomId}
        onSelectRoom={setSummaryRoomId}
        onSelectDate={onOpenDay}
      />
      {showEntries ? (
        <EntriesModal title="Rate entries" onClose={() => setShowEntries(false)}>
          <RateEntriesList entries={entries} loading={loading} saving={saving} onView={onView} onEdit={onEdit} onDelete={onDelete} />
        </EntriesModal>
      ) : null}
    </section>
  )
}

function EntriesModal({ title, children, onClose }) {
  return (
    <Modal onClose={onClose} width="max-w-[96rem]">
      <div className="max-h-[92vh] overflow-y-auto bg-bone p-3 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-mist bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">Saved rules</p>
            <h2 className="mt-1 text-2xl font-black text-charcoal">{title}</h2>
          </div>
          <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </Modal>
  )
}

function InventoryRoomSummary({ rooms, summary, loading, selectedRoomId, onSelectRoom, onSelectDate }) {
  const days = summary?.days || []
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const monthDays = daysForMonth(days, viewMonth)
  const soldOutDaysCount = days.filter((day) => day.closed || Number(day.offline_rooms || 0) > 0).length
  const soldOutDays = days.filter((day) => day.closed || Number(day.sellable_online || 0) <= 0).length
  const minSellable = days.length ? Math.min(...days.map((day) => Number(day.sellable_online || 0))) : 0
  return (
    <section className="panel p-3 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <PanelMiniTitle icon={CalendarDays} title="Inventory calendar" />
          <p className="mt-2 text-sm font-semibold text-stone-600">Select a room and click any date to edit that day's availability.</p>
        </div>
        <RoomSummarySelector rooms={rooms} value={selectedRoomId} onChange={onSelectRoom} />
      </div>
      <div className="mt-5 grid gap-4">
        <div className="grid gap-2 md:grid-cols-4">
          <CompactStat label="Room" value={summary?.room?.name || 'Select room'} />
          <CompactStat label="Capacity" value={summary?.room?.capacity || '-'} />
          <CompactStat label="Sold-out dates" value={loading ? '...' : soldOutDaysCount} />
          <CompactStat label="Lowest sellable" value={loading ? '...' : minSellable} />
        </div>
        {soldOutDays ? <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{soldOutDays} date{soldOutDays === 1 ? '' : 's'} have no online rooms available.</p> : null}
        <CalendarToolbar month={viewMonth} setMonth={setViewMonth} loading={loading} />
        <MonthCalendar
          days={monthDays}
          emptyText="Select a room to view its inventory calendar."
          renderDay={(day) => <InventoryCalendarDay day={day} capacity={summary?.room?.capacity || 0} onClick={() => onSelectDate(day)} />}
        />
      </div>
    </section>
  )
}

function RateRoomSummary({ rooms, summary, loading, selectedRoomId, onSelectRoom, onSelectDate }) {
  const days = summary?.days || []
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const monthDays = daysForMonth(days, viewMonth)
  const overrideDays = days.filter((day) => day.single_override_price !== null || day.double_override_price !== null).length
  return (
    <section className="panel p-3 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <PanelMiniTitle icon={IndianRupee} title="Rate calendar overview" />
          <p className="mt-2 text-sm font-semibold text-stone-600">Click a date, then choose S, D, or All to edit the exact rate rule.</p>
        </div>
        <RoomSummarySelector rooms={rooms} value={selectedRoomId} onChange={onSelectRoom} />
      </div>
      <div className="mt-5 grid gap-4">
        <div className="grid gap-2 md:grid-cols-4">
          <CompactStat label="Room" value={summary?.room?.name || 'Select room'} />
          <CompactStat label="Base single" value={summary?.room?.baseRates?.single ? money(summary.room.baseRates.single) : '-'} />
          <CompactStat label="Base double" value={summary?.room?.baseRates?.double ? money(summary.room.baseRates.double) : '-'} />
          <CompactStat label="Override dates" value={loading ? '...' : overrideDays} />
        </div>
        <CalendarToolbar month={viewMonth} setMonth={setViewMonth} loading={loading} />
        <MonthCalendar
          days={monthDays}
          emptyText="Select a room to view its rate calendar."
          renderDay={(day) => <RateCalendarDay day={day} baseRates={summary?.room?.baseRates || {}} onSelect={onSelectDate} />}
        />
      </div>
    </section>
  )
}

function RoomSummarySelector({ rooms, value, onChange }) {
  return (
    <select className="input h-10 w-full min-w-52 sm:w-64" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select room</option>
      {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
    </select>
  )
}

function CalendarToolbar({ month, setMonth, loading }) {
  return (
    <div className="flex flex-col gap-3 border-y border-mist py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-center text-xl font-black text-charcoal sm:text-left">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
        <p className="mt-1 text-center text-xs font-bold uppercase tracking-[0.12em] text-stone-400 sm:text-left">{loading ? 'Loading dates' : 'Click a date to edit'}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => setMonth(addMonthsLocal(month, -1))}>Previous</button>
        <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => setMonth(addMonthsLocal(month, 1))}>Next</button>
      </div>
    </div>
  )
}

function MonthCalendar({ days, emptyText, renderDay }) {
  if (!days.some(Boolean)) return <EmptyState title="No calendar dates" text={emptyText} />
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-7 pb-2 text-center text-xs font-black uppercase tracking-[0.08em] text-stone-400">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, index) => day ? <div key={toDateInput(day.stay_date)}>{renderDay(day)}</div> : <span key={`empty-${index}`} className="min-h-24 rounded-md bg-bone/60" />)}
        </div>
      </div>
    </div>
  )
}

function InventoryCalendarDay({ day, capacity, onClick }) {
  const date = new Date(day.stay_date)
  const closed = Boolean(day.closed)
  const sellable = Number(day.sellable_online || 0)
  const soldOut = closed ? capacity : Number(day.offline_rooms || 0)
  const status = closed || sellable <= 0 || soldOut > 0 ? 'Sold out' : 'Available'
  const tone = closed || sellable <= 0 || soldOut > 0 ? 'border-red-100 bg-red-50' : 'border-emerald-100 bg-emerald-50'
  return (
    <button type="button" className={`min-h-24 rounded-md border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-card ${tone}`} onClick={onClick}>
      <span className="text-lg font-black text-charcoal">{date.getDate()}</span>
      <span className="mt-1 block text-[0.62rem] font-black uppercase tracking-[0.1em] text-stone-500">{status}</span>
      <span className="mt-2 grid gap-0.5 text-[0.7rem] font-bold text-stone-600">
        <span>Available: <strong className="text-charcoal">{sellable}</strong></span>
        <span>Sold: <strong className="text-charcoal">{closed ? 'All' : soldOut}</strong></span>
        <span>Reserved: <strong className="text-charcoal">{Number(day.reserved_rooms || 0)}</strong></span>
      </span>
    </button>
  )
}

function RateCalendarDay({ day, baseRates, onSelect }) {
  const date = new Date(day.stay_date)
  const single = day.single_override_price ?? baseRates.single
  const double = day.double_override_price ?? baseRates.double
  const hasOverride = day.single_override_price !== null || day.double_override_price !== null
  return (
    <div className={`min-h-28 rounded-md border p-2 ${hasOverride ? 'border-amberline/20 bg-amber-50' : 'border-mist bg-white'}`}>
      <button type="button" className="block w-full text-left" onClick={() => onSelect(day, 'all')}>
        <span className="text-lg font-black text-charcoal">{date.getDate()}</span>
        <span className="mt-1 block text-[0.62rem] font-black uppercase tracking-[0.1em] text-stone-500">{hasOverride ? 'Override' : 'Base rate'}</span>
      </button>
      <div className="mt-2 grid gap-0.5 text-[0.7rem] font-bold text-stone-600">
        <span>S: <strong className="text-charcoal">{single ? money(single) : '-'}</strong></span>
        <span>D: <strong className="text-charcoal">{double ? money(double) : '-'}</strong></span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        <button className="rounded-md border border-mist bg-white px-2 py-1 text-xs font-black text-charcoal" type="button" onClick={() => onSelect(day, 'single')}>S</button>
        <button className="rounded-md border border-mist bg-white px-2 py-1 text-xs font-black text-charcoal" type="button" onClick={() => onSelect(day, 'double')}>D</button>
        <button className="rounded-md border border-mist bg-white px-2 py-1 text-xs font-black text-charcoal" type="button" onClick={() => onSelect(day, 'all')}>All</button>
      </div>
    </div>
  )
}

function AdminDateRangePicker({ form, setForm }) {
  return (
    <div className="rounded-md border border-mist bg-bone p-3">
      <StayDateRangePicker
        checkIn={form.startDate}
        checkOut={form.endDate}
        startLabel="From date"
        endLabel="To date"
        dialogLabel="Select calendar dates"
        inclusiveRange
        rangeUnit="day"
        selectionDelayMs={350}
        onRangeChange={(startDate, endDate) => setForm({ ...form, startDate, endDate: endDate || startDate })}
        onRangeComplete={(startDate, endDate) => setForm({ ...form, startDate, endDate: endDate || startDate })}
      />
    </div>
  )
}

function EditNotice({ title, text, onCancel }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-amberline/20 bg-amber-50 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-black text-charcoal">{title}</p>
        <p className="mt-1 font-semibold leading-6 text-stone-600">{text}</p>
      </div>
      <button className="btn-secondary !min-h-10 shrink-0 !px-3" type="button" onClick={onCancel}>Cancel</button>
    </div>
  )
}

function InventoryEntriesList({ entries, loading, saving, onView, onEdit, onDelete }) {
  return (
    <div className="panel overflow-hidden">
      <PanelHeader icon={CalendarDays} title="Inventory entries" />
      {loading ? <EmptyState title="Loading inventory" text="Saved sold-out dates are loading." /> : null}
      {!loading && entries.length ? (
        <div className="grid gap-3 p-3 sm:p-5">
          {entries.map((entry) => {
            const closed = Boolean(entry.closed)
            return (
              <article key={entry.id} className="grid gap-3 rounded-md border border-mist bg-white p-3 shadow-sm xl:grid-cols-[minmax(0,1.45fr)_minmax(190px,0.75fr)_minmax(220px,0.85fr)_190px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-extrabold text-charcoal sm:text-lg">{entry.room_name}</h3>
                    <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-black uppercase text-red-700">Sold out</span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-stone-500">{formatDate(entry.start_date)} to {formatDate(entry.end_date)} / {entry.days} day{Number(entry.days) === 1 ? '' : 's'}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
                  <CompactStat label="Sold out rooms" value={closed ? 'All rooms' : Number(entry.offline_rooms || 0)} />
                  <CompactStat label="Sellable online" value={closed ? 0 : Number(entry.total_rooms || 0)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CompactStat label="Capacity" value={Number(entry.capacity || 0)} />
                  <CompactStat label="Reserved" value={Number(entry.reserved_rooms || 0)} />
                </div>
                <EntryActionButtons entry={entry} saving={saving} onView={onView} onEdit={onEdit} onDelete={onDelete} />
              </article>
            )
          })}
        </div>
      ) : null}
      {!loading && !entries.length ? <EmptyState title="No inventory entries" text="Bulk sold-out updates will appear here after you update inventory." /> : null}
    </div>
  )
}

function RateEntriesList({ entries, loading, saving, onView, onEdit, onDelete }) {
  return (
    <div className="panel overflow-hidden">
      <PanelHeader icon={IndianRupee} title="Rate entries" />
      {loading ? <EmptyState title="Loading rate entries" text="Saved date-wise rate changes are loading." /> : null}
      {!loading && entries.length ? (
        <div className="grid gap-3 p-3 sm:p-5">
          {entries.map((entry) => (
            <article key={entry.id} className="grid gap-3 rounded-md border border-mist bg-white p-3 shadow-sm xl:grid-cols-[minmax(0,1.45fr)_minmax(170px,0.65fr)_minmax(220px,0.85fr)_190px] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-extrabold text-charcoal sm:text-lg">{entry.room_name}</h3>
                  <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-700">{rateCategoryLabel(entry.rate_category)}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-stone-500">{formatDate(entry.start_date)} to {formatDate(entry.end_date)} / {entry.days} day{Number(entry.days) === 1 ? '' : 's'}</p>
              </div>
              <CompactStat label="Nightly rate" value={`Rs ${Number(entry.price || 0).toLocaleString('en-IN')}`} />
              <div className="grid grid-cols-2 gap-2">
                <CompactStat label="Rate type" value={rateCategoryLabel(entry.rate_category)} />
              </div>
              <EntryActionButtons entry={entry} saving={saving} onView={onView} onEdit={onEdit} onDelete={onDelete} />
            </article>
          ))}
        </div>
      ) : null}
      {!loading && !entries.length ? <EmptyState title="No rate entries" text="Date-wise room rate changes will appear here after you update the rate calendar." /> : null}
    </div>
  )
}

function EntryActionButtons({ entry, saving, onView, onEdit, onDelete }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <button className="btn-secondary !min-h-10 !px-2 text-xs sm:text-sm" type="button" onClick={() => onView(entry)}><Eye size={15} /> View</button>
      <button className="btn-secondary !min-h-10 !px-2 text-xs sm:text-sm" type="button" onClick={() => onEdit(entry)}><Pencil size={15} /> Edit</button>
      <button className="btn-secondary !min-h-10 !px-2 text-xs text-red-700 sm:text-sm" type="button" disabled={saving} onClick={() => onDelete(entry)}><Trash2 size={15} /> Delete</button>
    </div>
  )
}

function CreateBookingPanel({ rooms, manualBooking, setManualBooking, saving, onCreateManual }) {
  return (
    <section className="grid gap-3 sm:gap-6">
      <form onSubmit={onCreateManual} className="panel p-4 sm:p-5">
        <PanelMiniTitle icon={ClipboardPlus} title="Create booking" />
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Room"><select className="input" value={manualBooking.roomTypeId} onChange={(event) => setManualBooking({ ...manualBooking, roomTypeId: event.target.value })} required><option value="">Select room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field>
          <Field label="Check-in"><input className="input" type="date" value={manualBooking.checkIn} onChange={(event) => setManualBooking({ ...manualBooking, checkIn: event.target.value })} required /></Field>
          <Field label="Check-out"><input className="input" type="date" value={manualBooking.checkOut} onChange={(event) => setManualBooking({ ...manualBooking, checkOut: event.target.value })} required /></Field>
          <Field label="Status"><select className="input" value={manualBooking.status} onChange={(event) => setManualBooking({ ...manualBooking, status: event.target.value })}><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="payment_pending">Payment pending</option><option value="completed">Completed</option></select></Field>
          <Field label="Guest name"><input className="input" value={manualBooking.guestName} onChange={(event) => setManualBooking({ ...manualBooking, guestName: event.target.value })} required /></Field>
          <Field label="Guest email"><input className="input" type="email" value={manualBooking.guestEmail} onChange={(event) => setManualBooking({ ...manualBooking, guestEmail: event.target.value })} required /></Field>
          <Field label="Phone"><input className="input" value={manualBooking.guestPhone} onChange={(event) => setManualBooking({ ...manualBooking, guestPhone: event.target.value })} /></Field>
          <Field label="Final amount"><input className="input" type="number" min="0" value={manualBooking.totalAmount} onChange={(event) => setManualBooking({ ...manualBooking, totalAmount: event.target.value })} /></Field>
          <Field label="Rooms"><input className="input" type="number" min="1" value={manualBooking.roomsCount} onChange={(event) => setManualBooking({ ...manualBooking, roomsCount: event.target.value })} /></Field>
          <Field label="Adults"><input className="input" type="number" min="1" value={manualBooking.adults} onChange={(event) => setManualBooking({ ...manualBooking, adults: event.target.value })} /></Field>
          <Field label="Children"><input className="input" type="number" min="0" value={manualBooking.children} onChange={(event) => setManualBooking({ ...manualBooking, children: event.target.value })} /></Field>
          <div className="flex items-end">
            <button className="btn-primary w-full" disabled={saving} type="submit"><ClipboardPlus size={18} /> {saving ? 'Creating...' : 'Create booking'}</button>
          </div>
        </div>
      </form>
    </section>
  )
}

function SettingsPanel({ form, setForm, saving, onSave }) {
  const threshold = Math.max(0, Number(form.loyaltyRedemptionMinPoints || 0))
  const samplePoints = Math.max(0, threshold - 250)
  const progress = threshold > 0 ? Math.min(100, Math.round((samplePoints / threshold) * 100)) : 100
  return (
    <section className="grid gap-3 sm:gap-6">
      <form onSubmit={onSave} className="panel p-4 sm:p-5">
        <PanelMiniTitle icon={Settings} title="Hotel loyalty settings" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="grid gap-4">
            <Field label="Minimum points before redemption">
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={form.loyaltyRedemptionMinPoints}
                onChange={(event) => setForm({ ...form, loyaltyRedemptionMinPoints: event.target.value })}
              />
            </Field>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-extrabold text-amber-950">Guests can collect points immediately after confirmed bookings.</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-700">Redemption will appear during checkout only after their group point balance reaches this minimum. Set 0 if redemption should be available for any positive balance.</p>
            </div>
            <button className="btn-primary w-full sm:w-fit" disabled={saving} type="submit">
              <CheckCircle2 size={18} /> {saving ? 'Saving...' : 'Save loyalty rule'}
            </button>
          </div>
          <div className="rounded-lg border border-white/70 bg-white/70 p-4 shadow-glass backdrop-blur-xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Guest account preview</p>
            <p className="mt-2 text-2xl font-black text-charcoal">{samplePoints.toLocaleString('en-IN')} / {threshold.toLocaleString('en-IN')} pts</p>
            <div className="mt-4 overflow-hidden rounded-full bg-bone shadow-inner">
              <div className="h-3 rounded-full bg-[linear-gradient(90deg,#7f1d1d,#f59e0b)]" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-stone-600">
              {threshold ? `${Math.max(0, threshold - samplePoints).toLocaleString('en-IN')} more points needed before checkout redemption opens.` : 'Any available points can be redeemed during checkout.'}
            </p>
          </div>
        </div>
      </form>
    </section>
  )
}

function BookingsPanel({ bookings, filters, setFilters, saving, onEdit, onDelete, onCreateClick }) {
  const filtered = filterByText(bookings, filters.bookings, ['guest_name', 'guest_email', 'guest_phone', 'booking_reference', 'room_type_name', 'status', 'total_amount']).filter((booking) => filters.bookingStatus === 'all' || booking.status === filters.bookingStatus)
  const upcoming = filtered.filter((booking) => ['confirmed', 'payment_pending'].includes(booking.status) && String(booking.check_in) >= nextDay(0))
  const completed = filtered.filter((booking) => ['completed', 'cancelled', 'failed'].includes(booking.status) || String(booking.check_out) < nextDay(0))
  return (
    <section className="grid gap-3 sm:gap-6">
      <div className="panel overflow-hidden">
        <PanelHeader
          icon={CalendarDays}
          title="Booking management"
          action={(
            <div className="grid gap-2 sm:grid-cols-[minmax(260px,1fr)_auto]">
              <BookingFilters filters={filters} setFilters={setFilters} />
              <button className="btn-primary !min-h-10 !px-4" type="button" onClick={onCreateClick}><ClipboardPlus size={16} /> Create</button>
            </div>
          )}
        />
        <BookingSection title="Upcoming bookings" bookings={upcoming} saving={saving} onEdit={onEdit} onDelete={onDelete} />
        <BookingSection title="Completed and closed bookings" bookings={completed} saving={saving} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </section>
  )
}

function CancellationRequestsPanel({ requests, filters, setFilters, saving, onReview }) {
  const [reviewForm, setReviewForm] = useState(null)
  const filtered = filterByText(requests, filters.cancellations, ['booking_reference', 'guest_name', 'guest_email', 'guest_phone', 'room_type_name', 'reason_option', 'reason_text', 'status'])
    .filter((request) => filters.cancellationStatus === 'all' || request.status === filters.cancellationStatus)

  return (
    <section className="grid gap-3 sm:gap-6">
      <div className="panel overflow-hidden">
        <PanelHeader
          icon={CircleAlert}
          title="Cancellation requests"
          action={<CancellationFilters filters={filters} setFilters={setFilters} />}
        />
        {filtered.length ? (
          <div className="grid gap-3 p-3 sm:p-5">
            {filtered.map((request) => (
              <article key={request.id} className="rounded-lg border border-white/70 bg-white/70 p-4 shadow-soft backdrop-blur">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-xl font-black text-charcoal">{request.booking_reference}</h3>
                      <StatusPill status={request.status} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-stone-500">{request.guest_name} / {request.room_type_name}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-stone-400">Requested {formatDateTime(request.requested_at)}</p>
                  </div>
                  <div className="grid gap-2 text-sm md:min-w-[220px]">
                    <Line label="Booking total" value={money(request.total_amount)} />
                    <Line label="Stay" value={`${formatDate(request.check_in)} to ${formatDate(request.check_out)}`} />
                    <Line label="Phone" value={request.guest_phone || '-'} />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_280px]">
                  <div className="rounded-md bg-ivory p-3 text-sm">
                    <p className="font-black text-charcoal">{request.reason_option}</p>
                    {request.reason_text ? <p className="mt-2 font-semibold leading-6 text-stone-600">{request.reason_text}</p> : null}
                    {request.admin_message ? <p className="mt-3 rounded-md bg-white p-3 font-semibold leading-6 text-stone-600">Admin message: {request.admin_message}</p> : null}
                    {request.status === 'approved' ? <p className="mt-3 font-black text-emerald-800">Manual refund marked: {money(request.refund_amount)}</p> : null}
                  </div>
                  {request.status === 'requested' ? (
                    <div className="grid gap-2 content-start">
                      <button className="btn-primary !min-h-10" type="button" disabled={saving} onClick={() => setReviewForm({ request, status: 'approved', refundAmount: '', adminMessage: '' })}>Approve</button>
                      <button className="btn-secondary !min-h-10 text-red-700" type="button" disabled={saving} onClick={() => setReviewForm({ request, status: 'rejected', refundAmount: '', adminMessage: '' })}>Reject</button>
                    </div>
                  ) : (
                    <div className="rounded-md bg-bone p-3 text-sm font-semibold text-stone-600">
                      Reviewed {formatDateTime(request.reviewed_at)}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No cancellation requests" text="Guest cancellation requests will appear here for review." />}
      </div>
      {reviewForm ? <CancellationReviewModal form={reviewForm} setForm={setReviewForm} saving={saving} onSubmit={onReview} onClose={() => setReviewForm(null)} /> : null}
    </section>
  )
}

function CancellationReviewModal({ form, setForm, saving, onSubmit, onClose }) {
  const approve = form.status === 'approved'
  return (
    <Modal onClose={onClose} width="max-w-xl">
      <form
        className="p-5"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(form.request, form.status, form)
          onClose()
        }}
      >
        <p className="eyebrow">{approve ? 'Approve cancellation' : 'Reject cancellation'}</p>
        <h2 className="mt-1 break-words text-2xl font-black text-charcoal">{form.request.booking_reference}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">{form.request.reason_option}{form.request.reason_text ? ` / ${form.request.reason_text}` : ''}</p>
        <div className="mt-5 grid gap-4">
          {approve ? <Field label="Manual refund amount"><input className="input" type="number" min="0" value={form.refundAmount} onChange={(event) => setForm({ ...form, refundAmount: event.target.value })} /></Field> : null}
          <Field label={approve ? 'Message to guest' : 'Reason / message to guest'}>
            <textarea className="input min-h-28 py-3" value={form.adminMessage} onChange={(event) => setForm({ ...form, adminMessage: event.target.value })} placeholder={approve ? 'Example: Your cancellation is approved. Refund will be processed manually.' : 'Example: This booking is inside the non-refundable window.'} />
          </Field>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <button className={approve ? 'btn-primary' : 'btn-secondary text-red-700'} disabled={saving} type="submit">{saving ? 'Saving...' : approve ? 'Approve request' : 'Reject request'}</button>
          <button className="btn-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </form>
    </Modal>
  )
}

function UsersPanel({ users, filters, setFilters, saving, onOpen, onDelete }) {
  const filtered = filterByText(users, filters.users, ['full_name', 'email', 'phone', 'profile'])
  return (
    <section>
      <div className="panel overflow-hidden">
        <PanelHeader icon={UsersRound} title="User profiles" action={<SearchBox value={filters.users} onChange={(value) => setFilters({ ...filters, users: value })} placeholder="Search users" />} />
        {filtered.length ? (
          <div className="grid gap-3 p-3 sm:p-5 lg:gap-0 lg:divide-y lg:divide-white/60 lg:p-0">
            {filtered.map((user) => (
              <article key={user.id} className="grid gap-3 rounded-md border border-white/70 bg-white/65 p-3 shadow-sm backdrop-blur sm:p-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-5 lg:shadow-none lg:grid-cols-[1fr_140px_160px_220px] lg:items-center">
                <div className="flex min-w-0 gap-3">
                  <Avatar id={user.profile?.avatar} gender={user.profile?.gender} photoUrl={user.profile?.photoUrl} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-extrabold sm:text-lg">{user.full_name || 'Guest user'}</p>
                    <p className="truncate text-sm font-semibold text-stone-500">{user.email}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-500">{user.phone || user.profile?.city || 'Profile details pending'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:contents">
                  <CompactStat label="Bookings" value={user.bookings || 0} />
                  <CompactStat label="Revenue" value={`Rs ${Number(user.revenue || 0).toLocaleString('en-IN')}`} />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 lg:flex lg:flex-wrap">
                  <button className="btn-secondary !min-h-10 !px-3 text-xs sm:text-sm" type="button" onClick={() => onOpen(user)}><UserRound size={16} /> Profile</button>
                  <button className="btn-secondary !min-h-10 !px-3 text-red-700" type="button" disabled={saving} onClick={() => onDelete(user)} aria-label={`Delete ${user.full_name || user.email}`}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No users found" text="Customers appear after signup or booking activity." />}
      </div>
    </section>
  )
}

function FeedbackPanel({ feedback, filters, setFilters }) {
  const filtered = filterByText(feedback, filters.feedback, ['name', 'email', 'phone', 'message', 'rating', 'status'])
  return (
    <section>
      <div className="panel overflow-hidden">
        <PanelHeader icon={MessageSquare} title="Hotel feedback" action={<SearchBox value={filters.feedback} onChange={(value) => setFilters({ ...filters, feedback: value })} placeholder="Search feedback" />} />
        {filtered.length ? (
          <div className="grid gap-3 p-3 sm:p-5 lg:grid-cols-2">
            {filtered.map((item) => (
              <article key={item.id} className="rounded-md border border-white/70 bg-white/65 p-4 shadow-sm backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold">{item.name || item.user_full_name || 'Guest'}</p>
                    <p className="truncate text-sm font-semibold text-stone-500">{item.email}</p>
                    {item.phone ? <p className="mt-1 text-xs font-semibold text-stone-500">{item.phone}</p> : null}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-sm font-black text-amber-800">
                    <Star size={15} fill="currentColor" /> {item.rating}/5
                  </span>
                </div>
                <p className="mt-4 text-sm font-semibold leading-6 text-stone-700">{item.message}</p>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/70 pt-3 text-xs font-bold uppercase tracking-[0.1em] text-stone-500">
                  <span>{item.status || 'new'}</span>
                  <span>{formatDate(item.created_at)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No feedback found" text="Feedback submitted from this hotel website will appear here." />}
      </div>
    </section>
  )
}

function AmenitiesPanel({ amenities, form, setForm, showForm, setShowForm, filters, setFilters, saving, onSave, onDelete }) {
  const filtered = filterByText(amenities, filters.amenities, ['name', 'description', 'icon'])
  if (showForm) {
    return (
      <section className="grid gap-3 sm:gap-6">
        <form onSubmit={onSave} className="panel p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <PanelMiniTitle icon={Sparkles} title={form.id ? 'Edit amenity' : 'Add amenity'} />
            <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => {
              setForm(emptyAmenity)
              setShowForm(false)
            }}>Back to amenities</button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Amenity name"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
            <Field label="Price"><input className="input" type="number" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
            <Field label="Logo URL"><input className="input" type="url" value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} placeholder="https://example.com/amenity-logo.png" /></Field>
            <label className="mt-6 flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active</label>
            <Field label="Description"><textarea className="input min-h-28 py-3 md:col-span-2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button className="btn-primary flex-1" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save amenity'}</button>
            <button className="btn-secondary" type="button" onClick={() => {
              setForm(emptyAmenity)
              setShowForm(false)
            }}>Cancel</button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="grid gap-3 sm:gap-6">
      <div className="panel overflow-hidden">
        <PanelHeader
          icon={Sparkles}
          title="Amenity catalog"
          action={(
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <SearchBox value={filters.amenities} onChange={(value) => setFilters({ ...filters, amenities: value })} placeholder="Search amenities" />
              <button className="btn-primary !min-h-10 !px-4" type="button" onClick={() => {
                setForm(emptyAmenity)
                setShowForm(true)
              }}><Plus size={16} /> Add amenity</button>
            </div>
          )}
        />
        {filtered.length ? (
          <div className="grid gap-3 p-3 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((amenity) => (
              <article key={amenity.id} className="flex min-h-[150px] flex-col rounded-md border border-white/70 bg-white/65 p-3 shadow-sm backdrop-blur sm:min-h-[170px] sm:p-4">
                <div className="flex items-start gap-3">
                  <AmenityLogo amenity={amenity} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-extrabold">{amenity.name}</h3>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.1em] text-stone-500">{Number(amenity.price || 0) ? `Rs ${Number(amenity.price).toLocaleString('en-IN')}` : 'Included'}</p>
                  </div>
                  <StatusPill status={amenity.active ? 'active' : 'inactive'} />
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600">{amenity.description || 'Visible in room setup and hotel experience.'}</p>
                <div className="mt-auto flex gap-2 pt-4">
                  <button className="btn-secondary !min-h-10 flex-1 !px-3" type="button" onClick={() => {
                    setForm({ id: amenity.id, name: amenity.name, description: amenity.description || '', price: amenity.price || 0, icon: amenity.icon || '', active: amenity.active })
                    setShowForm(true)
                  }}><Pencil size={16} /> Edit</button>
                  <button className="btn-secondary !min-h-10 !px-3 text-red-700" type="button" disabled={saving} onClick={() => onDelete(amenity)}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No amenities found" text="Add amenities once here, then select them while adding rooms." />}
      </div>
    </section>
  )
}

function FaqPanel({ faqs, form, setForm, showForm, setShowForm, filters, setFilters, saving, onSave, onDelete }) {
  const filtered = filterByText(faqs, filters.faqs, ['question', 'answer', 'active'])
  if (showForm) {
    return (
      <section className="grid gap-3 sm:gap-6">
        <form onSubmit={onSave} className="panel p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <PanelMiniTitle icon={HelpCircle} title={form.id ? 'Edit FAQ' : 'Add FAQ'} />
            <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => {
              setForm(emptyFaq)
              setShowForm(false)
            }}>Back to FAQ</button>
          </div>
          <div className="mt-5 grid gap-4">
            <Field label="Question"><input className="input" value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} required /></Field>
            <Field label="Answer"><textarea className="input min-h-32 py-3" value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display order"><input className="input" type="number" min="0" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></Field>
              <label className="mt-6 flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Published</label>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button className="btn-primary flex-1" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save FAQ'}</button>
            <button className="btn-secondary" type="button" onClick={() => {
              setForm(emptyFaq)
              setShowForm(false)
            }}>Cancel</button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="grid gap-3 sm:gap-6">
      <div className="panel overflow-hidden">
        <PanelHeader
          icon={HelpCircle}
          title="Website FAQ"
          action={(
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <SearchBox value={filters.faqs} onChange={(value) => setFilters({ ...filters, faqs: value })} placeholder="Search FAQ" />
              <button className="btn-primary !min-h-10 !px-4" type="button" onClick={() => {
                setForm(emptyFaq)
                setShowForm(true)
              }}><Plus size={16} /> Add FAQ</button>
            </div>
          )}
        />
        {filtered.length ? (
          <div className="grid gap-3 p-3 sm:p-5 lg:grid-cols-2">
            {filtered.map((faq) => (
              <article key={faq.id} className="flex min-h-[180px] flex-col rounded-md border border-white/70 bg-white/65 p-4 shadow-sm backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-stone-500">Order {Number(faq.sort_order || 0)}</p>
                    <h3 className="mt-2 text-lg font-extrabold leading-tight text-charcoal">{faq.question}</h3>
                  </div>
                  <StatusPill status={faq.active ? 'active' : 'inactive'} />
                </div>
                <p className="mt-3 line-clamp-3 text-sm font-semibold leading-6 text-stone-600">{faq.answer}</p>
                <div className="mt-auto flex gap-2 pt-4">
                  <button className="btn-secondary !min-h-10 flex-1 !px-3" type="button" onClick={() => {
                    setForm({ id: faq.id, question: faq.question, answer: faq.answer, sortOrder: faq.sort_order || 0, active: faq.active })
                    setShowForm(true)
                  }}><Pencil size={16} /> Edit</button>
                  <button className="btn-secondary !min-h-10 !px-3 text-red-700" type="button" disabled={saving} onClick={() => onDelete(faq)}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No FAQs found" text="Add common guest questions for this hotel website." />}
      </div>
    </section>
  )
}

function OffersPanel({ offers, rooms, form, setForm, showForm, setShowForm, filters, setFilters, saving, onSave, onDelete }) {
  const filtered = filterByText(offers, filters.offers, ['title', 'description', 'code', 'badge', 'audience_type', 'discount_type', 'discount_value']).filter((offer) => filters.offerAudience === 'all' || offer.audience_type === filters.offerAudience)
  const previewSubtotal = 10000
  const previewDiscount = offerPreviewDiscount({ discount_type: form.discountType, discount_value: form.discountValue }, previewSubtotal)
  if (showForm) {
    return (
      <section className="grid gap-3 sm:gap-6">
        <form onSubmit={onSave} className="panel p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <PanelMiniTitle icon={Gift} title={form.id ? 'Edit offer' : 'Create offer'} />
            <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => {
              setForm(emptyOffer)
              setShowForm(false)
            }}>Back to offers</button>
          </div>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Offer title"><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></Field>
              <Field label="Code"><input className="input" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field>
              <Field label="Badge"><input className="input" value={form.badge} onChange={(event) => setForm({ ...form, badge: event.target.value })} /></Field>
              <Field label="Audience"><select className="input" value={form.audienceType} onChange={(event) => setForm({ ...form, audienceType: event.target.value })}><option value="general">General offer</option><option value="repeat_guest">Personalized repeat guest</option></select></Field>
            </div>
            <Field label="Description"><textarea className="input min-h-28 py-3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></Field>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Discount type"><select className="input" value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></Field>
              <Field label="Discount value"><input className="input" type="number" min="0" value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} required /></Field>
              <Field label="Starts"><input className="input" type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} required /></Field>
              <Field label="Ends"><input className="input" type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} required /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {form.audienceType === 'repeat_guest' ? <Field label="Minimum bookings"><input className="input" type="number" min="1" value={form.minCompletedBookings} onChange={(event) => setForm({ ...form, minCompletedBookings: event.target.value })} /></Field> : null}
              <Field label="Highlight color"><input className="input h-12" type="color" value={form.highlightColor} onChange={(event) => setForm({ ...form, highlightColor: event.target.value })} /></Field>
              <Field label="Offer image URL"><input className="input" type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." /></Field>
              <label className="mt-6 flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active</label>
            </div>
            <OfferRoomTargetSelector rooms={rooms} value={form.roomTypeIds || []} onChange={(roomTypeIds) => setForm({ ...form, roomTypeIds })} />
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-extrabold text-amber-900">Calculation preview</p>
              <p className="mt-1 font-semibold leading-6 text-stone-600">On a Rs {previewSubtotal.toLocaleString('en-IN')} room subtotal, this offer saves Rs {previewDiscount.toLocaleString('en-IN')}. Tax is calculated after discount.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button className="btn-primary flex-1" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save offer'}</button>
              <button className="btn-secondary" type="button" onClick={() => {
                setForm(emptyOffer)
                setShowForm(false)
              }}>Cancel</button>
            </div>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="grid gap-3 sm:gap-6">
      <div className="panel overflow-hidden">
        <PanelHeader
          icon={Gift}
          title="Offer rules"
          action={(
            <div className="grid gap-2 sm:grid-cols-[minmax(260px,1fr)_auto]">
              <OfferFilters filters={filters} setFilters={setFilters} />
              <button className="btn-primary !min-h-10 !px-4" type="button" onClick={() => {
                setForm(emptyOffer)
                setShowForm(true)
              }}><Plus size={16} /> Add offer</button>
            </div>
          )}
        />
        {filtered.length ? (
          <div className="grid gap-3 p-3 sm:gap-4 sm:p-5 xl:grid-cols-2">
            {filtered.map((offer) => (
              <article key={offer.id} className="relative flex flex-col overflow-hidden rounded-md border border-white/70 bg-white/65 p-3 shadow-sm backdrop-blur sm:min-h-[230px] sm:p-4">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: offer.highlight_color || '#f59e0b' }} />
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-md bg-amber-50 px-3 py-2 text-xs font-black uppercase text-amber-700">{offer.audience_type === 'repeat_guest' ? 'Personalized' : 'General'}</span>
                  <StatusPill status={offer.active ? 'active' : 'inactive'} />
                </div>
                <h3 className="mt-4 text-lg font-extrabold">{offer.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">{offer.description}</p>
                <div className="mt-4 grid gap-2 text-sm font-semibold text-stone-600 sm:grid-cols-2">
                  <span>{offer.discount_type === 'percentage' ? `${Number(offer.discount_value)}% off` : `Rs ${Number(offer.discount_value).toLocaleString('en-IN')} off`}</span>
                  <span>Saves Rs {offerPreviewDiscount(offer, 10000).toLocaleString('en-IN')} on Rs 10,000 before tax</span>
                  {offer.code ? <span>Code: {offer.code}</span> : null}
                  {offer.audience_type === 'repeat_guest' ? <span>Shows after {offer.min_completed_bookings} booking(s)</span> : null}
                  <span>{offerRoomTargetLabel(offer, rooms)}</span>
                  <span>{formatDate(offer.starts_at)} to {formatDate(offer.ends_at)}</span>
                </div>
                <div className="mt-auto flex gap-2 pt-4">
                  <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => {
                    setForm({
                      id: offer.id,
                      title: offer.title,
                      description: offer.description,
                      code: offer.code || '',
                      discountType: offer.discount_type,
                      discountValue: offer.discount_value,
                      startsAt: toDateTimeLocal(offer.starts_at),
                      endsAt: toDateTimeLocal(offer.ends_at),
                      active: offer.active,
                      audienceType: offer.audience_type,
                      minCompletedBookings: offer.min_completed_bookings,
                      badge: offer.badge || '',
                      highlightColor: offer.highlight_color || '#f59e0b',
                      imageUrl: offer.image_url || '',
                      roomTypeIds: offer.room_type_ids || [],
                    })
                    setShowForm(true)
                  }}><Pencil size={16} /> Edit</button>
                  <button className="btn-secondary !min-h-10 !px-3 text-red-700" type="button" disabled={saving} onClick={() => onDelete(offer)}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No offers found" text="Create general or repeat-guest offers for the hotel website." />}
      </div>
    </section>
  )
}

function OfferRoomTargetSelector({ rooms = [], value = [], onChange }) {
  const normalizedValue = Array.isArray(value) ? value.filter(Boolean) : []
  const selected = new Set(normalizedValue)
  const allRoomsMode = !normalizedValue.length
  const selectedRooms = rooms.filter((room) => selected.has(room.id))
  const toggle = (roomId) => {
    const next = new Set(normalizedValue)
    if (next.has(roomId)) next.delete(roomId)
    else next.add(roomId)
    onChange(Array.from(next))
  }

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Eligible rooms</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-stone-600">Select room categories to limit this offer. Leave all unchecked only when the offer should show on every room.</p>
        </div>
        <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => onChange([])}>Use all rooms</button>
      </div>
      {rooms.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <label key={room.id} className={`flex min-h-12 items-center gap-3 rounded-md border px-3 text-sm font-bold transition ${selected.has(room.id) ? 'border-emerald-400 bg-white text-charcoal ring-2 ring-emerald-200' : 'border-emerald-100 bg-white/70 text-stone-600'}`}>
              <input type="checkbox" checked={selected.has(room.id)} onChange={() => toggle(room.id)} />
              <span className="min-w-0 truncate">{room.name}</span>
            </label>
          ))}
        </div>
      ) : <p className="mt-3 rounded-md bg-white p-3 text-sm font-semibold text-stone-500">Add room categories before limiting offers by room.</p>}
      <div className="mt-3 rounded-md bg-white/80 p-3">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-emerald-800">{allRoomsMode ? 'Currently applies to all rooms' : `Applies to ${normalizedValue.length} room category${normalizedValue.length === 1 ? '' : 'ies'}`}</p>
        {!allRoomsMode ? (
          <p className="mt-1 text-sm font-semibold leading-6 text-stone-600">
            {selectedRooms.length ? selectedRooms.map((room) => room.name).join(', ') : 'Selected room categories will be validated when you save.'}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function RoomCard({ room, onEdit, onDelete, onToggleHomepage }) {
  const amenityItems = Array.isArray(room.amenity_items) ? room.amenity_items : []
  const roomAmenities = amenityItems.length ? amenityItems : (room.amenities || []).map((name) => ({ name }))
  const rateOptions = normalizeRoomRateOptions(room)
  const visibleRates = Object.entries(rateOptions).filter(([, option]) => option.enabled)
  return (
    <article className="grid gap-4 rounded-md border border-mist bg-white p-3 shadow-sm lg:grid-cols-[180px_minmax(0,1fr)_220px] lg:items-center">
      <div className="relative h-36 overflow-hidden rounded-md bg-bone">
        {room.hero_image_url ? <img src={room.hero_image_url} alt={room.name} className="absolute inset-0 h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-amberline"><BedDouble size={34} /></div>}
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold leading-snug text-charcoal">{room.name}</h3>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.1em] text-stone-500">{room.bed_type || 'Room category'}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <StatusPill status={room.active ? 'active' : 'inactive'} />
            {room.show_on_homepage ? <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Featured</span> : null}
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600">{room.description}</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
          {visibleRates.slice(0, 2).map(([category, option]) => (
            <CompactStat
              key={category}
              label={category === 'single' ? 'Single' : 'Double'}
              value={`Rs ${Number(option.offerPrice || option.basePrice || 0).toLocaleString('en-IN')}`}
            />
          ))}
          <CompactStat label="Rooms" value={room.physical_rooms || 0} />
          <CompactStat label="Available" value={room.lowest_available_rooms ?? 0} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-2 overflow-hidden">
          {roomAmenities.slice(0, 4).map((item) => <span key={item.id || item.name} className="max-w-full truncate rounded-md bg-bone px-2 py-1 text-xs font-bold text-stone-600">{item.name}{item.price ? ` / Rs ${Number(item.price).toLocaleString('en-IN')}` : ''}</span>)}
          {roomAmenities.length > 4 ? <span className="rounded-md bg-ivory px-2 py-1 text-xs font-black text-stone-500">+{roomAmenities.length - 4} more</span> : null}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
        <button className="btn-secondary !min-h-10 !px-2 text-xs sm:text-sm" type="button" onClick={() => onEdit(room)}><Pencil size={15} /> Edit</button>
        <button className="btn-secondary !min-h-10 !px-2 text-xs sm:text-sm" type="button" onClick={() => onToggleHomepage(room)}><Tag size={15} /> {room.show_on_homepage ? 'Remove' : 'Feature'}</button>
        <button className="btn-secondary !min-h-10 !px-2 text-xs text-red-700 sm:text-sm" type="button" onClick={() => onDelete(room)}><Trash2 size={15} /> Delete</button>
      </div>
    </article>
  )
}

function BookingSection({ title, bookings, saving, onEdit, onDelete }) {
  return (
    <section className="border-t border-white/60">
      <div className="bg-white/45 px-4 py-3 sm:px-5">
        <h3 className="font-extrabold">{title}</h3>
      </div>
      {bookings.length ? (
        <div className="grid gap-3 p-3 sm:p-5 lg:gap-0 lg:divide-y lg:divide-white/60 lg:p-0">
          {bookings.map((booking) => (
            <article key={booking.id} className="grid gap-3 rounded-md border border-white/70 bg-white/65 p-3 shadow-sm backdrop-blur lg:rounded-none lg:border-0 lg:bg-transparent lg:p-4 lg:shadow-none lg:grid-cols-[1fr_180px_150px_120px_140px_100px] lg:items-center">
              <div>
                <p className="font-bold">{booking.guest_name}</p>
                <p className="text-sm text-stone-500">{booking.room_type_name} / {booking.booking_reference}</p>
              </div>
              <p className="text-sm font-semibold text-stone-600">{formatDate(booking.check_in)} to {formatDate(booking.check_out)}</p>
              <p className="text-xs font-bold uppercase leading-5 tracking-[0.08em] text-stone-400">{formatDateTime(booking.confirmed_at || booking.created_at)}</p>
              <StatusPill status={booking.status} />
              <p className="font-extrabold">Rs {Number(booking.total_amount).toLocaleString('en-IN')}</p>
              <div className="grid grid-cols-2 gap-2 lg:flex">
                <button className="grid h-10 place-items-center rounded-md border border-white/70 bg-white/80 px-3 text-sm font-bold shadow-sm lg:w-10 lg:px-0" type="button" title="Open details" onClick={() => onEdit(booking)}><Eye size={16} /></button>
                <button className="grid h-10 place-items-center rounded-md border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 shadow-sm lg:w-10 lg:px-0" type="button" disabled={saving} title="Delete" onClick={() => onDelete(booking)}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title={`No ${title.toLowerCase()}`} text="Bookings will appear here automatically." />}
    </section>
  )
}

function EntryDetailsModal({ entry, onClose }) {
  const isInventory = entry.type === 'inventory'
  const title = isInventory ? 'Inventory details' : 'Rate details'
  const status = isInventory
    ? (entry.closed ? 'Sold out for online booking' : 'Sold out rooms')
    : rateCategoryLabel(entry.rate_category)
  return (
    <Modal onClose={onClose} width="max-w-2xl">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{title}</p>
            <h2 className="mt-1 text-2xl font-black text-charcoal sm:text-3xl">{entry.room_name}</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">{formatDate(entry.start_date)} to {formatDate(entry.end_date)} / {entry.days} day{Number(entry.days) === 1 ? '' : 's'}</p>
          </div>
          <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={onClose}>Close</button>
        </div>

        <div className="mt-5 rounded-md bg-bone p-4 text-sm">
          <Line label="Room category" value={entry.room_name} />
          <Line label="Date range" value={`${formatDate(entry.start_date)} to ${formatDate(entry.end_date)}`} />
          <Line label="Status" value={status} />
          {isInventory ? (
            <>
              <Line label="Physical capacity" value={Number(entry.capacity || 0)} />
              <Line label="Sold out rooms" value={entry.closed ? 'All rooms' : Number(entry.offline_rooms || 0)} />
              <Line label="Sellable online" value={entry.closed ? 0 : Number(entry.total_rooms || 0)} />
              <Line label="Reserved rooms" value={Number(entry.reserved_rooms || 0)} />
            </>
          ) : (
            <>
              <Line label="Rate type" value={rateCategoryLabel(entry.rate_category)} />
              <Line label="Nightly rate" value={`Rs ${Number(entry.price || 0).toLocaleString('en-IN')}`} />
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function InventoryDayEditor({ form, setForm, saving, onSave, onDelete, onClose }) {
  const capacity = Number(form.capacity || 0)
  const soldOut = Math.max(0, Math.min(Number(form.soldOutRooms || 0), capacity))
  const available = Math.max(0, capacity - soldOut - Number(form.reservedRooms || 0))
  return (
    <Modal onClose={onClose} width="max-w-lg">
      <form onSubmit={onSave} className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Inventory date</p>
            <h2 className="mt-1 text-2xl font-black text-charcoal">{form.roomName || 'Room'}</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">{formatDate(form.date)}</p>
          </div>
          <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="mt-5 grid gap-4">
          <div className="grid grid-cols-3 gap-2">
            <CompactStat label="Capacity" value={capacity} />
            <CompactStat label="Reserved" value={Number(form.reservedRooms || 0)} />
            <CompactStat label="Available" value={available} />
          </div>
          <Field label="Sold out rooms">
            <input className="input" type="number" min="0" max={capacity || undefined} value={form.soldOutRooms} onChange={(event) => setForm({ ...form, soldOutRooms: event.target.value })} />
          </Field>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save date'}</button>
          <button className="btn-secondary text-red-700" type="button" disabled={saving} onClick={onDelete}><Trash2 size={16} /> Clear date</button>
        </div>
      </form>
    </Modal>
  )
}

function RateDayEditor({ form, setForm, saving, onSave, onDelete, onClose }) {
  const showSingle = form.rateCategory !== 'double'
  const showDouble = form.rateCategory !== 'single'
  return (
    <Modal onClose={onClose} width="max-w-lg">
      <form onSubmit={onSave} className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Rate date</p>
            <h2 className="mt-1 text-2xl font-black text-charcoal">{form.roomName || 'Room'}</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">{formatDate(form.date)} / {rateCategoryLabel(form.rateCategory)}</p>
          </div>
          <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="mt-5 grid gap-4">
          <Field label="Rate type">
            <select className="input" value={form.rateCategory} onChange={(event) => setForm({ ...form, rateCategory: event.target.value })}>
              <option value="all">Single and double</option>
              <option value="single">Single only</option>
              <option value="double">Double only</option>
            </select>
          </Field>
          {showSingle ? <Field label="Single room rate"><input className="input" type="number" min="0" value={form.singlePrice} onChange={(event) => setForm({ ...form, singlePrice: event.target.value })} /></Field> : null}
          {showDouble ? <Field label="Double room rate"><input className="input" type="number" min="0" value={form.doublePrice} onChange={(event) => setForm({ ...form, doublePrice: event.target.value })} /></Field> : null}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save rate'}</button>
          <button className="btn-secondary text-red-700" type="button" disabled={saving} onClick={onDelete}><Trash2 size={16} /> Clear rate</button>
        </div>
      </form>
    </Modal>
  )
}

function BookingEditor({ form, setForm, saving, onSubmit, onDelete, onClose }) {
  const metadata = form.metadata || {}
  const pricing = metadata.pricing || {}
  const paymentPlan = metadata.paymentPlan || {}
  const gstClaim = metadata.gstClaim || form.gst_claim || {}
  const selectedAmenities = Array.isArray(metadata.selectedAmenities) ? metadata.selectedAmenities : []
  const taxHalf = Number(form.tax_amount || 0) / 2
  return (
    <Modal onClose={onClose} width="max-w-6xl">
      <form onSubmit={onSubmit} className="p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-mist pb-5 sm:flex-row sm:items-start">
          <div>
            <p className="eyebrow">Booking details</p>
            <h2 className="mt-1 break-words text-3xl font-semibold">{form.booking_reference}</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">{form.room_type_name} / {formatDate(form.check_in)} to {formatDate(form.check_out)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {receiptDownloadUrl(form) ? <a className="btn-primary !min-h-10 !px-3" href={receiptDownloadUrl(form)} download={bookingReceiptFileName(form)}><Download size={16} /> Receipt</a> : <span className="inline-flex min-h-10 items-center rounded-md border border-mist bg-white px-3 text-sm font-bold text-stone-400">Receipt preparing</span>}
            <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <CompactStat label="Status" value={form.status || '-'} />
              <CompactStat label="Total" value={money(form.total_amount)} />
              <CompactStat label="Paid" value={money(paymentPlan.paidAmount ?? form.total_amount)} />
              <CompactStat label="Balance" value={money(paymentPlan.balanceDue || 0)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <BookingInfoCard title="Guest">
                <BookingInfoLine label="Name" value={form.guestName} />
                <BookingInfoLine label="Email" value={form.guestEmail} />
                <BookingInfoLine label="Phone" value={form.guestPhone || '-'} />
                <BookingInfoLine label="Guests" value={`${form.adults} adult${Number(form.adults) === 1 ? '' : 's'}, ${form.children || 0} child${Number(form.children) === 1 ? '' : 'ren'}`} />
              </BookingInfoCard>
              <BookingInfoCard title="Stay">
                <BookingInfoLine label="Room type" value={form.room_type_name} />
                <BookingInfoLine label="Bed type" value={form.bed_type || 'Premium bedding'} />
                <BookingInfoLine label="Size" value={form.size_sqft ? `${form.size_sqft} sq ft` : '-'} />
                <BookingInfoLine label="Dates" value={`${formatDate(form.check_in)} to ${formatDate(form.check_out)}`} />
                <BookingInfoLine label="Booking time" value={formatDateTime(form.confirmed_at || form.created_at)} />
              </BookingInfoCard>
            </div>

            {form.cancellation_status ? (
              <BookingInfoCard title="Cancellation request">
                <BookingInfoLine label="Status" value={form.cancellation_status} />
                <BookingInfoLine label="Reason" value={form.cancellation_reason_option || '-'} />
                <BookingInfoLine label="Requested" value={formatDateTime(form.cancellation_requested_at)} />
                {form.cancellation_refund_amount !== null && form.cancellation_refund_amount !== undefined ? <BookingInfoLine label="Manual refund" value={money(form.cancellation_refund_amount)} /> : null}
                {form.cancellation_admin_message ? <BookingInfoLine label="Admin message" value={form.cancellation_admin_message} /> : null}
              </BookingInfoCard>
            ) : null}

            {gstClaim.enabled ? (
              <BookingInfoCard title="GST claim details">
                <BookingInfoLine label="Company" value={gstClaim.companyName || '-'} />
                <BookingInfoLine label="GST number" value={gstClaim.gstNumber || '-'} />
                <BookingInfoLine label="Address" value={gstClaim.companyAddress || '-'} />
              </BookingInfoCard>
            ) : null}

            <BookingInfoCard title="Editable guest details">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Guest name"><input className="input" value={form.guestName} onChange={(event) => setForm({ ...form, guestName: event.target.value })} required /></Field>
                <Field label="Guest email"><input className="input" type="email" value={form.guestEmail} onChange={(event) => setForm({ ...form, guestEmail: event.target.value })} required /></Field>
                <Field label="Guest phone"><input className="input" value={form.guestPhone} onChange={(event) => setForm({ ...form, guestPhone: event.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Adults"><input className="input" type="number" min="1" value={form.adults} onChange={(event) => setForm({ ...form, adults: event.target.value })} /></Field>
                  <Field label="Children"><input className="input" type="number" min="0" value={form.children} onChange={(event) => setForm({ ...form, children: event.target.value })} /></Field>
                </div>
              </div>
            </BookingInfoCard>

            <BookingInfoCard title="Selected add-ons">
              {selectedAmenities.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedAmenities.map((amenity) => (
                    <div key={amenity.id || amenity.name} className="rounded-md border border-mist bg-ivory p-3">
                      <p className="font-extrabold text-charcoal">{amenity.name}</p>
                      <p className="mt-1 text-sm font-semibold text-stone-500">{money(Number(amenity.price || 0) * Number(form.rooms_count || 1))}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm font-semibold text-stone-500">No paid add-ons were selected for this booking.</p>}
            </BookingInfoCard>

            <Field label="Internal note"><textarea className="input min-h-24 py-3" value={form.internalNote} onChange={(event) => setForm({ ...form, internalNote: event.target.value })} /></Field>
          </div>

          <aside className="rounded-lg border border-mist bg-white p-4 shadow-soft lg:sticky lg:top-4 lg:self-start">
            <ShieldCheck className="text-amberline" size={24} />
            <p className="eyebrow mt-3">Payment file</p>
            <h3 className="mt-2 text-2xl font-black text-charcoal">{money(form.total_amount)}</h3>
            <div className="mt-5 grid gap-3 text-sm">
              <BookingInfoLine label="Room subtotal" value={money(pricing.roomSubtotal || form.subtotal_amount)} />
              {selectedAmenities.length ? <BookingInfoLine label="Selected add-ons" value={money(pricing.amenitySubtotal || 0)} /> : null}
              {metadata.offer?.discountAmount ? <BookingInfoLine label={`Offer: ${metadata.offer.title || 'Discount'}`} value={`-${money(metadata.offer.discountAmount)}`} /> : null}
              {metadata.loyaltyRedemption?.amount ? <BookingInfoLine label="Loyalty redemption" value={`-${money(metadata.loyaltyRedemption.amount)}`} /> : null}
              <BookingInfoLine label="Taxable subtotal" value={money(form.subtotal_amount)} />
              <BookingInfoLine label="CGST (2.5%)" value={money(taxHalf)} />
              <BookingInfoLine label="IGST (2.5%)" value={money(taxHalf)} />
              <div className="border-t border-mist pt-3">
                <BookingInfoLine label="Payment order" value={form.razorpay_order_id || 'Manual / pending'} />
                <BookingInfoLine label="Invoice" value={form.invoice_number || '-'} />
              </div>
            </div>
          </aside>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button className="btn-primary flex-1" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save booking details'}</button>
          <button className="btn-secondary text-red-700" disabled={saving} type="button" onClick={() => onDelete(form)}><Trash2 size={16} /> Delete</button>
        </div>
      </form>
    </Modal>
  )
}

function BookingInfoCard({ title, children }) {
  return (
    <section className="rounded-lg border border-mist bg-white p-4 shadow-soft">
      <h3 className="text-lg font-black text-charcoal">{title}</h3>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  )
}

function BookingInfoLine({ label, value }) {
  return (
    <p className="flex items-start justify-between gap-4 text-sm">
      <span className="font-semibold text-stone-500">{label}</span>
      <span className="max-w-[62%] break-words text-right font-extrabold text-charcoal">{value || '-'}</span>
    </p>
  )
}

function UserProfileModal({ profile, saving, onDelete, onClose }) {
  const user = profile.user
  return (
    <Modal onClose={onClose} width="max-w-4xl">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <Avatar id={user?.profile?.avatar} gender={user?.profile?.gender} photoUrl={user?.profile?.photoUrl} />
            <div>
              <p className="eyebrow">User profile</p>
              <h2 className="mt-1 text-3xl font-semibold">{user?.full_name || user?.email}</h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">{user?.email}</p>
            </div>
          </div>
          <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={onClose}>Close</button>
        </div>
        {profile.loading ? <p className="mt-6 text-sm text-stone-500">Loading full user profile...</p> : null}
        {profile.error ? <Notice type="error" message={profile.error} /> : null}
        {!profile.loading ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <Stat label="Bookings" value={user?.bookings || 0} />
              <Stat label="Revenue" value={`Rs ${Number(user?.revenue || 0).toLocaleString('en-IN')}`} />
              <Stat label="Loyalty points" value={user?.loyalty_points || 0} />
              <Stat label="Last booking" value={user?.last_booking_at ? formatDate(user.last_booking_at) : '-'} />
            </div>
            <div className="mt-6 grid gap-3 rounded-md bg-bone p-4 text-sm sm:grid-cols-2">
              <Line label="Phone" value={user?.phone || '-'} />
              <Line label="Email" value={user?.email || '-'} />
              <Line label="City" value={user?.profile?.city || '-'} />
              <Line label="Address" value={user?.profile?.address || '-'} />
              <Line label="Gender" value={formatProfileValue(user?.profile?.gender) || '-'} />
              <Line label="Birth date" value={user?.profile?.birthDate || '-'} />
            </div>
            <h3 className="mt-6 font-extrabold">Booking history</h3>
            <div className="mt-3 grid gap-3">
              {(profile.bookings || []).map((booking) => (
                <div key={booking.id} className="grid gap-3 rounded-md border border-mist p-3 md:grid-cols-[1fr_150px_100px_130px] md:items-center">
                  <div>
                    <p className="font-bold">{booking.room_type_name}</p>
                    <p className="text-sm text-stone-500">{booking.booking_reference}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatDate(booking.check_in)} to {formatDate(booking.check_out)}</p>
                  <StatusPill status={booking.status} />
                  <p className="font-extrabold">Rs {Number(booking.total_amount).toLocaleString('en-IN')}</p>
                </div>
              ))}
              {!profile.bookings?.length ? <p className="rounded-md bg-bone p-4 text-sm font-semibold text-stone-500">No bookings found for this hotel.</p> : null}
            </div>
            <h3 className="mt-6 font-extrabold">Feedback history</h3>
            <div className="mt-3 grid gap-3">
              {(profile.feedback || []).map((item) => (
                <div key={item.id} className="rounded-md border border-mist p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-sm font-black text-amber-800"><Star size={15} fill="currentColor" /> {item.rating}/5</span>
                    <span className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">{formatDate(item.created_at)}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-stone-700">{item.message}</p>
                </div>
              ))}
              {!profile.feedback?.length ? <p className="rounded-md bg-bone p-4 text-sm font-semibold text-stone-500">No feedback found for this hotel.</p> : null}
            </div>
            <button className="btn-secondary mt-6 text-red-700" type="button" disabled={saving} onClick={() => onDelete(user)}><Trash2 size={16} /> Delete user</button>
          </>
        ) : null}
      </div>
    </Modal>
  )
}

function BookingFilters({ filters, setFilters }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[220px_170px]">
      <SearchBox value={filters.bookings} onChange={(value) => setFilters({ ...filters, bookings: value })} placeholder="Search bookings" />
      <select className="input h-10" value={filters.bookingStatus} onChange={(event) => setFilters({ ...filters, bookingStatus: event.target.value })}>
        <option value="all">All statuses</option>
        <option value="confirmed">Confirmed</option>
        <option value="payment_pending">Payment pending</option>
        <option value="cancelled">Cancelled</option>
        <option value="failed">Failed</option>
      </select>
    </div>
  )
}

function CancellationFilters({ filters, setFilters }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[220px_170px]">
      <SearchBox value={filters.cancellations} onChange={(value) => setFilters({ ...filters, cancellations: value })} placeholder="Search requests" />
      <select className="input h-10" value={filters.cancellationStatus} onChange={(event) => setFilters({ ...filters, cancellationStatus: event.target.value })}>
        <option value="requested">Requested</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="all">All statuses</option>
      </select>
    </div>
  )
}

function OfferFilters({ filters, setFilters }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[220px_170px]">
      <SearchBox value={filters.offers} onChange={(value) => setFilters({ ...filters, offers: value })} placeholder="Search offers" />
      <select className="input h-10" value={filters.offerAudience} onChange={(event) => setFilters({ ...filters, offerAudience: event.target.value })}>
        <option value="all">All audiences</option>
        <option value="general">General</option>
        <option value="repeat_guest">Personalized</option>
      </select>
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="relative block min-w-0">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
      <input className="input h-10 pl-9" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

function Metric({ icon: Icon, label, value, detail }) {
  return (
    <div className="metric-card overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <span className="icon-tile"><Icon size={20} /></span>
        <span className="h-2 w-12 rounded-full bg-[linear-gradient(90deg,#f59e0b,#7f1d1d)] opacity-70" />
      </div>
      <p className="mt-4 text-xl font-extrabold sm:text-2xl">{value}</p>
      <p className="mt-1 text-sm font-semibold text-stone-500">{label}</p>
      {detail ? <p className="mt-3 text-xs font-semibold leading-5 text-stone-500">{detail}</p> : null}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md bg-ivory p-3">
      <dt className="text-xs font-bold uppercase text-stone-500">{label}</dt>
      <dd className="mt-1 font-extrabold">{value}</dd>
    </div>
  )
}

function CompactStat({ label, value }) {
  return (
    <div className="rounded-md bg-ivory px-3 py-2">
      <dt className="text-[0.66rem] font-black uppercase tracking-[0.08em] text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-extrabold text-charcoal">{value}</dd>
    </div>
  )
}

function StatRow({ label, value }) {
  return <div className="flex items-center justify-between gap-4 rounded-md bg-ivory p-3 text-sm"><span className="font-semibold text-stone-600">{label}</span><span className="font-black">{value}</span></div>
}

function PanelHeader({ icon: Icon, title, action }) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-white/60 p-4 md:flex-row md:items-center md:p-5">
      <PanelMiniTitle icon={Icon} title={title} />
      {action ? <div className="w-full md:w-auto">{action}</div> : null}
    </div>
  )
}

function PanelMiniTitle({ icon: Icon, title }) {
  return <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon size={19} className="text-amberline" /> {title}</h2>
}

function Notice({ type, message }) {
  const Icon = type === 'success' ? CheckCircle2 : CircleAlert
  const tone = type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
  return <p className={`mb-5 flex items-start gap-2 rounded-md border p-3 text-sm font-semibold ${tone}`}><Icon size={17} className="mt-0.5 shrink-0" /> {message}</p>
}

function EmptyState({ title, text }) {
  return (
    <div className="p-8 text-center">
      <BedDouble className="mx-auto text-amberline" size={34} />
      <h2 className="mt-4 text-xl font-extrabold">{title}</h2>
      <p className="mt-2 text-sm text-stone-600">{text}</p>
    </div>
  )
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function Modal({ children, width, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-charcoal/45 p-3 backdrop-blur-sm md:place-items-center" onMouseDown={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-lg border border-white/50 bg-ivory shadow-2xl ${width || 'max-w-2xl'}`} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function BrandLogo({ name, logoUrl }) {
  if (logoUrl) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-visible sm:h-14 sm:w-14">
        <img src={logoDisplayUrl(logoUrl)} alt={`${name} logo`} className="h-full w-full object-contain" />
      </span>
    )
  }
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[linear-gradient(135deg,#7f1d1d,#f59e0b)] text-base font-black text-white shadow-soft sm:h-14 sm:w-14 sm:text-lg">
      {initials(name)}
    </span>
  )
}

function Avatar({ id = 'avatar-male', gender, photoUrl }) {
  if (photoUrl) {
    return <img src={photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border border-white bg-white object-cover shadow-soft" />
  }
  const option = profileOptions.find((item) => item.avatar === id || item.gender === gender) || profileOptions[0]
  const Icon = option.Icon
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amberline to-wine text-white shadow-soft"><Icon size={22} /></span>
}

function AmenityLogo({ amenity, small = false }) {
  const size = small ? 'h-8 w-8' : 'h-11 w-11'
  if (isUrl(amenity?.icon)) {
    return <img src={amenity.icon} alt="" className={`${size} shrink-0 rounded-md border border-mist bg-white object-contain p-1`} loading="lazy" />
  }
  return <span className={`grid ${size} shrink-0 place-items-center rounded-md bg-amberline text-white`}><Sparkles size={small ? 15 : 18} /></span>
}

function Line({ label, value }) {
  return <div className="flex justify-between gap-4"><span className="text-stone-500">{label}</span><span className="text-right font-bold text-charcoal">{value}</span></div>
}

function filterByText(items, query, keys) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => keys.some((key) => searchableValue(item[key]).includes(needle)))
}

function searchableValue(value) {
  if (Array.isArray(value)) return value.map((item) => searchableValue(item)).join(' ').toLowerCase()
  if (value && typeof value === 'object') return Object.values(value).map((item) => searchableValue(item)).join(' ').toLowerCase()
  return String(value || '').toLowerCase()
}

function activePageLabel(page) {
  return tabs.find((tab) => tab.key === page)?.label || 'Admin'
}

function activePageTitle(page) {
  const titles = {
    summary: 'Hotel dashboard summary',
    rooms: 'Room management',
    inventory: 'Inventory control',
    rates: 'Rate calendar',
    'create-booking': 'Create manual booking',
    bookings: 'Booking management',
    cancellations: 'Cancellation requests',
    users: 'User management',
    feedback: 'Feedback inbox',
    amenities: 'Amenity catalog',
    faqs: 'Website FAQ',
    offers: 'Offer management',
    settings: 'Hotel settings',
  }
  return titles[page] || 'Hotel admin'
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-md border border-white/60 bg-white/55 px-2 py-2 shadow-sm backdrop-blur sm:px-3">
      <p className="truncate text-[0.62rem] font-black uppercase tracking-[0.08em] text-stone-500 sm:text-xs">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold text-charcoal">{value}</p>
    </div>
  )
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function initials(value) {
  return String(value || 'Hotel')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

function normalizeRoomRateOptions(room = {}) {
  const source = room.rate_options || {}
  const fallbackCategory = Number(room.occupancy_adults || 1) <= 1 ? 'single' : 'double'
  const fallback = {
    basePrice: room.base_price || '',
    offerPrice: room.offer_price || '',
    sizeSqft: room.size_sqft || '',
    physicalRooms: room.physical_rooms || 1,
    occupancyAdults: room.occupancy_adults || (fallbackCategory === 'single' ? 1 : 2),
    occupancyChildren: room.occupancy_children || 0,
    enabled: true,
  }
  return {
    single: {
      enabled: Boolean(source.single) || fallbackCategory === 'single',
      basePrice: source.single?.basePrice ?? (fallbackCategory === 'single' ? fallback.basePrice : ''),
      offerPrice: source.single?.offerPrice ?? (fallbackCategory === 'single' ? fallback.offerPrice : ''),
      sizeSqft: source.single?.sizeSqft ?? (fallbackCategory === 'single' ? fallback.sizeSqft : ''),
      physicalRooms: source.single?.physicalRooms ?? (fallbackCategory === 'single' ? fallback.physicalRooms : 1),
      occupancyAdults: source.single?.occupancyAdults ?? 1,
      occupancyChildren: source.single?.occupancyChildren ?? (fallbackCategory === 'single' ? fallback.occupancyChildren : 2),
    },
    double: {
      enabled: Boolean(source.double) || fallbackCategory === 'double',
      basePrice: source.double?.basePrice ?? (fallbackCategory === 'double' ? fallback.basePrice : ''),
      offerPrice: source.double?.offerPrice ?? (fallbackCategory === 'double' ? fallback.offerPrice : ''),
      sizeSqft: source.double?.sizeSqft ?? (fallbackCategory === 'double' ? fallback.sizeSqft : ''),
      physicalRooms: source.double?.physicalRooms ?? (fallbackCategory === 'double' ? fallback.physicalRooms : 1),
      occupancyAdults: source.double?.occupancyAdults ?? 2,
      occupancyChildren: source.double?.occupancyChildren ?? (fallbackCategory === 'double' ? fallback.occupancyChildren : 2),
    },
  }
}

function getRoomCapacity(room = {}) {
  const rates = normalizeRoomRateOptions(room)
  const rateCapacity = Math.max(0, ...Object.values(rates).filter((option) => option.enabled).map((option) => Number(option.physicalRooms || 0)))
  return rateCapacity || Number(room.physical_rooms || 0)
}

function buildRateOptionsPayload(roomForm) {
  const selected = roomForm.roomCategories?.length ? roomForm.roomCategories : ['single']
  return selected.reduce((options, category) => {
    const option = roomForm.rateOptions[category]
    options[category] = {
      enabled: true,
      basePrice: Number(option.basePrice || 0),
      offerPrice: option.offerPrice === '' ? undefined : Number(option.offerPrice),
      sizeSqft: option.sizeSqft === '' ? undefined : Number(option.sizeSqft),
      physicalRooms: Number(option.physicalRooms || 1),
      occupancyAdults: Number(option.occupancyAdults || (category === 'single' ? 1 : 2)),
      occupancyChildren: Number(option.occupancyChildren || 0),
    }
    return options
  }, {})
}

function offerPreviewDiscount(offer, subtotal) {
  const base = Math.max(0, Number(subtotal || 0))
  const value = Math.max(0, Number(offer?.discount_value || 0))
  const discount = offer?.discount_type === 'percentage' ? base * Math.min(value, 100) / 100 : value
  return Math.round((Math.min(discount, base) + Number.EPSILON) * 100) / 100
}

function offerRoomTargetLabel(offer, rooms = []) {
  const ids = Array.isArray(offer?.room_type_ids) ? offer.room_type_ids : []
  if (!ids.length) return 'All rooms'
  const names = ids.map((id) => rooms.find((room) => room.id === id)?.name).filter(Boolean)
  if (!names.length) return `${ids.length} selected room${ids.length === 1 ? '' : 's'}`
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
}

function formatDate(value) {
  if (!value) return 'TBA'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonthsLocal(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function daysForMonth(days, month) {
  const byDate = new Map(days.map((day) => [toDateInput(day.stay_date), day]))
  const first = startOfMonth(month)
  const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const slots = Array.from({ length: (first.getDay() + 6) % 7 }, () => null)
  for (let day = 1; day <= total; day += 1) {
    const date = new Date(first.getFullYear(), first.getMonth(), day)
    slots.push(byDate.get(toDateInput(date)) || null)
  }
  return slots
}

function toDateInput(value) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return String(value).slice(0, 10)
}

function rateCategoryLabel(value) {
  if (value === 'single') return 'Single'
  if (value === 'double') return 'Double'
  return 'Single and double'
}

function compactMoney(value) {
  const amount = Number(value || 0)
  if (Math.abs(amount) >= 10000000) return `${(amount / 10000000).toFixed(1)}Cr`
  if (Math.abs(amount) >= 100000) return `${(amount / 100000).toFixed(1)}L`
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(1)}k`
  return amount.toLocaleString('en-IN')
}

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function bookingReceiptFileName(booking) {
  return `${booking.invoice_number || `INV-${booking.booking_reference}`}.pdf`
}

function formatProfileValue(value) {
  return String(value || '').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function nextDay(offset) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

function nextMonthDateTime() {
  const date = new Date()
  date.setMonth(date.getMonth() + 1)
  return date.toISOString().slice(0, 16)
}

function toDateTimeLocal(value) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 16)
}
