import {
  Bath,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Gift,
  MapPin,
  Sparkles,
  Star,
  Utensils,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { Seo } from '../../components/seo/Seo.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { resolveTenantFromLocation } from '../tenant/resolveTenant.js'

const fallbackHotelImage = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=80'
const fallbackRoomImage = 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80'
const diningImage = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80'
const loungeImage = 'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?auto=format&fit=crop&w=1400&q=80'

function defaultDates() {
  const start = new Date()
  start.setDate(start.getDate() + 1)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
}

export function HotelExperience() {
  const { data, loading, error } = useAsync(() => apiFetch('/tenant'))
  const [defaultCheckIn, defaultCheckOut] = defaultDates()
  const [search, setSearch] = useState({ checkIn: defaultCheckIn, checkOut: defaultCheckOut, adults: 2, children: 0, roomsCount: 1 })

  if (loading) return <LoadingState label="Opening hotel" />
  if (error) return <TenantError error={error} />

  const { hotel, rooms, offers = [], amenities = [] } = data
  const heroImage = hotel.hero_image_url || fallbackHotelImage
  const heroVideo = getBackgroundVideoSource(hotel.branding?.youtubeEmbedUrl)
  const featuredRoom = rooms[0]
  const bookingUrl = withTenantQuery(`/book?checkIn=${search.checkIn}&checkOut=${search.checkOut}&adults=${search.adults}&children=${search.children}&roomsCount=${search.roomsCount}`)
  const featuredRooms = rooms.filter((room) => room.show_on_homepage).slice(0, 3)
  const homepageRooms = (featuredRooms.length ? featuredRooms : rooms.slice(0, 3))
  const galleryImages = [
    heroImage,
    featuredRoom?.hero_image_url || fallbackRoomImage,
    rooms[1]?.hero_image_url || loungeImage,
    hotel.branding?.showcaseImageUrl || diningImage,
  ]

  return (
    <main className="overflow-hidden bg-white">
      <Seo
        title={`${hotel.name} | Premium Stays`}
        description={hotel.description}
        image={heroImage}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'Hotel',
          name: hotel.name,
          description: hotel.description,
          image: heroImage,
          address: hotel.address,
          telephone: hotel.contact?.phone,
        }}
      />

      <section className="relative min-h-[calc(100vh-72px)] overflow-hidden">
        <HeroBackground media={heroVideo} image={heroImage} hotelName={hotel.name} />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/54 to-black/28" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/24 via-transparent to-black/24" />

        <div className="container-page relative grid min-h-[calc(100vh-72px)] items-center gap-8 py-10 lg:grid-cols-[1fr_440px]">
          <FadeIn viewport={false} className="max-w-3xl text-white">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/78">{hotel.branding?.tone || 'Independent luxury hotel'}</p>
            <h1 className="mt-5 bg-gradient-to-r from-white via-[#f4d7d7] to-[#8f1d1d] bg-clip-text text-5xl font-black leading-tight text-transparent drop-shadow-[0_4px_24px_rgba(0,0,0,0.48)] md:text-7xl">{hotel.name}</h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/90 md:text-lg">{hotel.description}</p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold text-white/90">
              <span className="inline-flex items-center gap-2 rounded-md border border-white/70 bg-white/95 px-4 py-3 text-charcoal shadow-soft backdrop-blur-md"><MapPin size={16} className="text-amberline" /> {hotel.address?.city || 'Prime location'}</span>
              <span className="rounded-md border border-white/70 bg-white/95 px-4 py-3 text-charcoal shadow-soft backdrop-blur-md">{rooms.length} room categor{rooms.length === 1 ? 'y' : 'ies'}</span>
            </div>
          </FadeIn>

          <FadeIn viewport={false} delay={0.18}>
            <form
              className="rounded-lg border border-white/30 bg-white/14 p-4 text-white shadow-2xl shadow-black/20 backdrop-blur-md md:p-5 [&_.date-button]:border-white/30 [&_.date-button]:bg-white/78 [&_.input]:border-white/30 [&_.input]:bg-white/78 [&_.label]:!text-white"
              onSubmit={(event) => event.preventDefault()}
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/78">Reserve directly</p>
              <h2 className="mt-2 text-2xl font-black text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.35)]">Plan your stay</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DatePicker label="Check-in" value={search.checkIn} onChange={(value) => setSearch((current) => ({ ...current, checkIn: value }))} />
                <DatePicker label="Check-out" value={search.checkOut} min={addDays(search.checkIn, 1)} onChange={(value) => setSearch((current) => ({ ...current, checkOut: value }))} />
                <Field label="Adults"><input className="input" type="number" min="1" value={search.adults} onChange={(event) => setSearch({ ...search, adults: Number(event.target.value) })} /></Field>
                <Field label="Children"><input className="input" type="number" min="0" value={search.children} onChange={(event) => setSearch({ ...search, children: Number(event.target.value) })} /></Field>
                <Field label="Rooms"><input className="input" type="number" min="1" value={search.roomsCount} onChange={(event) => setSearch({ ...search, roomsCount: Number(event.target.value) })} /></Field>
              </div>
              <Link to={bookingUrl} className="btn-primary mt-5 w-full"><CalendarDays size={18} /> Search Rooms</Link>
            </form>
          </FadeIn>
        </div>
      </section>

      {offers.length ? (
        <section id="offers" className="container-page pt-10">
          <OfferShowcase offers={offers} bookingUrl={bookingUrl} />
        </section>
      ) : null}

      <section id="rooms" className="container-page section-pad">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Rooms and suites</p>
            <h2 className="page-title">Choose your stay</h2>
            <p className="page-subtitle">Browse room categories right after live offers, then continue with the offer already selected for checkout.</p>
          </div>
          <Link to={bookingUrl} className="btn-primary w-full sm:w-auto"><CalendarDays size={18} /> Search dates</Link>
        </div>
        {homepageRooms.length ? (
          <Stagger className="flex snap-x gap-4 overflow-x-auto pb-3 md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
            {homepageRooms.map((room) => <RoomShowcase key={room.id} room={room} bookingUrl={bookingUrl} />)}
          </Stagger>
        ) : (
          <FadeIn className="panel p-8 text-center">
            <h3 className="text-3xl font-bold">Rooms are being prepared</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">The hotel admin has not opened room inventory yet.</p>
          </FadeIn>
        )}
      </section>

      <section id="hotel" className="container-page section-pad">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <FadeIn className="order-2 lg:order-1">
            <p className="eyebrow">Hotel</p>
            <h2 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">A stay shaped around arrival, comfort, and the details guests remember.</h2>
            <p className="mt-5 text-base leading-8 text-stone-600">{hotel.description}</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Feature icon={Utensils} title="Dining" text="Warm service and polished cuisine." />
              <Feature icon={Bath} title="Comfort" text="Thoughtful policies and guest rituals." />
              <Feature icon={BedDouble} title="Rooms" text="Curated room categories for every stay." />
            </div>
          </FadeIn>
          <HotelMedia hotel={hotel} heroImage={heroImage} />
        </div>
      </section>

      <section id="dining" className="bg-charcoal text-white">
        <div className="container-page grid gap-10 py-16 md:py-24 lg:grid-cols-[1fr_0.95fr] lg:items-center">
          <FadeIn className="order-2 lg:order-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-stone-400">Dining and atmosphere</p>
            <h2 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">Evenings shaped by quiet service and generous detail.</h2>
            <p className="mt-6 max-w-xl text-sm leading-7 text-stone-300">
              From breakfast service to late conversations, the hotel experience is built around calm spaces, attentive teams, and a sense of place.
            </p>
          </FadeIn>
          <FadeIn className="image-lift order-1 lg:order-2">
            <img src={diningImage} alt="Fine dining" loading="lazy" className="h-[440px] w-full object-cover" />
          </FadeIn>
        </div>
      </section>

      <section id="experience" className="container-page section-pad">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Experience and amenities</p>
            <h2 className="page-title">Everything guests notice after check-in</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(amenities.length ? amenities : fallbackAmenities).slice(0, 8).map((amenity) => <AmenityCard key={amenity.id || amenity.name} amenity={amenity} />)}
        </div>
      </section>

      <section id="gallery" className="container-page pb-16 md:pb-24">
        <Stagger className="grid gap-3 md:grid-cols-4 md:grid-rows-[220px_220px]">
          {galleryImages.map((image, index) => (
            <StaggerItem key={`${image}-${index}`} className={`image-lift ${index === 0 ? 'md:col-span-2 md:row-span-2' : ''}`}>
              <img src={image} alt={`${hotel.name} gallery ${index + 1}`} loading={index ? 'lazy' : 'eager'} className="h-full min-h-56 w-full object-cover" />
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </main>
  )
}

const fallbackAmenities = [
  { name: 'Premium linen', description: 'Soft bedding and daily room care.', price: 0 },
  { name: 'Housekeeping', description: 'Reliable service throughout the stay.', price: 0 },
  { name: 'Dining access', description: 'Breakfast and dining support.', price: 0 },
  { name: 'Secure booking', description: 'Direct confirmation and payment.', price: 0 },
]

function HeroBackground({ media, image, hotelName }) {
  if (media?.type === 'youtube') {
    return (
      <motion.div
        className="pointer-events-none absolute inset-0 overflow-hidden bg-charcoal"
        initial={{ scale: 1.08, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <iframe
          className="absolute left-1/2 top-0 h-full min-h-full w-[177.78vh] min-w-full -translate-x-1/2 border-0 md:top-1/2 md:h-[64vw] md:min-h-[114%] md:w-[202.67vh] md:min-w-[114%] md:-translate-y-1/2"
          src={media.src}
          title={`${hotelName} background video`}
          allow="autoplay; encrypted-media; picture-in-picture"
          tabIndex={-1}
          aria-hidden="true"
        />
      </motion.div>
    )
  }

  if (media?.type === 'file') {
    return (
      <motion.video
        className="absolute inset-0 h-full w-full object-cover object-top md:scale-105 md:object-center"
        src={media.src}
        poster={image}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        initial={{ scale: 1.12, opacity: 0 }}
        animate={{ scale: 1.05, opacity: 1 }}
        transition={{ duration: 1.25, ease: [0.22, 1, 0.36, 1] }}
      />
    )
  }

  return (
    <motion.img
      className="absolute inset-0 h-full w-full object-cover"
      src={image}
      alt={hotelName}
      initial={{ scale: 1.06 }}
      animate={{ scale: 1 }}
      transition={{ duration: 1.25, ease: [0.22, 1, 0.36, 1] }}
    />
  )
}

function OfferShowcase({ offers, bookingUrl }) {
  const visibleOffers = offers.slice(0, 3)
  const gridClass = visibleOffers.length === 1 ? 'grid justify-center gap-3' : visibleOffers.length === 2 ? 'grid gap-3 lg:grid-cols-2' : 'grid gap-3 lg:grid-cols-3'
  return (
    <FadeIn className="relative overflow-hidden rounded-lg border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(250,247,241,0.94),rgba(127,29,29,0.09),rgba(197,144,42,0.08))] p-4 shadow-panel backdrop-blur-xl md:p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amberline via-yellow-600/55 to-charcoal" />
      <div className="relative">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Live offers</p>
            <h2 className="mt-2 text-3xl font-black text-charcoal md:text-4xl">Book direct benefits</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-stone-600">Select an offer before choosing your room. The booking page will show the discount calculation before payment.</p>
          </div>
          <Link to={bookingUrl} className="btn-dark shrink-0"><CalendarDays size={18} /> Book stay</Link>
        </div>
        <div className={gridClass}>
          {visibleOffers.map((offer) => (
            <motion.article
              key={offer.id || offer.title}
              className={`flex min-h-64 flex-col rounded-md border border-mist bg-white/90 p-4 shadow-soft backdrop-blur-md ${visibleOffers.length === 1 ? 'w-full max-w-xl' : ''}`}
              whileHover={{ y: -5 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-black uppercase text-white" style={{ backgroundColor: offer.highlight_color || '#7f1d1d' }}>
                  <Gift size={15} /> {offer.badge || (offer.audience_type === 'repeat_guest' ? 'For you' : 'Offer')}
                </span>
                <span className="text-xs font-bold uppercase text-stone-500">{offer.audience_type === 'repeat_guest' ? 'Personalized' : 'General'}</span>
              </div>
              <h3 className="mt-4 text-xl font-extrabold">{offer.title}</h3>
              <p className="mt-2 text-2xl font-black text-amberline">{formatOfferValue(offer)}</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">{offer.description}</p>
              <div className="mt-auto pt-5">
                <Link to={appendQueryParam(bookingUrl, 'offerId', offer.id)} className="btn-primary w-full"><CalendarDays size={17} /> Apply and book</Link>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </FadeIn>
  )
}

function formatOfferValue(offer) {
  const value = Number(offer.discount_value || 0)
  if (offer.discount_type === 'percentage') return `${value}% off`
  return `Rs ${value.toLocaleString('en-IN')} off`
}

function appendQueryParam(path, key, value) {
  const [baseWithSearch, hash = ''] = path.split('#')
  const [base, search = ''] = baseWithSearch.split('?')
  const params = new URLSearchParams(search)
  if (value) params.set(key, value)
  const query = params.toString()
  return `${base}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`
}

function HotelMedia({ hotel, heroImage }) {
  const videoUrl = getYouTubeEmbedUrl(hotel.branding?.youtubeEmbedUrl)
  const imageUrl = hotel.branding?.showcaseImageUrl || heroImage
  return (
    <FadeIn delay={0.1} className="image-lift order-1 aspect-[4/3] min-h-[320px] shadow-panel lg:order-2">
      {videoUrl ? (
        <iframe
          className="h-full w-full"
          src={videoUrl}
          title={`${hotel.name} video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <img src={imageUrl} alt={`${hotel.name} showcase`} loading="lazy" className="h-full w-full object-cover" />
      )}
    </FadeIn>
  )
}

function RoomShowcase({ room, bookingUrl }) {
  const displayPrice = room.offer_price || room.base_price
  const availabilityUrl = `${bookingUrl}&roomTypeId=${room.id}`
  const detailsUrl = `${availabilityUrl}&step=details`
  return (
    <StaggerItem className="min-w-[84vw] snap-start md:min-w-0">
      <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-mist bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-card">
        <div className="image-lift rounded-none border-0">
          <img src={room.hero_image_url || fallbackRoomImage} alt={room.name} loading="lazy" className="h-64 w-full object-cover" />
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{room.bed_type || 'Curated stay'}</p>
          <h3 className="mt-2 text-2xl font-bold leading-tight">{room.name}</h3>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <p className="font-extrabold">
              {room.offer_price ? <span className="mr-2 text-sm text-stone-400 line-through">Rs {Number(room.base_price).toLocaleString('en-IN')}</span> : null}
              Rs {Number(displayPrice).toLocaleString('en-IN')} <span className="text-xs text-stone-500">/ night</span>
            </p>
            <span className="rounded-md bg-bone px-3 py-2 text-xs font-bold text-stone-600">{room.size_sqft || 'Spacious'} sq ft</span>
          </div>
          <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2">
            <Link to={detailsUrl} className="btn-secondary !min-h-10 !px-4">View details</Link>
            <Link to={availabilityUrl} className="btn-primary !min-h-10 !px-4">Check availability</Link>
          </div>
        </div>
      </article>
    </StaggerItem>
  )
}

function AmenityCard({ amenity }) {
  return (
    <FadeIn className="rounded-lg border border-mist bg-white p-4 shadow-soft">
      <Sparkles size={20} className="text-amberline" />
      <p className="mt-3 font-extrabold">{amenity.name}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{amenity.description || 'Available for selected rooms and guest experiences.'}</p>
      <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-bone px-3 py-2 text-xs font-black text-stone-700">
        <Star size={14} className="text-amberline" /> {Number(amenity.price || 0) ? `Rs ${Number(amenity.price).toLocaleString('en-IN')}` : 'Included'}
      </p>
    </FadeIn>
  )
}

function Feature({ icon: Icon, title, text }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-soft">
      <Icon size={20} className="text-amberline" />
      <p className="mt-3 font-extrabold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-stone-500">{text}</p>
    </div>
  )
}

function DatePicker({ label, value, min, onChange }) {
  const [open, setOpen] = useState(false)
  const current = parseDate(value) || new Date()
  const [viewDate, setViewDate] = useState(new Date(current.getFullYear(), current.getMonth(), 1))
  const days = useMemo(() => calendarDays(viewDate), [viewDate])
  const minDate = min ? parseDate(min) : null

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

function withTenantQuery(path) {
  const tenant = resolveTenantFromLocation()
  if (!tenant.isTenant || !tenant.key || !['query', 'local-storage'].includes(tenant.source)) return path
  const [baseWithSearch, hash = ''] = path.split('#')
  const [base, search = ''] = baseWithSearch.split('?')
  const params = new URLSearchParams(search)
  params.set('hotel', tenant.key)
  const query = params.toString()
  return `${base}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`
}

function TenantError({ error }) {
  return (
    <main className="container-page grid min-h-[70vh] place-items-center py-12">
      <div className="panel max-w-xl p-7 text-center">
        <h1 className="text-3xl font-bold">Hotel not found</h1>
        <p className="mt-3 text-stone-600">{error.message}</p>
        <Link to="/" className="btn-primary mt-6">Return to group site</Link>
      </div>
    </main>
  )
}

function getYouTubeEmbedUrl(value) {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.hostname.includes('youtube.com') && url.pathname.startsWith('/embed/')) return raw
    if (url.hostname.includes('youtube.com')) {
      const id = url.searchParams.get('v')
      return id ? `https://www.youtube.com/embed/${id}` : ''
    }
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id ? `https://www.youtube.com/embed/${id}` : ''
    }
  } catch {
    return ''
  }
  return ''
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
      playsinline: '1',
      rel: '0',
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
  const date = parseDate(value)
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

function parseDate(value) {
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

function addDays(dateString, days) {
  const date = parseDate(dateString)
  if (!date) return ''
  date.setDate(date.getDate() + days)
  return toDateValue(date)
}
