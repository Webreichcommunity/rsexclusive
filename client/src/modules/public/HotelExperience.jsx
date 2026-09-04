import {
  Bath,
  BedDouble,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Gift,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  Utensils,
  Waves,
  Wifi,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { AutoScrollRow } from '../../components/ui/AutoScrollRow.jsx'
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
  const featuredRoom = rooms[0]
  const bookingUrl = withTenantQuery(`/book?checkIn=${search.checkIn}&checkOut=${search.checkOut}&adults=${search.adults}&children=${search.children}&roomsCount=${search.roomsCount}`)
  const homepageRooms = rooms
  const galleryImages = [
    heroImage,
    featuredRoom?.hero_image_url || fallbackRoomImage,
    rooms[1]?.hero_image_url || loungeImage,
    hotel.branding?.showcaseImageUrl || diningImage,
  ]

  return (
    <main className="overflow-hidden bg-transparent">
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

      <section id="hotel" className="relative -mt-[72px] min-h-[100svh] overflow-hidden pt-[72px]">
        <div className="container-page relative grid min-h-[calc(100svh-72px)] items-center gap-8 pb-10 pt-16 sm:pt-20 lg:grid-cols-[1fr_440px] lg:pt-16">
          <FadeIn viewport={false} className="max-w-3xl text-white">
            <p className="inline-flex rounded-md bg-black/34 px-3 py-2 text-xs font-black uppercase tracking-[0.28em] text-amber-100 shadow-[0_12px_34px_rgba(0,0,0,0.55)] backdrop-blur-md">{hotel.branding?.tone || 'Independent luxury hotel'}</p>
            <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.98] text-white drop-shadow-[0_6px_26px_rgba(0,0,0,0.55)] md:text-7xl">
              {hotel.name}
            </h1>
            <p className="mt-6 max-w-2xl text-base font-medium leading-8 text-white/88 md:text-lg">{hotel.description}</p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold text-white/90">
              <span className="inline-flex items-center gap-2 rounded-md border border-white/28 bg-black/36 px-4 py-3 text-white shadow-[0_14px_38px_rgba(0,0,0,0.55)] backdrop-blur-md"><MapPin size={16} className="text-amber-200" /> {hotel.address?.city || 'Prime location'}</span>
              <span className="rounded-md border border-white/28 bg-black/36 px-4 py-3 text-white shadow-[0_14px_38px_rgba(0,0,0,0.55)] backdrop-blur-md">{rooms.length} room categor{rooms.length === 1 ? 'y' : 'ies'}</span>
            </div>
          </FadeIn>

          <FadeIn viewport={false} delay={0.18}>
            <form
              className="rounded-lg border border-white/30 bg-white/12 p-4 text-white shadow-2xl shadow-black/20 backdrop-blur-2xl md:p-5 [&_.date-button]:h-11 [&_.date-button]:!border-white/70 [&_.date-button]:!bg-white/90 [&_.date-button]:!text-charcoal [&_.input]:h-11 [&_.input]:!text-charcoal [&_.label]:!text-white [&_.stay-stepper]:!border-white/70 [&_.stay-stepper]:!bg-white/90 [&_.stay-stepper]:!text-charcoal"
              onSubmit={(event) => event.preventDefault()}
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100">Reserve directly</p>
              <h2 className="mt-2 text-2xl font-black text-white">Plan your stay</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <DatePicker label="Check-in" value={search.checkIn} onChange={(value) => setSearch((current) => ({ ...current, checkIn: value }))} />
                <DatePicker label="Check-out" value={search.checkOut} min={addDays(search.checkIn, 1)} onChange={(value) => setSearch((current) => ({ ...current, checkOut: value }))} />
                <Field label="Adults"><Stepper value={search.adults} min={1} onChange={(value) => setSearch({ ...search, adults: value })} /></Field>
                <Field label="Children"><Stepper value={search.children} min={0} onChange={(value) => setSearch({ ...search, children: value })} /></Field>
                <Field label="Rooms" className="col-span-2 sm:col-span-1"><Stepper value={search.roomsCount} min={1} onChange={(value) => setSearch({ ...search, roomsCount: value })} /></Field>
              </div>
              <Link to={bookingUrl} className="btn-primary mt-5 w-full"><CalendarDays size={18} /> Search Rooms</Link>
            </form>
          </FadeIn>
        </div>
      </section>

      <div className="relative bg-white">
        <section id="offers" className="container-page pt-10 scroll-mt-24">
          <OfferShowcase offers={offers} bookingUrl={bookingUrl} />
        </section>

        <section id="rooms" className="container-page section-pad scroll-mt-24">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Rooms and suites</p>
              <h2 className="page-title">Choose your stay</h2>
              <p className="page-subtitle">Browse room categories right after live offers, then continue with the offer already selected for checkout.</p>
            </div>
            <Link to={bookingUrl} className="btn-primary w-full sm:w-auto"><CalendarDays size={18} /> Search dates</Link>
          </div>
          {homepageRooms.length ? (
            <Stagger className="grid gap-4">
              {homepageRooms.map((room) => <RoomShowcase key={room.id} room={room} bookingUrl={bookingUrl} offers={offers} />)}
            </Stagger>
          ) : (
            <FadeIn className="panel p-8 text-center">
              <h3 className="text-3xl font-bold">Rooms are being prepared</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">The hotel admin has not opened room inventory yet.</p>
            </FadeIn>
          )}
        </section>

        <section id="experience" className="container-page section-pad scroll-mt-24">
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

        <section id="amenities" className="container-page section-pad">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Experience and amenities</p>
              <h2 className="page-title">Everything guests notice after check-in</h2>
            </div>
          </div>
          <AutoScrollRow ariaLabel="Hotel amenities" step={260}>
            {(amenities.length ? amenities : fallbackAmenities).slice(0, 12).map((amenity) => <AmenityCard key={amenity.id || amenity.name} amenity={amenity} />)}
          </AutoScrollRow>
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
      </div>
    </main>
  )
}

const fallbackAmenities = [
  { name: 'Premium linen', description: 'Soft bedding and daily room care.', price: 0 },
  { name: 'Housekeeping', description: 'Reliable service throughout the stay.', price: 0 },
  { name: 'Dining access', description: 'Breakfast and dining support.', price: 0 },
  { name: 'Secure booking', description: 'Direct confirmation and payment.', price: 0 },
]

function OfferShowcase({ offers, bookingUrl }) {
  const visibleOffers = offers.slice(0, 8)
  if (!visibleOffers.length) {
    return (
      <FadeIn className="relative overflow-hidden rounded-lg border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(250,247,241,0.94),rgba(127,29,29,0.08))] p-4 shadow-panel backdrop-blur-xl md:p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amberline via-yellow-600/55 to-charcoal" />
        <p className="eyebrow">Offers</p>
        <h2 className="mt-2 text-3xl font-black text-charcoal md:text-4xl">Direct booking benefits</h2>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-stone-600">Hotel offers will appear here as soon as the team publishes them.</p>
        <Link to={bookingUrl} className="btn-primary mt-5 w-full sm:w-auto"><CalendarDays size={18} /> Book stay</Link>
      </FadeIn>
    )
  }
  return (
    <FadeIn className="relative overflow-hidden rounded-lg border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,245,245,0.92),rgba(127,29,29,0.10),rgba(34,34,34,0.06))] p-4 shadow-panel backdrop-blur-xl md:p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amberline via-zinc-700/55 to-charcoal" />
      <div className="relative">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">Live offers</p>
            <h2 className="mt-2 text-3xl font-black text-charcoal md:text-4xl">Book direct benefits</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-stone-600">Select an offer before choosing your room. The booking page will show the discount calculation before payment.</p>
          </div>
          <Link to={bookingUrl} className="btn-dark shrink-0"><CalendarDays size={18} /> Book stay</Link>
        </div>
        <AutoScrollRow ariaLabel="Live hotel offers" step={360}>
          {visibleOffers.map((offer) => (
            <motion.article
              key={offer.id || offer.title}
              className="relative flex min-h-64 w-[86vw] max-w-[23rem] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-white/70 bg-white/58 p-4 shadow-glass backdrop-blur-2xl sm:w-[21rem]"
              whileHover={{ y: -5 }}
              transition={{ duration: 0.25 }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.62),rgba(255,255,255,0.24)),radial-gradient(circle_at_18%_8%,rgba(127,29,29,0.16),transparent_38%)]" />
              <div className="relative flex flex-1 flex-col">
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
              </div>
            </motion.article>
          ))}
        </AutoScrollRow>
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

function RoomShowcase({ room, bookingUrl, offers = [] }) {
  const displayPrice = room.offer_price || room.base_price
  const availabilityUrl = `${bookingUrl}&roomTypeId=${room.id}`
  const detailsUrl = `${availabilityUrl}&step=details`
  const roomPriceSaving = room.offer_price ? Math.max(0, Number(room.base_price || 0) - Number(room.offer_price || 0)) : 0
  const possibleLoyaltyPoints = Math.max(0, Math.floor(Number(displayPrice || 0) / 100))
  return (
    <StaggerItem>
      <article className="group grid overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-card md:grid-cols-[240px_minmax(0,1fr)_225px] lg:grid-cols-[280px_minmax(0,1fr)_235px]">
        <div className="image-lift h-52 rounded-none border-0 md:h-full md:min-h-[15.5rem]">
          <RotatingRoomImage room={room} className="h-full w-full object-cover" />
        </div>
        <div className="flex min-w-0 flex-col gap-3 p-4 md:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{room.bed_type || 'Curated stay'}</p>
          <h3 className="mt-2 text-2xl font-bold leading-tight">{room.name}</h3>
          <p className="line-clamp-2 text-sm leading-6 text-stone-600">{room.description}</p>
          <div className="flex flex-wrap gap-2">
            {(room.amenities || []).slice(0, 4).map((amenity) => <span key={amenity} className="rounded-md bg-bone px-3 py-2 text-xs font-bold text-stone-600">{amenity}</span>)}
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(190px,0.8fr)]">
            {offers.length ? <HomeRoomOfferPicker offers={offers} availabilityUrl={availabilityUrl} /> : null}
            <div className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 ${offers.length ? '' : 'sm:col-span-2'}`}>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-900">Loyalty value</p>
              <p className="mt-1 text-sm font-extrabold text-charcoal">Earn from {possibleLoyaltyPoints.toLocaleString('en-IN')} points</p>
              <p className="text-xs font-semibold leading-5 text-stone-600">Saved points reduce checkout total later.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between border-t border-emerald-200 bg-emerald-50 p-4 md:border-l md:border-t-0">
          <span className="w-fit rounded-md bg-white px-3 py-2 text-xs font-bold text-stone-600">{room.size_sqft || 'Spacious'} sq ft</span>
          <div className="mt-3">
            {room.offer_price ? <p className="text-sm font-bold text-stone-500 line-through">Rs {Number(room.base_price).toLocaleString('en-IN')}</p> : null}
            <p className="text-3xl font-black leading-none text-emerald-800">Rs {Number(displayPrice).toLocaleString('en-IN')}</p>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">per night</p>
            {roomPriceSaving ? <p className="mt-2 rounded-md bg-white px-3 py-2 text-xs font-black text-emerald-800">Save Rs {roomPriceSaving.toLocaleString('en-IN')} / night</p> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to={detailsUrl} className="btn-secondary !min-h-10 !px-3"><span className="sm:hidden">View</span><span className="hidden sm:inline">View details</span></Link>
            <Link to={availabilityUrl} className="btn-primary !min-h-10 !px-3"><span className="sm:hidden">Book</span><span className="hidden sm:inline">Check availability</span></Link>
          </div>
        </div>
      </article>
    </StaggerItem>
  )
}

function HomeRoomOfferPicker({ offers, availabilityUrl }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-amberline">Apply offers</p>
      <div className="flex snap-x gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0">
        {offers.slice(0, 4).map((offer) => (
          <Link
            key={offer.id || offer.title}
            to={appendQueryParam(availabilityUrl, 'offerId', offer.id)}
            className="w-40 shrink-0 snap-start rounded-md border border-stone-200 bg-bone/60 px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-soft sm:w-auto"
          >
            <span className="line-clamp-1 text-xs font-extrabold text-charcoal">{offer.title}</span>
            <span className="mt-1 block text-xs font-black text-emerald-800">{formatOfferValue(offer)}</span>
          </Link>
        ))}
      </div>
      {offers.length > 2 ? <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-stone-500 sm:hidden">Swipe left for more offers</p> : null}
    </div>
  )
}

function RotatingRoomImage({ room, className }) {
  const images = useMemo(() => getRoomImages(room), [room])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (images.length < 2) return undefined
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % images.length), 1000)
    return () => window.clearInterval(timer)
  }, [images.length])

  return (
    <span className="relative block h-full w-full overflow-hidden bg-stone-200">
      {images.map((image, imageIndex) => (
        <img
          key={image.url}
          src={image.url || fallbackRoomImage}
          alt={image.alt || room.name}
          loading="lazy"
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${className} ${imageIndex === index ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </span>
  )
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

function AmenityCard({ amenity }) {
  const Icon = getAmenityIcon(amenity)
  return (
    <FadeIn className="flex min-h-40 w-[66vw] max-w-[16rem] shrink-0 snap-start flex-col justify-between rounded-lg bg-white p-5 text-left shadow-soft ring-1 ring-stone-200/70 transition duration-300 hover:-translate-y-1 hover:shadow-card sm:w-60">
      <span className="grid h-12 w-12 place-items-center rounded-md bg-transparent text-amberline">
        {isUrl(amenity.icon) ? <img src={amenity.icon} alt="" className="h-9 w-9 object-contain" loading="lazy" /> : <Icon size={28} strokeWidth={1.8} />}
      </span>
      <div className="mt-5">
        <p className="text-base font-extrabold text-charcoal">{amenity.name}</p>
        {amenity.description ? <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-stone-600">{amenity.description}</p> : null}
        <p className="mt-3 text-sm font-black text-amberline">{Number(amenity.price || 0) ? `Rs ${Number(amenity.price).toLocaleString('en-IN')}` : 'Included'}</p>
      </div>
    </FadeIn>
  )
}

function getAmenityIcon(amenity) {
  const value = String(amenity.icon || amenity.name || '').toLowerCase()
  if (value.includes('wifi') || value.includes('internet')) return Wifi
  if (value.includes('pool') || value.includes('spa')) return Waves
  if (value.includes('gym') || value.includes('fitness')) return Dumbbell
  if (value.includes('dining') || value.includes('breakfast') || value.includes('restaurant')) return Utensils
  if (value.includes('bath')) return Bath
  if (value.includes('bed') || value.includes('linen')) return BedDouble
  return Sparkles
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
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

function DatePicker({ label, value, min, onChange, className = '' }) {
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

function Stepper({ value, min, onChange }) {
  return (
    <div className="stay-stepper flex h-11 items-center justify-between rounded-md border border-mist bg-white px-2 shadow-sm">
      <button className="grid h-8 w-8 place-items-center rounded-md bg-bone text-charcoal transition hover:bg-charcoal hover:text-white" type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, Number(value) - 1))}><Minus size={15} /></button>
      <span className="min-w-8 text-center text-sm font-extrabold">{value}</span>
      <button className="grid h-8 w-8 place-items-center rounded-md bg-charcoal text-white transition hover:bg-amberline" type="button" aria-label="Increase" onClick={() => onChange(Number(value) + 1)}><Plus size={15} /></button>
    </div>
  )
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
