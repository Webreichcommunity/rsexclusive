import { Link } from 'react-router-dom'
import {
  Accessibility,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CircleUserRound,
  Gift,
  ImagePlus,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { StatusPill } from '../../components/ui/StatusPill.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { uploadImageToCloudinary } from '../../services/cloudinaryUpload.js'
import { logout } from '../auth/firebaseClient.js'

const tabs = [
  ['summary', LayoutDashboard, 'Summary'],
  ['rooms', BedDouble, 'Rooms'],
  ['bookings', CalendarDays, 'Bookings'],
  ['users', UsersRound, 'Users'],
  ['amenities', Sparkles, 'Amenities'],
  ['offers', Gift, 'Offers'],
]

const profileOptions = [
  { avatar: 'avatar-male', gender: 'male', Icon: UserRound },
  { avatar: 'avatar-female', gender: 'female', Icon: CircleUserRound },
  { avatar: 'avatar-transgender', gender: 'transgender', Icon: Accessibility },
]

const emptyRoom = {
  id: '',
  name: '',
  slug: '',
  description: '',
  occupancyAdults: 2,
  occupancyChildren: 1,
  basePrice: '',
  offerPrice: '',
  sizeSqft: '',
  bedType: '',
  customAmenities: '',
  selectedAmenityIds: [],
  image1: '',
  image2: '',
  image3: '',
  showOnHomepage: false,
  active: true,
  physicalRooms: 1,
  inventoryDays: 180,
}

const emptyAmenity = { id: '', name: '', description: '', price: 0, icon: 'sparkles', active: true }
const emptyOffer = {
  id: '',
  title: '',
  description: '',
  code: '',
  discountType: 'percentage',
  discountValue: 10,
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
  adults: 2,
  children: 0,
  guestName: '',
  guestEmail: '',
  guestPhone: '',
  status: 'confirmed',
  totalAmount: '',
}

export function AdminDashboard() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [activePage, setActivePage] = useState('summary')
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [roomForm, setRoomForm] = useState(emptyRoom)
  const [showRoomForm, setShowRoomForm] = useState(false)
  const [amenityForm, setAmenityForm] = useState(emptyAmenity)
  const [offerForm, setOfferForm] = useState(emptyOffer)
  const [bookingForm, setBookingForm] = useState(null)
  const [manualBooking, setManualBooking] = useState(emptyManualBooking)
  const [showManualBooking, setShowManualBooking] = useState(false)
  const [activeUser, setActiveUser] = useState(null)
  const [filters, setFilters] = useState({ rooms: '', bookings: '', bookingStatus: 'all', users: '', amenities: '', offers: '', offerAudience: 'all' })

  const dashboard = useAsync(() => apiFetch('/admin/dashboard'), refreshKey)
  const rooms = useAsync(() => apiFetch('/admin/rooms'), refreshKey)
  const bookings = useAsync(() => apiFetch('/admin/bookings'), refreshKey)
  const users = useAsync(() => apiFetch('/admin/users'), refreshKey)
  const amenities = useAsync(() => apiFetch('/admin/amenities'), refreshKey)
  const offers = useAsync(() => apiFetch('/admin/offers'), refreshKey)

  const roomList = rooms.data?.rooms || []
  const amenityList = amenities.data?.amenities || []
  const bookingList = bookings.data?.bookings || []
  const userList = users.data?.users || []
  const offerList = offers.data?.offers || []

  function refresh(message, type = 'success') {
    setNotice({ type, message })
    setRefreshKey((value) => value + 1)
  }

  function startRoomEdit(room) {
    const amenityItems = Array.isArray(room.amenity_items) ? room.amenity_items : []
    const gallery = Array.isArray(room.gallery) ? room.gallery : []
    setRoomForm({
      id: room.id,
      name: room.name || '',
      slug: room.slug || '',
      description: room.description || '',
      occupancyAdults: room.occupancy_adults || 2,
      occupancyChildren: room.occupancy_children || 0,
      basePrice: room.base_price || '',
      offerPrice: room.offer_price || '',
      sizeSqft: room.size_sqft || '',
      bedType: room.bed_type || '',
      customAmenities: (room.amenities || []).filter((name) => !amenityItems.some((item) => item.name === name)).join(', '),
      selectedAmenityIds: amenityItems.map((item) => item.id).filter(Boolean),
      image1: room.hero_image_url || gallery[0]?.url || '',
      image2: gallery[1]?.url || '',
      image3: gallery[2]?.url || '',
      showOnHomepage: Boolean(room.show_on_homepage),
      active: Boolean(room.active ?? true),
      physicalRooms: room.physical_rooms || 1,
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
      ...selectedAmenities.map((amenity) => ({ id: amenity.id, name: amenity.name, price: Number(amenity.price || 0) })),
      ...customAmenities,
    ]
    const images = [roomForm.image1, roomForm.image2, roomForm.image3].filter(Boolean)
    try {
      const payload = {
        name: roomForm.name,
        slug: roomForm.slug,
        description: roomForm.description,
        occupancyAdults: Number(roomForm.occupancyAdults),
        occupancyChildren: Number(roomForm.occupancyChildren),
        basePrice: Number(roomForm.basePrice),
        offerPrice: roomForm.offerPrice === '' ? undefined : Number(roomForm.offerPrice),
        sizeSqft: roomForm.sizeSqft ? Number(roomForm.sizeSqft) : undefined,
        bedType: roomForm.bedType || undefined,
        amenities: amenityItems.map((item) => item.name),
        amenityItems,
        heroImageUrl: images[0] || undefined,
        gallery: images.map((url, index) => ({ url, alt: `${roomForm.name} image ${index + 1}` })),
        showOnHomepage: Boolean(roomForm.showOnHomepage),
        active: Boolean(roomForm.active),
        physicalRooms: Number(roomForm.physicalRooms),
        inventoryDays: Number(roomForm.inventoryDays),
      }
      if (roomForm.id) await apiFetch(`/admin/rooms/${roomForm.id}`, { method: 'PATCH', body: payload })
      else await apiFetch('/admin/rooms', { method: 'POST', body: payload })
      setRoomForm(emptyRoom)
      setShowRoomForm(false)
      refresh(roomForm.id ? 'Room details updated.' : 'Room category, gallery, amenities and inventory created.')
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
    if (!window.confirm(`Hide ${room.name} from booking and homepage?`)) return
    setSaving(true)
    try {
      await apiFetch(`/admin/rooms/${room.id}`, { method: 'DELETE' })
      refresh('Room hidden from public booking.')
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
      refresh(room.show_on_homepage ? 'Room removed from homepage.' : 'Room featured on homepage.')
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
      refresh('Amenity catalog saved.')
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
      refresh('Amenity deleted.')
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
        imageUrl: offerForm.imageUrl || undefined,
        code: offerForm.code || undefined,
      }
      if (offerForm.id) await apiFetch(`/admin/offers/${offerForm.id}`, { method: 'PATCH', body })
      else await apiFetch('/admin/offers', { method: 'POST', body })
      setOfferForm(emptyOffer)
      refresh('Offer saved and synced to guest pages.')
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
      refresh('Offer deleted.')
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
      refresh('Booking details updated.')
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
      setShowManualBooking(false)
      refresh('Manual booking created.')
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
      refresh('Booking deleted and inventory released.')
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
      refresh('Customer deleted from Firebase Auth and hotel records.')
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  if (dashboard.loading) return <LoadingState label="Loading hotel operations" />

  return (
    <main className="min-h-screen bg-steel/35">
      <div className="container-page py-8">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Hotel admin panel</p>
            <h1 className="page-title">Property command center</h1>
            <p className="page-subtitle">Rooms, offers, guests, bookings, amenities, payments and loyalty signals in one hotel-wise workspace.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/book" className="btn-primary"><CalendarDays size={18} /> Create booking</Link>
            <button className="btn-secondary" type="button" onClick={logout}><LogOut size={18} /> Logout</button>
          </div>
        </header>

        {dashboard.error ? <Notice type="error" message={dashboard.error.message} /> : null}
        {notice ? <Notice type={notice.type} message={notice.message} /> : null}

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Metric icon={CalendarDays} label="Upcoming" value={dashboard.data?.metrics?.upcoming_bookings || 0} />
          <Metric icon={CheckCircle2} label="Confirmed" value={dashboard.data?.metrics?.confirmed_bookings || 0} />
          <Metric icon={IndianRupee} label="Revenue" value={`Rs ${Number(dashboard.data?.metrics?.revenue || 0).toLocaleString('en-IN')}`} />
          <Metric icon={UsersRound} label="Guests" value={dashboard.data?.metrics?.guests || 0} />
          <Metric icon={BedDouble} label="Rooms" value={dashboard.data?.metrics?.rooms || 0} />
          <Metric icon={Gift} label="Live offers" value={dashboard.data?.metrics?.live_offers || 0} />
        </section>

        <div className="mt-7 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border border-mist bg-white p-2 shadow-soft">
              <p className="px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-stone-500">Workspace</p>
              <nav className="grid gap-1">
                {tabs.map(([key, Icon, label]) => (
                  <button
                    key={key}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-bold transition ${activePage === key ? 'bg-charcoal text-white shadow-soft' : 'text-stone-600 hover:bg-bone hover:text-charcoal'}`}
                    type="button"
                    onClick={() => setActivePage(key)}
                  >
                    <Icon size={17} /> {label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <section className="min-w-0 [&>section]:mt-0">
            {activePage === 'summary' ? <SummaryPanel dashboard={dashboard} bookings={bookingList} rooms={roomList} offers={offerList} onTab={setActivePage} /> : null}
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
            {activePage === 'bookings' ? (
              <BookingsPanel
                bookings={bookingList}
                rooms={roomList}
                filters={filters}
                setFilters={setFilters}
                manualBooking={manualBooking}
                setManualBooking={setManualBooking}
                showManualBooking={showManualBooking}
                setShowManualBooking={setShowManualBooking}
                saving={saving}
                onCreateManual={createManualBooking}
                onEdit={openBookingEditor}
                onDelete={deleteBooking}
              />
            ) : null}
            {activePage === 'users' ? <UsersPanel users={userList} filters={filters} setFilters={setFilters} saving={saving} onOpen={openUserProfile} onDelete={deleteCustomer} /> : null}
            {activePage === 'amenities' ? <AmenitiesPanel amenities={amenityList} form={amenityForm} setForm={setAmenityForm} filters={filters} setFilters={setFilters} saving={saving} onSave={saveAmenity} onDelete={deleteAmenity} /> : null}
            {activePage === 'offers' ? <OffersPanel offers={offerList} form={offerForm} setForm={setOfferForm} filters={filters} setFilters={setFilters} saving={saving} onSave={saveOffer} onDelete={deleteOffer} /> : null}
          </section>
        </div>
      </div>

      {bookingForm ? <BookingEditor form={bookingForm} setForm={setBookingForm} saving={saving} onSubmit={updateBooking} onDelete={deleteBooking} onClose={() => setBookingForm(null)} /> : null}
      {activeUser ? <UserProfileModal profile={activeUser} saving={saving} onDelete={deleteCustomer} onClose={() => setActiveUser(null)} /> : null}
    </main>
  )
}

function SummaryPanel({ dashboard, bookings, rooms, offers, onTab }) {
  return (
    <section className="mt-7 grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="panel overflow-hidden">
        <PanelHeader icon={CalendarDays} title="Upcoming arrivals" action={<button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => onTab('bookings')}>Manage bookings</button>} />
        {(dashboard.data?.arrivals || []).length ? (
          <div className="grid divide-y divide-mist">
            {dashboard.data.arrivals.map((booking) => (
              <div key={booking.booking_reference} className="grid gap-3 p-4 md:grid-cols-[1fr_170px_120px] md:items-center">
                <div>
                  <p className="font-bold">{booking.guest_name}</p>
                  <p className="text-sm text-stone-500">{booking.booking_reference}</p>
                </div>
                <p className="text-sm font-semibold text-stone-600">{formatDate(booking.check_in)} to {formatDate(booking.check_out)}</p>
                <StatusPill status={booking.status} />
              </div>
            ))}
          </div>
        ) : <EmptyState title="No upcoming arrivals" text="Confirmed arrivals will appear here." />}
      </div>
      <div className="grid gap-6">
        <div className="panel p-5">
          <PanelMiniTitle icon={BedDouble} title="Quick health" />
          <div className="mt-4 grid gap-3">
            <StatRow label="Homepage room banners" value={`${rooms.filter((room) => room.show_on_homepage).length}/3 featured`} />
            <StatRow label="Rooms with offer price" value={rooms.filter((room) => room.offer_price).length} />
            <StatRow label="Active offer rules" value={offers.filter((offer) => offer.active).length} />
            <StatRow label="Bookings in system" value={bookings.length} />
          </div>
        </div>
        <div className="panel p-5">
          <PanelMiniTitle icon={Gift} title="Offer logic" />
          <p className="mt-3 text-sm leading-6 text-stone-600">General offers show to every visitor. Personalized repeat-guest offers show only after the user's confirmed or completed booking count reaches the configured threshold. When selected in checkout, the offer discounts the room subtotal before tax and is revalidated before payment order creation.</p>
        </div>
      </div>
    </section>
  )
}

function RoomsPanel({ rooms, amenities, filters, setFilters, roomForm, setRoomForm, showRoomForm, setShowRoomForm, saving, onSave, onUpload, onEdit, onDelete, onToggleHomepage }) {
  const filteredRooms = filterByText(rooms, filters.rooms, ['name', 'description', 'bed_type'])
  return (
    <section className="mt-7 grid gap-6 xl:grid-cols-[430px_1fr]">
      <div className="panel p-5">
        <div className="flex items-center justify-between gap-3">
          <PanelMiniTitle icon={Plus} title={roomForm.id ? 'Edit room' : 'Add room'} />
          <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => {
            setRoomForm(emptyRoom)
            setShowRoomForm((value) => !value)
          }}>
            <Plus size={16} /> {showRoomForm ? 'Close' : 'New room'}
          </button>
        </div>
        {showRoomForm ? (
          <form onSubmit={onSave} className="mt-5 grid gap-4">
            <Field label="Room name"><input className="input" value={roomForm.name} onChange={(event) => setRoomForm({ ...roomForm, name: event.target.value, slug: roomForm.slug || slugify(event.target.value) })} required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Slug"><input className="input" value={roomForm.slug} onChange={(event) => setRoomForm({ ...roomForm, slug: slugify(event.target.value) })} required /></Field>
              <Field label="Bed type"><input className="input" value={roomForm.bedType} onChange={(event) => setRoomForm({ ...roomForm, bedType: event.target.value })} /></Field>
              <Field label="Regular price"><input className="input" type="number" min="0" value={roomForm.basePrice} onChange={(event) => setRoomForm({ ...roomForm, basePrice: event.target.value })} required /></Field>
              <Field label="Offer price"><input className="input" type="number" min="0" value={roomForm.offerPrice} onChange={(event) => setRoomForm({ ...roomForm, offerPrice: event.target.value })} /></Field>
              <Field label="Size sq ft"><input className="input" type="number" min="1" value={roomForm.sizeSqft} onChange={(event) => setRoomForm({ ...roomForm, sizeSqft: event.target.value })} /></Field>
              <Field label="Physical rooms"><input className="input" type="number" min="1" value={roomForm.physicalRooms} onChange={(event) => setRoomForm({ ...roomForm, physicalRooms: event.target.value })} disabled={Boolean(roomForm.id)} /></Field>
            </div>
            <Field label="Description"><textarea className="input min-h-24 py-3" value={roomForm.description} onChange={(event) => setRoomForm({ ...roomForm, description: event.target.value })} required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Adults"><input className="input" type="number" min="1" value={roomForm.occupancyAdults} onChange={(event) => setRoomForm({ ...roomForm, occupancyAdults: event.target.value })} /></Field>
              <Field label="Children"><input className="input" type="number" min="0" value={roomForm.occupancyChildren} onChange={(event) => setRoomForm({ ...roomForm, occupancyChildren: event.target.value })} /></Field>
            </div>
            <div>
              <span className="label">Amenity catalog</span>
              <div className="grid gap-2 rounded-md border border-mist bg-white p-3">
                {amenities.filter((amenity) => amenity.active).length ? amenities.filter((amenity) => amenity.active).map((amenity) => (
                  <label key={amenity.id} className="flex items-center justify-between gap-3 text-sm font-semibold">
                    <span className="flex items-center gap-2"><input type="checkbox" checked={roomForm.selectedAmenityIds.includes(amenity.id)} onChange={(event) => {
                      setRoomForm({
                        ...roomForm,
                        selectedAmenityIds: event.target.checked
                          ? [...roomForm.selectedAmenityIds, amenity.id]
                          : roomForm.selectedAmenityIds.filter((id) => id !== amenity.id),
                      })
                    }} /> {amenity.name}</span>
                    <span className="text-stone-500">Rs {Number(amenity.price || 0).toLocaleString('en-IN')}</span>
                  </label>
                )) : <p className="text-sm text-stone-500">Add amenities from the Amenities page, or type custom ones below.</p>}
              </div>
            </div>
            <Field label="Extra amenities"><input className="input" placeholder="Balcony, bathtub, minibar" value={roomForm.customAmenities} onChange={(event) => setRoomForm({ ...roomForm, customAmenities: event.target.value })} /></Field>
            <div className="grid gap-3">
              {['image1', 'image2', 'image3'].map((field, index) => (
                <div key={field}>
                  <span className="label">Image {index + 1}</span>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input className="input" type="url" value={roomForm[field]} onChange={(event) => setRoomForm({ ...roomForm, [field]: event.target.value })} placeholder="https://..." />
                    <label className="btn-secondary !min-h-12 cursor-pointer">
                      <ImagePlus size={17} /> Upload
                      <input className="hidden" type="file" accept="image/*" onChange={(event) => onUpload(event.target.files?.[0], field)} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold">
                <input type="checkbox" checked={roomForm.showOnHomepage} onChange={(event) => setRoomForm({ ...roomForm, showOnHomepage: event.target.checked })} />
                Homepage banner
              </label>
              <label className="flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold">
                <input type="checkbox" checked={roomForm.active} onChange={(event) => setRoomForm({ ...roomForm, active: event.target.checked })} />
                Active room
              </label>
            </div>
            <button className="btn-primary w-full" type="submit" disabled={saving}><Plus size={18} /> {saving ? 'Saving...' : roomForm.id ? 'Save room' : 'Create room'}</button>
          </form>
        ) : <p className="mt-4 rounded-md bg-ivory p-4 text-sm font-semibold leading-6 text-stone-600">Use the New room button to open the full room form. Existing categories stay searchable on the right.</p>}
      </div>

      <div className="panel overflow-hidden">
        <PanelHeader icon={BedDouble} title="Room management" action={<SearchBox value={filters.rooms} onChange={(value) => setFilters({ ...filters, rooms: value })} placeholder="Search rooms" />} />
        {filteredRooms.length ? (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {filteredRooms.map((room) => <RoomCard key={room.id} room={room} onEdit={onEdit} onDelete={onDelete} onToggleHomepage={onToggleHomepage} />)}
          </div>
        ) : <EmptyState title="No rooms found" text="Try a different search, or add a new room category." />}
      </div>
    </section>
  )
}

function BookingsPanel({ bookings, rooms, filters, setFilters, manualBooking, setManualBooking, showManualBooking, setShowManualBooking, saving, onCreateManual, onEdit, onDelete }) {
  const filtered = filterByText(bookings, filters.bookings, ['guest_name', 'guest_email', 'booking_reference', 'room_type_name']).filter((booking) => filters.bookingStatus === 'all' || booking.status === filters.bookingStatus)
  const upcoming = filtered.filter((booking) => ['confirmed', 'payment_pending'].includes(booking.status) && String(booking.check_in) >= nextDay(0))
  const completed = filtered.filter((booking) => ['completed', 'cancelled', 'failed'].includes(booking.status) || String(booking.check_out) < nextDay(0))
  return (
    <section className="mt-7 grid gap-6">
      <div className="panel p-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <PanelMiniTitle icon={Plus} title="Manual booking" />
          <button className="btn-secondary !min-h-10 !px-4" type="button" onClick={() => setShowManualBooking((value) => !value)}><Plus size={16} /> {showManualBooking ? 'Close' : 'New manual booking'}</button>
        </div>
        {showManualBooking ? (
          <form onSubmit={onCreateManual} className="mt-5 grid gap-4 md:grid-cols-4">
            <Field label="Room"><select className="input" value={manualBooking.roomTypeId} onChange={(event) => setManualBooking({ ...manualBooking, roomTypeId: event.target.value })} required><option value="">Select room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field>
            <Field label="Check-in"><input className="input" type="date" value={manualBooking.checkIn} onChange={(event) => setManualBooking({ ...manualBooking, checkIn: event.target.value })} required /></Field>
            <Field label="Check-out"><input className="input" type="date" value={manualBooking.checkOut} onChange={(event) => setManualBooking({ ...manualBooking, checkOut: event.target.value })} required /></Field>
            <Field label="Status"><select className="input" value={manualBooking.status} onChange={(event) => setManualBooking({ ...manualBooking, status: event.target.value })}><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="completed">Completed</option></select></Field>
            <Field label="Guest name"><input className="input" value={manualBooking.guestName} onChange={(event) => setManualBooking({ ...manualBooking, guestName: event.target.value })} required /></Field>
            <Field label="Guest email"><input className="input" type="email" value={manualBooking.guestEmail} onChange={(event) => setManualBooking({ ...manualBooking, guestEmail: event.target.value })} required /></Field>
            <Field label="Phone"><input className="input" value={manualBooking.guestPhone} onChange={(event) => setManualBooking({ ...manualBooking, guestPhone: event.target.value })} /></Field>
            <Field label="Final amount"><input className="input" type="number" min="0" value={manualBooking.totalAmount} onChange={(event) => setManualBooking({ ...manualBooking, totalAmount: event.target.value })} /></Field>
            <div className="grid gap-4 md:col-span-4 md:grid-cols-4">
              <Field label="Rooms"><input className="input" type="number" min="1" value={manualBooking.roomsCount} onChange={(event) => setManualBooking({ ...manualBooking, roomsCount: event.target.value })} /></Field>
              <Field label="Adults"><input className="input" type="number" min="1" value={manualBooking.adults} onChange={(event) => setManualBooking({ ...manualBooking, adults: event.target.value })} /></Field>
              <Field label="Children"><input className="input" type="number" min="0" value={manualBooking.children} onChange={(event) => setManualBooking({ ...manualBooking, children: event.target.value })} /></Field>
              <button className="btn-primary mt-6" disabled={saving} type="submit">Create booking</button>
            </div>
          </form>
        ) : null}
      </div>
      <div className="panel overflow-hidden">
        <PanelHeader icon={CalendarDays} title="Booking management" action={<BookingFilters filters={filters} setFilters={setFilters} />} />
        <BookingSection title="Upcoming bookings" bookings={upcoming} saving={saving} onEdit={onEdit} onDelete={onDelete} />
        <BookingSection title="Completed and closed bookings" bookings={completed} saving={saving} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </section>
  )
}

function UsersPanel({ users, filters, setFilters, saving, onOpen, onDelete }) {
  const filtered = filterByText(users, filters.users, ['full_name', 'email', 'phone'])
  return (
    <section className="mt-7">
      <div className="panel overflow-hidden">
        <PanelHeader icon={UsersRound} title="User profiles" action={<SearchBox value={filters.users} onChange={(value) => setFilters({ ...filters, users: value })} placeholder="Search users" />} />
        {filtered.length ? (
          <div className="grid divide-y divide-mist">
            {filtered.map((user) => (
              <article key={user.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_140px_160px_220px] lg:items-center">
                <div className="flex min-w-0 gap-3">
                  <Avatar id={user.profile?.avatar} gender={user.profile?.gender} />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold">{user.full_name || 'Guest user'}</p>
                    <p className="truncate text-sm font-semibold text-stone-500">{user.email}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-500">{user.phone || user.profile?.city || 'Profile details pending'}</p>
                  </div>
                </div>
                <Stat label="Bookings" value={user.bookings || 0} />
                <Stat label="Revenue" value={`Rs ${Number(user.revenue || 0).toLocaleString('en-IN')}`} />
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => onOpen(user)}><UserRound size={16} /> Open profile</button>
                  <button className="btn-secondary !min-h-10 !px-3 text-red-700" type="button" disabled={saving} onClick={() => onDelete(user)}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyState title="No users found" text="Customers appear after signup or booking activity." />}
      </div>
    </section>
  )
}

function AmenitiesPanel({ amenities, form, setForm, filters, setFilters, saving, onSave, onDelete }) {
  const filtered = filterByText(amenities, filters.amenities, ['name', 'description'])
  return (
    <section className="mt-7 grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={onSave} className="panel p-5">
        <PanelMiniTitle icon={Sparkles} title={form.id ? 'Edit amenity' : 'Add amenity'} />
        <div className="mt-5 grid gap-4">
          <Field label="Amenity name"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Price"><input className="input" type="number" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
          <Field label="Description"><textarea className="input min-h-24 py-3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <label className="flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active</label>
          <button className="btn-primary" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save amenity'}</button>
          {form.id ? <button className="btn-secondary" type="button" onClick={() => setForm(emptyAmenity)}>Cancel edit</button> : null}
        </div>
      </form>
      <div className="panel overflow-hidden">
        <PanelHeader icon={Sparkles} title="Amenity catalog" action={<SearchBox value={filters.amenities} onChange={(value) => setFilters({ ...filters, amenities: value })} placeholder="Search amenities" />} />
        {filtered.length ? (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {filtered.map((amenity) => (
              <article key={amenity.id} className="rounded-md border border-mist bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="icon-tile"><Sparkles size={18} /></span>
                  <StatusPill status={amenity.active ? 'active' : 'inactive'} />
                </div>
                <h3 className="mt-4 text-xl font-extrabold">{amenity.name}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{amenity.description || 'Visible in room setup and hotel experience.'}</p>
                <p className="mt-4 font-black">Rs {Number(amenity.price || 0).toLocaleString('en-IN')}</p>
                <div className="mt-4 flex gap-2">
                  <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => setForm({ id: amenity.id, name: amenity.name, description: amenity.description || '', price: amenity.price || 0, icon: amenity.icon || 'sparkles', active: amenity.active })}><Pencil size={16} /> Edit</button>
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

function OffersPanel({ offers, form, setForm, filters, setFilters, saving, onSave, onDelete }) {
  const filtered = filterByText(offers, filters.offers, ['title', 'description', 'code']).filter((offer) => filters.offerAudience === 'all' || offer.audience_type === filters.offerAudience)
  const previewSubtotal = 10000
  const previewDiscount = offerPreviewDiscount({ discount_type: form.discountType, discount_value: form.discountValue }, previewSubtotal)
  return (
    <section className="mt-7 grid gap-6 xl:grid-cols-[430px_1fr]">
      <form onSubmit={onSave} className="panel p-5">
        <PanelMiniTitle icon={Gift} title={form.id ? 'Edit offer' : 'Create offer'} />
        <div className="mt-5 grid gap-4">
          <Field label="Offer title"><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></Field>
          <Field label="Description"><textarea className="input min-h-24 py-3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code"><input className="input" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field>
            <Field label="Badge"><input className="input" value={form.badge} onChange={(event) => setForm({ ...form, badge: event.target.value })} /></Field>
            <Field label="Discount type"><select className="input" value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></Field>
            <Field label="Discount value"><input className="input" type="number" min="0" value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} required /></Field>
            <Field label="Starts"><input className="input" type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} required /></Field>
            <Field label="Ends"><input className="input" type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} required /></Field>
          </div>
          <Field label="Audience"><select className="input" value={form.audienceType} onChange={(event) => setForm({ ...form, audienceType: event.target.value })}><option value="general">General offer</option><option value="repeat_guest">Personalized repeat guest</option></select></Field>
          {form.audienceType === 'repeat_guest' ? <Field label="Minimum bookings"><input className="input" type="number" min="1" value={form.minCompletedBookings} onChange={(event) => setForm({ ...form, minCompletedBookings: event.target.value })} /></Field> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Highlight color"><input className="input h-12" type="color" value={form.highlightColor} onChange={(event) => setForm({ ...form, highlightColor: event.target.value })} /></Field>
            <label className="mt-6 flex min-h-12 items-center gap-3 rounded-md border border-mist bg-white px-3 text-sm font-bold"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active</label>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-extrabold text-amber-900">Calculation preview</p>
            <p className="mt-1 font-semibold leading-6 text-stone-600">On a Rs {previewSubtotal.toLocaleString('en-IN')} room subtotal, this offer saves Rs {previewDiscount.toLocaleString('en-IN')}. Tax is calculated after discount.</p>
          </div>
          <button className="btn-primary" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save offer'}</button>
          {form.id ? <button className="btn-secondary" type="button" onClick={() => setForm(emptyOffer)}>Cancel edit</button> : null}
        </div>
      </form>
      <div className="panel overflow-hidden">
        <PanelHeader icon={Gift} title="Offer rules" action={<OfferFilters filters={filters} setFilters={setFilters} />} />
        {filtered.length ? (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {filtered.map((offer) => (
              <article key={offer.id} className="relative overflow-hidden rounded-md border border-mist bg-white p-4">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: offer.highlight_color || '#f59e0b' }} />
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-md bg-amber-50 px-3 py-2 text-xs font-black uppercase text-amber-700">{offer.audience_type === 'repeat_guest' ? 'Personalized' : 'General'}</span>
                  <StatusPill status={offer.active ? 'active' : 'inactive'} />
                </div>
                <h3 className="mt-4 text-xl font-extrabold">{offer.title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{offer.description}</p>
                <div className="mt-4 grid gap-2 text-sm font-semibold text-stone-600">
                  <span>{offer.discount_type === 'percentage' ? `${Number(offer.discount_value)}% off` : `Rs ${Number(offer.discount_value).toLocaleString('en-IN')} off`}</span>
                  <span>Saves Rs {offerPreviewDiscount(offer, 10000).toLocaleString('en-IN')} on Rs 10,000 before tax</span>
                  {offer.code ? <span>Code: {offer.code}</span> : null}
                  {offer.audience_type === 'repeat_guest' ? <span>Shows after {offer.min_completed_bookings} booking(s)</span> : null}
                  <span>{formatDate(offer.starts_at)} to {formatDate(offer.ends_at)}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => setForm({
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
                  })}><Pencil size={16} /> Edit</button>
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

function RoomCard({ room, onEdit, onDelete, onToggleHomepage }) {
  const amenityItems = Array.isArray(room.amenity_items) ? room.amenity_items : []
  return (
    <article className="rounded-md border border-mist bg-white p-4">
      {room.hero_image_url ? <img src={room.hero_image_url} alt={room.name} className="mb-4 h-44 w-full rounded-md object-cover" /> : null}
      <div className="flex items-start justify-between gap-4">
        <span className="icon-tile"><BedDouble size={20} /></span>
        <div className="flex flex-col items-end gap-2">
          <StatusPill status={room.active ? 'active' : 'inactive'} />
          {room.show_on_homepage ? <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Homepage banner</span> : null}
        </div>
      </div>
      <h3 className="mt-4 text-lg font-extrabold">{room.name}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">{room.description}</p>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Stat label="Regular" value={`Rs ${Number(room.base_price).toLocaleString('en-IN')}`} />
        <Stat label="Offer" value={room.offer_price ? `Rs ${Number(room.offer_price).toLocaleString('en-IN')}` : '-'} />
        <Stat label="Physical rooms" value={room.physical_rooms || 0} />
        <Stat label="Lowest available" value={room.lowest_available_rooms ?? 0} />
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {(amenityItems.length ? amenityItems : (room.amenities || []).map((name) => ({ name }))).slice(0, 4).map((item) => <span key={item.id || item.name} className="rounded-md bg-bone px-2 py-1 text-xs font-bold text-stone-600">{item.name}{item.price ? ` / Rs ${Number(item.price).toLocaleString('en-IN')}` : ''}</span>)}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => onEdit(room)}><Pencil size={16} /> Edit</button>
        <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={() => onToggleHomepage(room)}><Tag size={16} /> {room.show_on_homepage ? 'Unfeature' : 'Feature'}</button>
        <button className="btn-secondary !min-h-10 !px-3 text-red-700" type="button" onClick={() => onDelete(room)}><Trash2 size={16} /></button>
      </div>
    </article>
  )
}

function BookingSection({ title, bookings, saving, onEdit, onDelete }) {
  return (
    <section className="border-t border-mist">
      <div className="bg-bone/60 px-5 py-3">
        <h3 className="font-extrabold">{title}</h3>
      </div>
      {bookings.length ? (
        <div className="grid divide-y divide-mist">
          {bookings.map((booking) => (
            <article key={booking.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_170px_120px_140px_100px] lg:items-center">
              <div>
                <p className="font-bold">{booking.guest_name}</p>
                <p className="text-sm text-stone-500">{booking.room_type_name} / {booking.booking_reference}</p>
              </div>
              <p className="text-sm font-semibold text-stone-600">{formatDate(booking.check_in)} to {formatDate(booking.check_out)}</p>
              <StatusPill status={booking.status} />
              <p className="font-extrabold">Rs {Number(booking.total_amount).toLocaleString('en-IN')}</p>
              <div className="flex gap-2">
                <button className="grid h-10 w-10 place-items-center rounded-md border border-mist bg-white" type="button" title="Open details" onClick={() => onEdit(booking)}><Pencil size={16} /></button>
                <button className="grid h-10 w-10 place-items-center rounded-md border border-red-200 bg-red-50 text-red-700" type="button" disabled={saving} title="Delete" onClick={() => onDelete(booking)}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title={`No ${title.toLowerCase()}`} text="Bookings will appear here automatically." />}
    </section>
  )
}

function BookingEditor({ form, setForm, saving, onSubmit, onDelete, onClose }) {
  return (
    <Modal onClose={onClose} width="max-w-3xl">
      <form onSubmit={onSubmit} className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Booking details</p>
            <h2 className="mt-1 text-3xl font-semibold">{form.booking_reference}</h2>
            <p className="mt-1 text-sm font-semibold text-stone-500">{form.room_type_name} / {formatDate(form.check_in)} to {formatDate(form.check_out)}</p>
          </div>
          <button className="btn-secondary !min-h-10 !px-3" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Guest name"><input className="input" value={form.guestName} onChange={(event) => setForm({ ...form, guestName: event.target.value })} required /></Field>
          <Field label="Guest email"><input className="input" type="email" value={form.guestEmail} onChange={(event) => setForm({ ...form, guestEmail: event.target.value })} required /></Field>
          <Field label="Guest phone"><input className="input" value={form.guestPhone} onChange={(event) => setForm({ ...form, guestPhone: event.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Adults"><input className="input" type="number" min="1" value={form.adults} onChange={(event) => setForm({ ...form, adults: event.target.value })} /></Field>
            <Field label="Children"><input className="input" type="number" min="0" value={form.children} onChange={(event) => setForm({ ...form, children: event.target.value })} /></Field>
          </div>
          <div className="rounded-md bg-bone p-3 text-sm sm:col-span-2">
            <Line label="Payment total" value={`Rs ${Number(form.total_amount || 0).toLocaleString('en-IN')}`} />
            <Line label="Payment order" value={form.razorpay_order_id || 'Manual / pending'} />
            <Line label="Status" value={form.status} />
          </div>
          <Field label="Internal note"><textarea className="input min-h-24 py-3 sm:col-span-2" value={form.internalNote} onChange={(event) => setForm({ ...form, internalNote: event.target.value })} /></Field>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button className="btn-primary flex-1" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save booking details'}</button>
          <button className="btn-secondary text-red-700" disabled={saving} type="button" onClick={() => onDelete(form)}><Trash2 size={16} /> Delete</button>
        </div>
      </form>
    </Modal>
  )
}

function UserProfileModal({ profile, saving, onDelete, onClose }) {
  const user = profile.user
  return (
    <Modal onClose={onClose} width="max-w-4xl">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <Avatar id={user?.profile?.avatar} gender={user?.profile?.gender} />
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
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
        <option value="failed">Failed</option>
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

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric-card">
      <span className="icon-tile"><Icon size={20} /></span>
      <p className="mt-4 text-2xl font-extrabold">{value}</p>
      <p className="mt-1 text-sm font-semibold text-stone-500">{label}</p>
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

function StatRow({ label, value }) {
  return <div className="flex items-center justify-between gap-4 rounded-md bg-ivory p-3 text-sm"><span className="font-semibold text-stone-600">{label}</span><span className="font-black">{value}</span></div>
}

function PanelHeader({ icon: Icon, title, action }) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-mist p-5 md:flex-row md:items-center">
      <PanelMiniTitle icon={Icon} title={title} />
      {action}
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

function Avatar({ id = 'avatar-male', gender }) {
  const option = profileOptions.find((item) => item.avatar === id || item.gender === gender) || profileOptions[0]
  const Icon = option.Icon
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amberline to-wine text-white shadow-soft"><Icon size={22} /></span>
}

function Line({ label, value }) {
  return <div className="flex justify-between gap-4"><span className="text-stone-500">{label}</span><span className="text-right font-bold text-charcoal">{value}</span></div>
}

function filterByText(items, query, keys) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => keys.some((key) => String(item[key] || '').toLowerCase().includes(needle)))
}

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

function offerPreviewDiscount(offer, subtotal) {
  const base = Math.max(0, Number(subtotal || 0))
  const value = Math.max(0, Number(offer?.discount_value || 0))
  const discount = offer?.discount_type === 'percentage' ? base * Math.min(value, 100) / 100 : value
  return Math.round((Math.min(discount, base) + Number.EPSILON) * 100) / 100
}

function formatDate(value) {
  if (!value) return 'TBA'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function formatProfileValue(value) {
  return String(value || '').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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
