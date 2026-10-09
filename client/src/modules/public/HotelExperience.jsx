import {
  Bath,
  BedDouble,
  CalendarDays,
  Check,
  CreditCard,
  Dumbbell,
  Gift,
  Maximize2,
  Minus,
  Plus,
  Sparkles,
  Utensils,
  Waves,
  Wifi,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { AutoScrollRow } from '../../components/ui/AutoScrollRow.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { Seo } from '../../components/seo/Seo.jsx'
import { ImageLightbox } from '../../components/ui/ImageLightbox.jsx'
import { StayDateRangePicker } from '../../components/ui/StayDateRangePicker.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { logoDisplayUrl } from '../../utils/logoUrl.js'
import { buildTenantPath, resolveTenantFromLocation } from '../tenant/resolveTenant.js'

const fallbackHotelImage = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=80'
const fallbackRoomImage = 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80'
const diningImage = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80'
const loungeImage = 'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?auto=format&fit=crop&w=1400&q=80'
const primarySiteUrl = 'https://www.ranjeetgroupofhotels.in'
const hotelSeoProfiles = {
  rsexclusive: {
    slug: 'rsexclusive',
    name: 'RS Exclusive Stay and Fine Dine',
    title: 'RS Exclusive Stay and Fine Dine | RS Hotel Akola Rooms',
    description: 'Book RS Exclusive Stay and Fine Dine in Akola at Railway Station Road near Shah Hospital. View RS Hotel Akola rooms, offers, dining, and direct booking.',
    keywords: 'rs exclusive stay and fine dine, rs exclusive stay and dine fine, rs hotel akola, rs hotels akola, rs hotel akola rooms, rs exclusive rooms, best hotel in akola, best rooms in akola, hotel near railway station akola, hotel near shah hospital akola, fine dine hotel akola, direct hotel booking akola',
    address: {
      streetAddress: 'Railway Station Rd, near Shah Hospital, Ramdaspeth',
      addressLocality: 'Akola',
      addressRegion: 'Maharashtra',
      postalCode: '444005',
      addressCountry: 'IN',
    },
    telephone: '+917447439463',
  },
  rgexclusive: {
    slug: 'rgexclusive',
    name: 'RG Exclusive Stay and Fine Dine',
    title: 'RG Exclusive Stay and Fine Dine | RG Hotel Akola Rooms',
    description: 'Book RG Exclusive Stay and Fine Dine in Akola at Murtizapur Road near Ram Lata Business Center. View RG Hotel Akola rooms, offers, dining, and direct booking.',
    keywords: 'rg exclusive stay and fine dine, rg exclusive stay and dine fine, rg hotel akola, rg hotels akola, rg hotel akola rooms, rg exclusive rooms, best hotel in akola, best rooms in akola, hotel near murtizapur road akola, hotel near ram lata business center akola, fine dine hotel akola, direct hotel booking akola',
    address: {
      streetAddress: 'Murtizapur Rd, near RAM LATA BUSINESS CENTER, Kirti Nagar',
      addressLocality: 'Akola',
      addressRegion: 'Maharashtra',
      postalCode: '444001',
      addressCountry: 'IN',
    },
    telephone: '+918432154380',
  },
  ranjeethotel: {
    slug: 'ranjeethotel',
    name: 'Ranjeet Hotel',
    title: 'Ranjeet Hotel Akola | Hotel Rooms Near New Bus Stand',
    description: 'Book Ranjeet Hotel Akola on Station Road behind New Bus Stand. View Ranjeet Hotel Akola rooms, offers, contact details, and direct booking.',
    keywords: 'ranjeet hotel, ranjeet hotel akola, hotel ranjeet akola, ranjeet hotel akola rooms, best hotel in akola, best rooms in akola, hotel near new bus stand akola, hotel near station road akola, akola hotel booking, direct hotel booking akola',
    address: {
      streetAddress: 'Station Road, behind New Bus Stand',
      addressLocality: 'Akola',
      addressRegion: 'Maharashtra',
      postalCode: '444001',
      addressCountry: 'IN',
    },
    telephone: '+918275035359',
  },
}

function defaultDates() {
  const start = new Date()
  start.setDate(start.getDate() + 1)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
}

function buildHotelSeo(hotel = {}, image) {
  const key = hotelSeoKey(hotel)
  const profile = hotelSeoProfiles[key]
  const slug = profile?.slug || hotel.slug || hotel.subdomain || key || ''
  const canonical = slug ? `${primarySiteUrl}/${slug}` : primarySiteUrl
  const name = profile?.name || cleanHotelName(hotel.name)
  const title = profile?.title || `${name} | Best Hotel in Akola | Direct Booking`
  const hotelDescription = premiumHotelSummary(hotel)
  const description = metaDescription(hotelDescription || profile?.description || `${name} hotel in Akola with direct room booking, live availability, offers, and secure payment.`)
  const keywords = profile?.keywords || `${name}, hotel in Akola, best hotel in Akola, Akola hotel rooms, direct hotel booking Akola`
  const address = profile?.address || normalizeStructuredAddress(hotel.address)
  const telephone = profile?.telephone || normalizePhone(hotel.contact?.phone)
  const logo = hotelLogoUrl(hotel)

  return {
    title,
    description,
    keywords,
    canonical,
    siteName: name,
    favicon: logo,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Hotel',
      '@id': `${canonical}#hotel`,
      name,
      alternateName: hotel.name && hotel.name !== name ? hotel.name : undefined,
      description,
      url: canonical,
      image,
      logo,
      telephone,
      priceRange: 'INR',
      address: {
        '@type': 'PostalAddress',
        ...address,
      },
      areaServed: {
        '@type': 'City',
        name: 'Akola',
      },
      amenityFeature: [
        { '@type': 'LocationFeatureSpecification', name: 'Direct room booking', value: true },
        { '@type': 'LocationFeatureSpecification', name: 'Fine dining', value: true },
        { '@type': 'LocationFeatureSpecification', name: '25% online payment option', value: true },
      ],
      potentialAction: {
        '@type': 'ReserveAction',
        target: `${canonical}/book`,
        name: `Book rooms at ${name}`,
      },
    },
  }
}

function hotelSeoKey(hotel = {}) {
  const source = `${hotel.slug || ''} ${hotel.subdomain || ''} ${hotel.name || ''}`.toLowerCase()
  if (/rg\s*exclusive|rgexclusive|r-g-exclusive/.test(source)) return 'rgexclusive'
  if (/rs\s*exclusive|rsexclusive|r-s-exclusive/.test(source)) return 'rsexclusive'
  if (/ranjeet/.test(source)) return 'ranjeethotel'
  return String(hotel.slug || hotel.subdomain || '').toLowerCase()
}

function normalizeStructuredAddress(address = {}) {
  if (typeof address === 'string') {
    return {
      streetAddress: address,
      addressLocality: 'Akola',
      addressRegion: 'Maharashtra',
      addressCountry: 'IN',
    }
  }
  return {
    streetAddress: address.line1 || address.street || address.streetAddress || '',
    addressLocality: address.city || address.addressLocality || 'Akola',
    addressRegion: address.state || address.addressRegion || 'Maharashtra',
    postalCode: address.postalCode || address.zip || '',
    addressCountry: address.country || address.addressCountry || 'IN',
  }
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return undefined
  if (digits.startsWith('91')) return `+${digits}`
  if (digits.length === 10) return `+91${digits}`
  return `+${digits}`
}

export function HotelExperience() {
  const { data, loading, error } = useAsync(() => apiFetch('/tenant'))
  const [defaultCheckIn, defaultCheckOut] = defaultDates()
  const [search, setSearch] = useState({ checkIn: defaultCheckIn, checkOut: defaultCheckOut, adults: 1, children: 0, roomsCount: 1 })
  const [offersModalOpen, setOffersModalOpen] = useState(false)

  if (loading) return <LoadingState label="Opening hotel" />
  if (error) return <TenantError error={error} />

  const { hotel, rooms, amenities = [] } = data
  const faqs = data.faqs || []
  const offers = data.offers || []
  const showcaseOffers = offers.filter(isShowcaseOffer)
  const bookingOffers = offers.filter(isAppliedOffer)
  const allRoomOffers = bookingOffers.filter(isAllRoomOffer)
  const offerHighlights = offers
  const heroImages = getMediaUrls([hotel.branding?.mainImage || hotel.branding?.mainImageUrl].filter(Boolean)).concat(getMediaUrls(hotel.branding?.heroImages))
  const showcaseImages = getMediaUrls(hotel.branding?.showcaseImages || [hotel.branding?.showcaseImageUrl].filter(Boolean)).slice(0, 3)
  const heroImage = heroImages[0] || hotel.hero_image_url || fallbackHotelImage
  const featuredRoom = rooms[0]
  const bookingUrl = withTenantQuery(`/book?checkIn=${search.checkIn}&checkOut=${search.checkOut}&adults=${search.adults}&children=${search.children}&roomsCount=${search.roomsCount}`)
  const homepageRooms = rooms.filter((room) => roomSupportsGuestIntent(room, search.adults, search.children))
  const diningMediaImage = getMediaUrls([hotel.branding?.diningImage || hotel.branding?.diningImageUrl].filter(Boolean))[0] || diningImage
  const galleryImages = getMediaUrls(hotel.branding?.gallery).slice(0, 5)
  const visibleGalleryImages = galleryImages.length
    ? galleryImages
    : [heroImage, featuredRoom?.hero_image_url || fallbackRoomImage, rooms[1]?.hero_image_url || loungeImage, showcaseImages[0] || diningMediaImage]
  const seo = buildHotelSeo(hotel, heroImage)
  const heroDescription = premiumHotelSummary(hotel)

  return (
    <main className="overflow-hidden bg-transparent">
      <Seo
        title={seo.title}
        description={seo.description}
        keywords={seo.keywords}
        canonical={seo.canonical}
        image={heroImage}
        favicon={seo.favicon}
        siteName={seo.siteName}
        structuredData={seo.structuredData}
      />

      <section id="hotel" className="relative -mt-[72px] min-h-[100svh] overflow-hidden pt-[112px] sm:pt-[72px]">
        <div className="container-page relative grid min-h-[calc(100svh-112px)] items-center gap-8 pb-10 pt-10 sm:min-h-[calc(100svh-72px)] sm:pt-20 lg:grid-cols-[1fr_440px] lg:pt-16">
          <FadeIn viewport={false} className="max-w-3xl text-white">
            <h1 className="max-w-4xl text-5xl font-black leading-[0.98] text-white drop-shadow-[0_6px_26px_rgba(0,0,0,0.55)] md:text-7xl">
              {cleanHotelName(hotel.name)}
            </h1>
            <p className="mt-6 max-w-2xl text-base font-medium leading-8 text-white/88 md:text-lg">
              {heroDescription}
            </p>
            <DirectPricePromise />
            <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold text-white/90">
              <HeroBenefit icon={CalendarDays} title="24-hour check-in" text="Live room availability" />
              <HeroBenefit icon={CreditCard} title="25% secure hold" text="Pay balance at hotel" />
            </div>
          </FadeIn>

          <FadeIn viewport={false} delay={0.18}>
            <form
              className="rounded-lg border border-white/30 bg-white/12 p-4 text-white shadow-2xl shadow-black/20 backdrop-blur-2xl md:p-5 [&_.date-button]:h-11 [&_.date-button]:!border-white/70 [&_.date-button]:!bg-white/90 [&_.date-button]:!text-charcoal [&_.input]:h-11 [&_.input]:!text-charcoal [&_.label]:!text-white [&_.stay-stepper]:!border-white/70 [&_.stay-stepper]:!bg-white/90 [&_.stay-stepper]:!text-charcoal"
              onSubmit={(event) => event.preventDefault()}
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100">Reserve directly</p>
              <h2 className="mt-2 text-2xl font-black text-white">Book direct in minutes</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <StayDateRangePicker
                  className="col-span-2"
                  checkIn={search.checkIn}
                  checkOut={search.checkOut}
                  onCheckInChange={(value) => setSearch((current) => ({ ...current, checkIn: value }))}
                  onCheckOutChange={(value) => setSearch((current) => ({ ...current, checkOut: value }))}
                  onRangeChange={(checkIn, checkOut) => setSearch((current) => ({ ...current, checkIn, checkOut }))}
                />
                <Field label="Adults"><Stepper value={search.adults} min={1} onChange={(value) => setSearch({ ...search, adults: value })} /></Field>
                <Field label="Children (1-7 yrs)"><Stepper value={search.children} min={0} onChange={(value) => setSearch({ ...search, children: value })} /></Field>
                <Field label="Rooms" className="col-span-2 sm:col-span-1"><Stepper value={search.roomsCount} min={1} onChange={(value) => setSearch({ ...search, roomsCount: value })} /></Field>
              </div>
              <div className="mt-4 rounded-md border border-white/20 bg-white/12 p-3 text-sm font-semibold leading-6 text-white/82">
                Secure your room with 25% online payment and pay the remaining balance at the hotel.
              </div>
              <Link to={bookingUrl} className="btn-primary mt-5 w-full"><CalendarDays size={18} /> Check rooms and book direct</Link>
            </form>
          </FadeIn>
        </div>
      </section>

      <div className="relative bg-white">
        <section id="offers" className="container-page pt-10 scroll-mt-24">
          <OfferShowcase offers={offerHighlights} hasRoomSpecificOffers={bookingOffers.length > allRoomOffers.length} bookingUrl={bookingUrl} showingShowcase={Boolean(showcaseOffers.length)} onViewOffers={() => setOffersModalOpen(true)} />
        </section>
        <OffersModal open={offersModalOpen} offers={offerHighlights} bookingUrl={bookingUrl} onClose={() => setOffersModalOpen(false)} />

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
              {homepageRooms.map((room) => <RoomShowcase key={room.id} room={room} bookingUrl={bookingUrl} adults={search.adults} amenities={amenities} offers={offersForRoom(bookingOffers, room.id)} />)}
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
              <p className="mt-5 text-base leading-8 text-stone-600">{premiumHotelSummary(hotel)}</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <Feature icon={Utensils} title="Dining" text="Warm service and polished cuisine." />
                <Feature icon={Bath} title="Comfort" text="Thoughtful policies and guest rituals." />
                <Feature icon={BedDouble} title="Rooms" text="Curated room categories for every stay." />
              </div>
            </FadeIn>
            <HotelMedia hotel={hotel} heroImage={heroImage} showcaseImages={showcaseImages} />
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
              <img src={diningMediaImage} alt="Fine dining" loading="lazy" className="h-[440px] w-full object-cover" />
            </FadeIn>
          </div>
        </section>

        <section id="amenities" className="container-page section-pad">
          <div className="page-heading !mb-5">
            <div>
              <p className="eyebrow">Experience and amenities</p>
              <h2 className="page-title max-w-3xl">Everything guests notice after check-in</h2>
            </div>
          </div>
          <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(amenities.length ? amenities : fallbackAmenities).slice(0, 8).map((amenity) => <AmenityCard key={amenity.id || amenity.name} amenity={amenity} />)}
          </Stagger>
        </section>

        <section id="gallery" className="container-page pb-16 md:pb-24">
          <Stagger className="grid gap-3 md:grid-cols-4 md:grid-rows-[220px_220px]">
            {visibleGalleryImages.map((image, index) => (
              <StaggerItem key={`${image}-${index}`} className={`image-lift ${index === 0 ? 'md:col-span-2 md:row-span-2' : ''}`}>
                <img src={image} alt={`${hotel.name} gallery ${index + 1}`} loading={index ? 'lazy' : 'eager'} className="h-full min-h-56 w-full object-cover" />
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        <FaqPreview faqs={faqs} />
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

function cleanHotelName(value) {
  return String(value || 'R.S. Exclusive').replace(/\s+/g, ' ').trim()
}

function premiumHotelSummary(hotel) {
  const raw = String(hotel?.description || '').replace(/\s+/g, ' ').trim()
  if (!raw || /proepr|appied|same\s*$/i.test(raw)) {
    return `${cleanHotelName(hotel?.name)} brings direct booking, composed rooms, attentive guest care, and a polished Akola hospitality experience.`
  }
  return raw
}

function metaDescription(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= 160) return text
  return `${text.slice(0, 157).replace(/\s+\S*$/, '')}...`
}

function hotelLogoUrl(hotel) {
  return logoDisplayUrl(hotel?.branding?.logoUrl || '')
}

function DirectPricePromise() {
  return (
    <motion.div
      className="group relative mt-7 max-w-2xl overflow-hidden rounded-lg border border-amber-200/40 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(12,10,9,0.46))] p-1 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.12 }}
    >
      <motion.span
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.34),transparent)]"
        animate={{ x: ['0%', '330%'] }}
        transition={{ duration: 3.1, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
      />
      <div className="relative grid gap-4 rounded-md border border-white/16 bg-zinc-950/40 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-[0.16em] text-amber-100">Direct booking promise</span>
          <span className="mt-1 block text-xl font-black leading-tight text-white sm:text-2xl">Best price when you book direct</span>
          <span className="mt-1 block text-sm font-semibold leading-6 text-white/78">Compare with OTAs before paying. Live rooms, real offers, and hotel-confirmed booking in one place.</span>
        </span>
        <span className="grid grid-cols-2 overflow-hidden rounded-md border border-white/16 bg-white/10 text-center text-xs font-black uppercase text-white sm:w-32 sm:grid-cols-1">
          <span className="px-3 py-2 text-emerald-100">Official site</span>
          <span className="border-l border-white/12 px-3 py-2 text-white/58 line-through sm:border-l-0 sm:border-t">OTA markup</span>
        </span>
      </div>
    </motion.div>
  )
}

function HeroBenefit({ icon: Icon, title, text, tone = 'dark' }) {
  return (
    <span className={`inline-flex w-full items-center gap-3 rounded-md border border-white/18 px-4 py-3 text-left text-white shadow-[0_14px_38px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:w-auto ${tone === 'gold' ? 'bg-amberline/90' : 'bg-zinc-900/72'}`}>
      <Icon size={17} className="shrink-0 text-amber-100" />
      <span className="min-w-0">
        <span className="block text-sm font-black leading-5">{title}</span>
        <span className="block text-xs font-bold leading-5 text-white/78">{text}</span>
      </span>
    </span>
  )
}

function OfferShowcase({ offers, hasRoomSpecificOffers = false, bookingUrl, showingShowcase = false, onViewOffers }) {
  const visibleOffers = offers.slice(0, 8)
  if (!visibleOffers.length) {
    return (
      <FadeIn className="relative overflow-hidden rounded-lg border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(250,247,241,0.94),rgba(127,29,29,0.08))] p-4 shadow-panel backdrop-blur-xl md:p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amberline via-yellow-600/55 to-charcoal" />
        <p className="eyebrow">Offers</p>
        <h2 className="mt-2 text-3xl font-black text-charcoal md:text-4xl">Direct booking benefits</h2>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-stone-600">
          {hasRoomSpecificOffers ? 'Room-specific offers are shown below on their eligible room categories.' : 'Hotel offers will appear here as soon as the team publishes them.'}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link to={bookingUrl} className="btn-primary w-full sm:w-auto"><CalendarDays size={18} /> Book stay</Link>
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={onViewOffers}><Gift size={18} /> View offers</button>
        </div>
      </FadeIn>
    )
  }
  return (
    <FadeIn className="relative overflow-hidden rounded-lg border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,245,245,0.92),rgba(127,29,29,0.10),rgba(34,34,34,0.06))] p-4 shadow-panel backdrop-blur-xl md:p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amberline via-zinc-700/55 to-charcoal" />
      <div className="relative">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">{showingShowcase ? 'All live offers' : 'Live offers'}</p>
            <h2 className="mt-2 text-3xl font-black text-charcoal md:text-4xl">Direct booking benefits</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-stone-600">
              {showingShowcase ? 'Showcase offers appear here with booking offers. Checkout discounts still apply only on eligible room categories.' : 'These offers apply to every room. Room-specific offers appear on the eligible room categories below.'}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-secondary shrink-0" onClick={onViewOffers}><Gift size={18} /> View offers</button>
            <Link to={bookingUrl} className="btn-dark shrink-0"><CalendarDays size={18} /> Book stay</Link>
          </div>
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
                <span className="text-xs font-bold uppercase text-stone-500">{isShowcaseOffer(offer) ? 'Showcase' : offer.audience_type === 'repeat_guest' ? 'Personalized' : 'General'}</span>
              </div>
              <h3 className="mt-4 text-xl font-extrabold">{offer.title}</h3>
              <p className="mt-2 text-2xl font-black text-amberline">{formatOfferValue(offer)}</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">{offer.description}</p>
              <div className="mt-auto pt-5">
                {isShowcaseOffer(offer)
                  ? <Link to={bookingUrl} className="btn-primary w-full"><CalendarDays size={17} /> Book stay</Link>
                  : isAllRoomOffer(offer)
                    ? <Link to={appendQueryParam(bookingUrl, 'offerId', offer.id)} className="btn-primary w-full"><CalendarDays size={17} /> Apply and book</Link>
                    : <a href="#rooms" className="btn-primary w-full"><CalendarDays size={17} /> View eligible rooms</a>}
              </div>
              </div>
            </motion.article>
          ))}
        </AutoScrollRow>
      </div>
    </FadeIn>
  )
}

function OffersModal({ open, offers = [], bookingUrl, onClose }) {
  const visibleOffers = offers.filter(Boolean)
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-charcoal/70 p-3 backdrop-blur-sm sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-lg border border-white/70 bg-white shadow-2xl"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-mist bg-bone px-4 py-4 sm:px-5">
              <div>
                <p className="eyebrow">Hotel offers</p>
                <h2 className="mt-1 text-2xl font-black text-charcoal sm:text-3xl">Full offer details</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-stone-600">Showcase offers describe hotel benefits. Applied offers can be selected during booking when eligible.</p>
              </div>
              <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-mist bg-white text-charcoal shadow-sm" onClick={onClose} aria-label="Close offers">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[calc(88vh-120px)] overflow-y-auto p-4 sm:p-5">
              {visibleOffers.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {visibleOffers.map((offer) => (
                    <article key={offer.id || offer.title} className="flex min-h-64 flex-col rounded-lg border border-mist bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-black uppercase text-white" style={{ backgroundColor: offer.highlight_color || '#7f1d1d' }}>
                          <Gift size={14} /> {offer.badge || (isShowcaseOffer(offer) ? 'Showcase' : 'Offer')}
                        </span>
                        <span className="rounded-md bg-bone px-2 py-1 text-xs font-black uppercase text-stone-600">{offerTypeLabel(offer)}</span>
                      </div>
                      <h3 className="mt-4 text-xl font-extrabold text-charcoal">{offer.title}</h3>
                      <p className="mt-2 text-2xl font-black text-amberline">{formatOfferValue(offer)}</p>
                      <p className="mt-3 text-sm font-semibold leading-6 text-stone-600">{offer.description || 'Offer details will be confirmed by the hotel team.'}</p>
                      <div className="mt-4 grid gap-2 text-xs font-bold uppercase tracking-[0.1em] text-stone-500 sm:grid-cols-2">
                        <span className="rounded-md bg-bone px-3 py-2">Starts {formatOfferDate(offer.starts_at)}</span>
                        <span className="rounded-md bg-bone px-3 py-2">Ends {formatOfferDate(offer.ends_at)}</span>
                      </div>
                      <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2">
                        {isShowcaseOffer(offer) || !isAllRoomOffer(offer)
                          ? <Link to={bookingUrl} className="btn-primary !min-h-10 !px-3"><CalendarDays size={17} /> Book stay</Link>
                          : <Link to={appendQueryParam(bookingUrl, 'offerId', offer.id)} className="btn-primary !min-h-10 !px-3"><CalendarDays size={17} /> Book stay</Link>}
                        {!isShowcaseOffer(offer) && isAllRoomOffer(offer)
                          ? <Link to={appendQueryParam(bookingUrl, 'offerId', offer.id)} className="btn-secondary !min-h-10 !px-3" onClick={onClose}><Maximize2 size={16} /> View</Link>
                          : <a href="#rooms" className="btn-secondary !min-h-10 !px-3" onClick={onClose}><Maximize2 size={16} /> View</a>}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-mist bg-bone p-5 text-center">
                  <h3 className="text-xl font-black text-charcoal">No live offers yet</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">The hotel team has not published an active offer for the selected dates.</p>
                  <Link to={bookingUrl} className="btn-primary mt-4"><CalendarDays size={18} /> Book stay</Link>
                </div>
              )}
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function formatOfferDate(value) {
  if (!value) return 'hotel schedule'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'hotel schedule'
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function offerTypeLabel(offer) {
  if (isShowcaseOffer(offer)) return 'Showcase'
  if (!isAllRoomOffer(offer)) return 'Room offer'
  return offer?.audience_type === 'repeat_guest' ? 'Guest offer' : 'Booking offer'
}

function formatOfferValue(offer) {
  if (isShowcaseOffer(offer)) return offer.badge || 'Direct benefit'
  const value = Number(offer.discount_value || 0)
  if (offer.discount_type === 'percentage') return `${value}% off`
  return `Rs ${value.toLocaleString('en-IN')} off`
}

function isAppliedOffer(offer) {
  return (offer?.offer_kind || 'applied') === 'applied'
}

function isShowcaseOffer(offer) {
  return offer?.offer_kind === 'showcase'
}

function isAllRoomOffer(offer) {
  const roomTypeIds = Array.isArray(offer?.room_type_ids) ? offer.room_type_ids : []
  return roomTypeIds.length === 0
}

function offerAppliesToRoom(offer, roomTypeId) {
  if (!offer) return false
  if (isAllRoomOffer(offer) || !roomTypeId) return true
  const roomTypeIds = Array.isArray(offer.room_type_ids) ? offer.room_type_ids : []
  return roomTypeIds.includes(roomTypeId)
}

function offersForRoom(offers = [], roomTypeId = '') {
  return offers.filter((offer) => offerAppliesToRoom(offer, roomTypeId))
}

function appendQueryParam(path, key, value) {
  const [baseWithSearch, hash = ''] = path.split('#')
  const [base, search = ''] = baseWithSearch.split('?')
  const params = new URLSearchParams(search)
  if (value) params.set(key, value)
  const query = params.toString()
  return `${base}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`
}

function HotelMedia({ hotel, heroImage, showcaseImages = [] }) {
  const images = showcaseImages.length ? showcaseImages : [hotel.branding?.showcaseImageUrl || heroImage].filter(Boolean)
  return (
    <FadeIn delay={0.1} className="image-lift order-1 aspect-video min-h-[220px] shadow-panel sm:aspect-[4/3] sm:min-h-[320px] lg:order-2">
      <ImageSlideshow images={images} alt={`${hotel.name} showcase`} />
    </FadeIn>
  )
}

function ImageSlideshow({ images, alt }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (images.length < 2) return undefined
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % images.length), 3200)
    return () => window.clearInterval(timer)
  }, [images.length])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.img
          key={images[index]}
          src={images[index]}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.75 }}
        />
      </AnimatePresence>
    </div>
  )
}

function RoomShowcase({ room, bookingUrl, adults = 1, amenities = [], offers = [] }) {
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const displayRoom = getDisplayRoomForGuests(room, adults)
  const displayPrice = displayRoom.offer_price || displayRoom.base_price
  const extraBedPrice = getMandatoryExtraBedTotal(displayRoom, adults, 1, amenities)
  const displayPriceWithExtraBed = Number(displayPrice || 0) + extraBedPrice
  const availabilityUrl = `${bookingUrl}&roomTypeId=${room.id}`
  const detailsUrl = `${availabilityUrl}&step=details`
  const roomPriceSaving = displayRoom.offer_price ? Math.max(0, Number(displayRoom.base_price || 0) - Number(displayRoom.offer_price || 0)) : 0
  return (
    <StaggerItem>
      <article className="group grid overflow-visible rounded-lg border border-stone-200 bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:border-amberline/35 hover:shadow-card md:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.35fr)] xl:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.4fr)_240px]">
        <div className="image-lift h-56 rounded-none border-0 sm:h-64 md:h-full md:min-h-[18rem]">
          <RotatingRoomImage room={room} className="h-full w-full object-cover" />
        </div>
        <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{displayRoom.bed_type || 'Curated stay'}</p>
          <h3 className="text-2xl font-bold leading-tight">{displayRoom.name}</h3>
          <ExpandableRoomDescription description={displayRoom.description} open={descriptionOpen} onToggle={() => setDescriptionOpen((current) => !current)} />
          <CompactRoomAmenityList amenities={getRoomAmenityItems(room)} limit={6} />
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(190px,0.8fr)]">
            {offers.length ? <HomeRoomOfferPicker offers={offers} availabilityUrl={availabilityUrl} /> : null}
            <div className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 ${offers.length ? '' : 'sm:col-span-2'}`}>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-900">Special offers</p>
              <p className="text-sm font-extrabold text-charcoal">Bookings count across hotels</p>
              <p className="hidden text-xs font-semibold leading-5 text-stone-600 sm:block">Unlock a meal or drink, then Rs 1,000 and Rs 2,000 off milestones.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between border-t border-emerald-200 bg-[linear-gradient(180deg,#ecfdf5_0%,#ffffff_100%)] p-4 md:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">
          <div className="grid grid-cols-[auto_1fr] items-start gap-3 xl:block">
            <span className="w-fit rounded-md bg-white px-3 py-2 text-xs font-bold text-stone-600 shadow-sm">{room.size_sqft || 'Spacious'} sq ft</span>
            <div className="min-w-0 text-right xl:mt-3 xl:text-left">
              {displayRoom.offer_price ? <p className="text-xs font-bold text-stone-500 line-through sm:text-sm">Rs {(Number(displayRoom.base_price || 0) + extraBedPrice).toLocaleString('en-IN')}</p> : null}
              <p className="text-2xl font-black leading-none text-emerald-800 sm:text-3xl">Rs {Number(displayPriceWithExtraBed).toLocaleString('en-IN')}</p>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">per night{extraBedPrice ? ' with extra bed' : ''}</p>
              {extraBedPrice ? <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-900">Includes required extra-person charge Rs {extraBedPrice.toLocaleString('en-IN')}</p> : null}
              {roomPriceSaving ? <p className="mt-2 inline-flex rounded-md bg-white px-3 py-2 text-xs font-black text-emerald-800 shadow-sm">Save Rs {roomPriceSaving.toLocaleString('en-IN')}</p> : null}
            </div>
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

function ExpandableRoomDescription({ description, open, onToggle, wordLimit = 4 }) {
  const text = String(description || 'A composed room category prepared for comfort, clarity, and direct booking.').replace(/\s+/g, ' ').trim()
  const words = text.split(' ').filter(Boolean)
  const canExpand = words.length > wordLimit
  const preview = canExpand ? `${words.slice(0, wordLimit).join(' ')}...` : text
  return (
    <div className="text-sm leading-6 text-stone-600">
      <span>{open || !canExpand ? text : preview}</span>
      {canExpand ? (
        <button type="button" className="ml-2 font-black text-[#7f1d1d] underline-offset-4 hover:underline" onClick={onToggle}>
          {open ? 'Show less' : 'Read more'}
        </button>
      ) : null}
    </div>
  )
}

function CompactRoomAmenityList({ amenities = [], limit = 6 }) {
  const visible = amenities.filter((amenity) => amenity?.name).slice(0, limit)
  const hiddenCount = Math.max(0, amenities.length - visible.length)
  if (!visible.length) return null
  return (
    <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
      {visible.map((amenity) => (
        <div key={amenity.id || amenity.name} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-stone-700">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700">
            <Check size={14} strokeWidth={2.4} />
          </span>
          <span className="min-w-0 truncate">{amenity.name}</span>
        </div>
      ))}
      {hiddenCount ? <span className="text-sm font-black text-amberline">+ {hiddenCount} more</span> : null}
    </div>
  )
}

function getRoomAmenityItems(room) {
  const amenityItems = Array.isArray(room?.amenity_items) ? room.amenity_items : []
  if (amenityItems.length) return amenityItems
  return (room?.amenities || []).map((name) => ({ name }))
}

function HomeRoomOfferPicker({ offers, availabilityUrl }) {
  return (
    <div className="hidden rounded-lg border border-amber-200 bg-white p-3 sm:block">
      <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-amberline">Apply offers</p>
      <div className="flex snap-x gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0">
        {offers.slice(0, 4).map((offer) => (
          <Link
            key={offer.id || offer.title}
            to={appendQueryParam(availabilityUrl, 'offerId', offer.id)}
            className="group/offer relative w-40 shrink-0 snap-start rounded-md border border-stone-200 bg-bone/60 px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-amberline/35 hover:bg-white hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-amberline/20 sm:w-auto"
          >
            <span className="line-clamp-1 text-xs font-extrabold text-charcoal">{offer.title}</span>
            <span className="mt-1 block text-xs font-black text-emerald-800">{formatOfferValue(offer)}</span>
            <span className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-0 z-20 hidden w-64 rounded-md border border-white/70 bg-charcoal p-3 text-white opacity-0 shadow-card transition duration-200 group-hover/offer:block group-hover/offer:opacity-100 group-focus/offer:block group-focus/offer:opacity-100">
              <span className="block text-xs font-black uppercase text-amber-100">{offer.badge || 'Offer details'}</span>
              <span className="mt-1 block text-sm font-extrabold">{offer.title}</span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-white/76">{offer.description}</span>
            </span>
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

function getDisplayRoomForGuests(room, adults = 1) {
  if (!room || room.selected_rate_category) return room
  const rates = room.rate_options || {}
  const category = Number(adults || 1) <= 1 && rates.single ? 'single' : Number(adults || 1) <= 1 && rates.double ? 'double' : rates.double ? 'double' : ''
  const rate = category ? rates[category] : null
  if (!rate) return room
  const occupancyAdults = rate.occupancyAdults ?? room.occupancy_adults
  const extraBedEnabled = Boolean(rate.extraBed?.enabled)
  const extraBedCount = extraBedEnabled && Number(adults || 1) > Number(occupancyAdults || 0)
    ? Math.max(0, Number(adults || 1) - Number(occupancyAdults || 0))
    : Number(room.extra_bed_count || 0)
  return {
    ...room,
    occupancy_adults: occupancyAdults,
    occupancy_children: rate.occupancyChildren ?? room.occupancy_children,
    base_price: rate.basePrice ?? room.base_price,
    offer_price: rate.offerPrice ?? null,
    size_sqft: rate.sizeSqft ?? room.size_sqft,
    selected_rate_category: category,
    extra_bed_count: extraBedCount,
    extra_bed_recommended: extraBedCount > 0,
    extra_bed_available: extraBedEnabled,
    extra_bed_preselected: rate.extraBed?.preselected ?? room.extra_bed_preselected ?? true,
    extra_bed_price: rate.extraBed?.price ?? room.extra_bed_price ?? 0,
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
  const extraAdultCapacity = requestedAdults >= 3 && candidate.extraBed?.enabled ? 1 : 0
  return adultsCapacity + extraAdultCapacity >= requestedAdults && childrenCapacity >= requestedChildren
}

function isExtraBedAmenity(amenity) {
  return /extra\s*bed|additional\s*bed|rollaway/i.test(String(amenity?.name || ''))
}

function getExtraBedAmenity(amenities = [], room = {}) {
  const amenity = amenities
    .filter((item) => isExtraBedAmenity(item))
    .sort((left, right) => Number(left.price || 0) - Number(right.price || 0) || String(left.name || '').localeCompare(String(right.name || '')))[0]
  if (amenity) return { ...amenity, price: Number(amenity.price || 0) }
  return {
    id: '',
    name: 'Extra bed',
    description: 'Prepared for a 3-adult stay in this room.',
    price: Number(room?.extra_bed_price || 0),
    icon: 'bed',
  }
}

function shouldShowExtraBedAmenity(room, adults = 1) {
  return Number(adults || 1) === 3 && Number(room?.extra_bed_count || 0) > 0
}

function getMandatoryExtraBedTotal(room, adults = 1, roomsCount = 1, amenities = []) {
  if (!shouldShowExtraBedAmenity(room, adults)) return 0
  return Number(getExtraBedAmenity(amenities, room)?.price || 0) * Number(roomsCount || 1)
}

function AmenityCard({ amenity }) {
  return (
    <StaggerItem className="min-w-0">
      <div className="flex h-full min-h-32 gap-3 rounded-lg border border-stone-200 bg-white p-4 text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-amberline/35 hover:shadow-soft">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-amber-50 text-amberline">
          <AmenityVisual amenity={amenity} className="h-8 w-8" iconSize={24} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 break-words text-base font-extrabold leading-snug text-charcoal">{amenity.name}</p>
            <span className="shrink-0 rounded-md bg-bone px-2 py-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-amberline">{Number(amenity.price || 0) ? `Rs ${Number(amenity.price).toLocaleString('en-IN')}` : 'Included'}</span>
          </div>
          {amenity.description ? <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-stone-600">{amenity.description}</p> : null}
        </div>
      </div>
    </StaggerItem>
  )
}

function FaqPreview({ faqs }) {
  const visibleFaqs = (faqs.length ? faqs : fallbackFaqs).slice(0, 3)
  return (
    <section id="faq-preview" className="container-page pb-16 md:pb-24">
      <FadeIn className="overflow-hidden rounded-lg border border-stone-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#fff7ed_100%)] shadow-panel">
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[0.8fr_1.2fr] lg:p-6">
          <div>
            <p className="eyebrow">FAQ</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-charcoal md:text-4xl">Quick Answers Before You Book</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-stone-600">Read the essentials, then open the complete hotel FAQ for every published answer.</p>
            <Link to={withTenantQuery('/faq')} className="btn-primary mt-5 w-full sm:w-auto">View full FAQ</Link>
          </div>
          <div className="grid gap-3">
            {visibleFaqs.map((faq, index) => (
              <article key={faq.id || `${faq.question}-${index}`} className="rounded-md border border-white/80 bg-white p-4 shadow-sm">
                <p className="text-base font-extrabold text-charcoal">{faq.question}</p>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-stone-600">{faq.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </FadeIn>
    </section>
  )
}

const fallbackFaqs = [
  { question: 'What documents are required at check-in?', answer: 'Every guest above 18 years must carry an original government-approved photo ID at check-in.' },
  { question: 'How do I confirm my arrival time?', answer: 'The hotel may contact you before check-in, and you can also use the contact details on this website.' },
  { question: 'Can I book directly from this website?', answer: 'Yes. Search your dates, select a room, review the price, and complete secure payment online.' },
]

function AmenityVisual({ amenity, className = 'h-8 w-8', iconSize = 22 }) {
  const Icon = getAmenityIcon(amenity)
  if (isUrl(amenity?.icon)) return <img src={amenity.icon} alt="" className={`${className} object-contain`} loading="lazy" />
  return <Icon size={iconSize} strokeWidth={1.9} />
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
  return buildTenantPath(path, tenant)
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

function getMediaUrls(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => (typeof item === 'string' ? item : item?.url || item?.secureUrl)).filter(Boolean)
}
