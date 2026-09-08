import {
  ArrowUpRight,
  Building2,
  Facebook,
  Gift,
  Globe2,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Star,
  Twitter,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { Seo } from '../../components/seo/Seo.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../auth/authContext.js'
import { useAppUser } from '../auth/useAppUser.js'
import { apiFetch } from '../../services/apiClient.js'
import { buildHotelUrl } from '../tenant/resolveTenant.js'

const fallbackHotelImage = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=80'
const groupFallbackHero = 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=2200&q=80'

export function GroupLanding() {
  const { data, loading, error } = useAsync(() => apiFetch('/hotels'))
  const hotels = useMemo(() => data?.hotels || [], [data?.hotels])
  const [activeHotelIndex, setActiveHotelIndex] = useState(0)

  useEffect(() => {
    if (hotels.length < 2) return undefined
    const timer = window.setInterval(() => {
      setActiveHotelIndex((index) => (index + 1) % hotels.length)
    }, 7200)
    return () => window.clearInterval(timer)
  }, [hotels.length])

  if (loading) return <LoadingState label="Preparing properties" />

  const activeHotel = hotels[activeHotelIndex] || hotels[0]
  const heroImage = activeHotel?.hero_image_url || groupFallbackHero
  const copy = heroCopy(activeHotel, activeHotelIndex)

  return (
    <main className="overflow-hidden bg-white">
      <Seo
        title="Ranjeet Groups of Hotels Akola"
        description="Discover the Ranjeet Groups of Hotels Akola collection and enter each hotel's own booking website."
      />

      <section id="top" className="relative min-h-[calc(100svh-72px)] overflow-hidden bg-charcoal">
        <div className="absolute inset-0">
          {hotels.length ? hotels.map((hotel, index) => (
            <motion.img
              key={hotel.id}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1800ms] ${index === activeHotelIndex ? 'opacity-90' : 'opacity-0'}`}
              src={hotel.hero_image_url || fallbackHotelImage}
              alt=""
              initial={false}
              animate={{ scale: index === activeHotelIndex ? 1.055 : 1.01 }}
              transition={{ duration: 8.6, ease: 'linear' }}
              aria-hidden="true"
            />
          )) : (
            <motion.img
              className="absolute inset-0 h-full w-full object-cover opacity-90"
              src={heroImage}
              alt=""
              initial={{ scale: 1.05 }}
              animate={{ scale: 1.01 }}
              transition={{ duration: 8, ease: 'linear' }}
              aria-hidden="true"
            />
          )}
        </div>
        <div className="absolute inset-0 bg-black/18" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_50%,rgba(127,29,29,0.42),transparent_36%),linear-gradient(90deg,rgba(0,0,0,0.88),rgba(0,0,0,0.54)_48%,rgba(0,0,0,0.16))]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/58 to-transparent" />

        <div className="container-page relative flex min-h-[calc(100svh-72px)] items-center pb-28 pt-16 sm:pb-24">
          <FadeIn viewport={false} className="w-full max-w-4xl min-w-0 text-white">
            <motion.div key={`${activeHotel?.id || 'group'}-hero-copy`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }}>
              <p className="inline-flex max-w-full whitespace-normal rounded-md border border-white/18 bg-white/10 px-3 py-2 text-[0.62rem] font-black uppercase leading-5 tracking-[0.1em] text-amber-100 shadow-[0_14px_42px_rgba(0,0,0,0.24)] backdrop-blur-md sm:text-xs sm:tracking-[0.18em]">
                {copy.eyebrow}
              </p>
              <h1 className="mt-5 max-w-4xl text-3xl font-black leading-[1.04] text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)] sm:text-5xl md:text-7xl">
                {copy.title}
              </h1>
              <p className="mt-6 max-w-2xl text-sm font-medium leading-7 text-white/88 sm:text-base md:text-lg md:leading-8">
                {copy.description}
              </p>
            </motion.div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a href="#properties" className="btn-dark w-full sm:w-auto">Choose a property <ArrowUpRight size={18} /></a>
              {activeHotel ? <a href={buildHotelUrl(activeHotel)} className="btn-primary w-full sm:w-auto">Open {cleanHotelName(activeHotel.name)}</a> : null}
            </div>
          </FadeIn>
        </div>

        {hotels.length > 1 ? (
          <div className="container-page absolute inset-x-0 bottom-5">
            <div className="max-w-xl">
              <div className="mb-3 flex items-center justify-between gap-4 text-xs font-black uppercase tracking-[0.16em] text-white/70">
                <span>{activeHotel ? cleanHotelName(activeHotel.name) : 'Featured property'}</span>
                <span>{String(activeHotelIndex + 1).padStart(2, '0')} / {String(hotels.length).padStart(2, '0')}</span>
              </div>
              <div className="grid grid-cols-[repeat(var(--hotel-count),minmax(0,1fr))] gap-2" style={{ '--hotel-count': hotels.length }}>
                {hotels.map((hotel, index) => (
                  <span key={hotel.id} className="h-1.5 overflow-hidden rounded-full bg-white/25">
                    <motion.span
                      className="block h-full rounded-full bg-white"
                      initial={false}
                      animate={{ width: index === activeHotelIndex ? '100%' : index < activeHotelIndex ? '100%' : '0%' }}
                      transition={{ duration: index === activeHotelIndex ? 7.2 : 0.35, ease: 'linear' }}
                    />
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section id="properties" className="bg-white">
        <div className="container-page section-pad">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Properties</p>
              <h2 className="page-title">Select your destination</h2>
              <p className="page-subtitle">Each hotel keeps its own identity, offers, rooms, and guest journey inside one refined collection.</p>
            </div>
          </div>

          {error ? (
            <div className="panel p-6">
              <p className="font-bold text-red-700">Could not load hotels.</p>
              <p className="mt-2 text-sm text-stone-600">{error.message}</p>
            </div>
          ) : hotels.length ? (
            <>
              <HotelBannerCarousel hotels={hotels} activeIndex={activeHotelIndex} />
              <Stagger className="mt-8 grid gap-5">
                {hotels.map((hotel, index) => (
                  <StaggerItem key={hotel.id}>
                    <article className="group grid min-h-[560px] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:border-amberline/30 hover:shadow-card sm:min-h-0 md:grid-cols-[280px_minmax(0,1fr)_220px]">
                      <div className="image-lift h-56 rounded-none md:h-full md:min-h-[15rem]">
                        <img src={hotel.hero_image_url || fallbackHotelImage} alt={hotel.name} className="h-full w-full object-cover" loading={index ? 'lazy' : 'eager'} />
                      </div>
                      <div className="flex min-w-0 flex-col justify-between p-5 sm:p-6">
                        <div>
                          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
                            <MapPin size={15} /> {cleanCity(hotel.address?.city)}, {hotel.address?.state || 'Maharashtra'}
                          </p>
                          <h3 className="mt-4 text-2xl font-bold leading-tight text-charcoal md:text-3xl">{cleanHotelName(hotel.name)}</h3>
                          <p className="mt-3 line-clamp-4 max-w-2xl text-sm leading-7 text-stone-600">{hotelSummary(hotel)}</p>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-200 pt-4">
                          <span className="rounded-md bg-bone px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-amberline">Open for booking</span>
                          <span className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">Direct rates</span>
                        </div>
                      </div>
                      <div className="flex min-h-[180px] flex-col justify-between border-t border-amberline/20 bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_100%)] p-5 md:min-h-0 md:border-l md:border-t-0">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-amberline">Hotel site</p>
                          <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">Rooms, offers, amenities, contact details, and direct booking live on the property page.</p>
                        </div>
                        <a href={buildHotelUrl(hotel)} className="btn-primary mt-5 w-full">
                          Enter hotel <ArrowUpRight size={17} />
                        </a>
                      </div>
                    </article>
                  </StaggerItem>
                ))}
              </Stagger>
            </>
          ) : (
            <FadeIn className="panel p-10 text-center">
              <Building2 className="mx-auto text-amberline" size={42} />
              <h2 className="mt-4 text-3xl font-bold">No public hotels yet</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                The platform is clean and ready. Publish the first hotel to show it here.
              </p>
            </FadeIn>
          )}
        </div>
      </section>

      <section id="experience" className="bg-[#f7f7f7]">
        <div className="container-page section-pad">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Experience</p>
              <h2 className="page-title">A polished preview of the collection</h2>
              <p className="page-subtitle">From business-ready rooms to warm dining and arrival moments, every property presents a focused reason to stay.</p>
            </div>
          </div>
          <Stagger className="grid auto-rows-[220px] gap-3 sm:auto-rows-[250px] md:grid-cols-4 md:grid-rows-[230px_230px]">
            {galleryImages(hotels).map((item, index) => (
              <StaggerItem key={`${item.url}-${index}`} className={`image-lift ${index === 0 ? 'md:col-span-2 md:row-span-2' : ''}`}>
                <img src={item.url} alt={item.alt} loading={index ? 'lazy' : 'eager'} className="h-full w-full object-cover" />
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <GroupFeedback hotels={hotels} />
      <GroupFooter hotels={hotels} />
    </main>
  )
}

function heroCopy(hotel, index) {
  if (!hotel) {
    return {
      eyebrow: 'Ranjeet Groups of Hotels Akola',
      title: 'Independent Akola hotels, composed into one refined collection.',
      description: 'Explore every property, compare the stay experience, and enter the hotel website that fits your journey.',
    }
  }

  const name = cleanHotelName(hotel.name)
  const city = cleanCity(hotel.address?.city)
  const descriptions = [
    `Enter ${name} for rooms, offers, amenities, and direct booking with the confidence of the Ranjeet hospitality standard.`,
    `${name} brings a polished stay experience to ${city}, shaped for arrivals, work trips, celebrations, and family visits.`,
    `Browse ${name} as part of a carefully managed Akola collection, then continue into the hotel's dedicated website when you are ready.`,
  ]

  return {
    eyebrow: `${city} collection property`,
    title: `${name}: refined comfort for every stay.`,
    description: descriptions[index % descriptions.length],
  }
}

function cleanHotelName(value) {
  return String(value || 'Ranjeet Groups Hotel').replace(/\s+/g, ' ').trim()
}

function cleanCity(value) {
  const city = String(value || '').replace(/\s+/g, ' ').trim()
  if (!city || /exlusive|exclusive|fine dine|stay/i.test(city)) return 'Akola'
  return city
}

function hotelSummary(hotel) {
  const raw = String(hotel.description || '').replace(/\s+/g, ' ').trim()
  if (!raw || /proepr|appied|same\s*$/i.test(raw)) {
    return `${cleanHotelName(hotel.name)} offers a composed Akola stay with direct booking, attentive service, and a clear property experience.`
  }
  return raw
}

function galleryImages(hotels) {
  const images = hotels.flatMap((hotel) => [
    { url: hotel.hero_image_url, alt: hotel.name },
    { url: hotel.branding?.showcaseImageUrl, alt: `${hotel.name} showcase` },
  ]).filter((image) => image.url)

  return (images.length ? images : [
    { url: groupFallbackHero, alt: 'Hotel lobby' },
    { url: fallbackHotelImage, alt: 'Hotel exterior' },
    { url: 'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?auto=format&fit=crop&w=1400&q=80', alt: 'Hotel lounge' },
    { url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80', alt: 'Hotel dining' },
  ]).slice(0, 6)
}

function GroupFeedback({ hotels }) {
  const { firebaseUser, isAuthenticated } = useAuth()
  const appUser = useAppUser()
  const user = appUser.data?.user
  const profileName = user?.fullName || firebaseUser?.displayName || ''
  const profileEmail = user?.email || firebaseUser?.email || ''
  const profilePhone = user?.phone || ''
  const [form, setForm] = useState({ hotelKey: hotels[0]?.subdomain || hotels[0]?.slug || '', name: '', email: '', phone: '', rating: '5', message: '' })
  const [status, setStatus] = useState({ loading: false, type: '', message: '' })

  useEffect(() => {
    if (!form.hotelKey && hotels[0]) setForm((current) => ({ ...current, hotelKey: hotels[0].subdomain || hotels[0].slug }))
  }, [form.hotelKey, hotels])

  useEffect(() => {
    if (!isAuthenticated) return
    setForm((current) => ({
      ...current,
      name: current.name || profileName,
      email: current.email || profileEmail,
      phone: current.phone || profilePhone,
    }))
  }, [isAuthenticated, profileName, profileEmail, profilePhone])

  async function submit(event) {
    event.preventDefault()
    const selected = hotels.find((hotel) => [hotel.id, hotel.slug, hotel.subdomain].includes(form.hotelKey))
    const hotelKey = selected?.subdomain || selected?.slug || form.hotelKey
    if (!hotelKey) {
      setStatus({ loading: false, type: 'error', message: 'Select a hotel first.' })
      return
    }
    setStatus({ loading: true, type: '', message: '' })
    try {
      await apiFetch(`/feedback?hotel=${encodeURIComponent(hotelKey)}`, {
        method: 'POST',
        body: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          rating: form.rating,
          message: form.message,
        },
      })
      setForm({ hotelKey, name: profileName || '', email: profileEmail || '', phone: profilePhone || '', rating: '5', message: '' })
      setStatus({ loading: false, type: 'success', message: 'Thank you. Your feedback has been sent to the selected hotel team.' })
    } catch (error) {
      setStatus({ loading: false, type: 'error', message: error.message })
    }
  }

  return (
    <section id="feedback" className="bg-white">
      <div className="container-page grid gap-8 py-14 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:py-20">
        <FadeIn>
          <p className="eyebrow">Feedback</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight md:text-5xl">Share your stay note with the right property.</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600 md:text-base">
            Choose a hotel, rate the experience, and send a clear note directly into the property's admin dashboard.
          </p>
          <div className="mt-7 grid gap-3 text-sm font-semibold text-stone-600 sm:grid-cols-2 lg:grid-cols-1">
            <span className="rounded-lg border border-stone-200 bg-bone p-4">{hotels.length || 0} public properties</span>
            <span className="rounded-lg border border-stone-200 bg-bone p-4">{isAuthenticated ? 'Logged-in details filled automatically' : 'Guest feedback is welcome'}</span>
          </div>
        </FadeIn>

        <form onSubmit={submit} className="grid gap-4 rounded-lg border border-stone-200 bg-[linear-gradient(145deg,#ffffff_0%,#fff7ed_100%)] p-4 shadow-panel sm:p-6 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="label">Hotel</span>
            <select className="input" value={form.hotelKey} onChange={(event) => setForm({ ...form, hotelKey: event.target.value })} required>
              <option value="">Select hotel</option>
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.subdomain || hotel.slug}>{cleanHotelName(hotel.name)}</option>)}
            </select>
          </label>
          <Field label="Name"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={isAuthenticated ? '' : 'Your name'} required /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder={isAuthenticated ? '' : 'you@example.com'} required /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Optional" /></Field>
          <Field label="Rating">
            <StarRating value={Number(form.rating)} onChange={(rating) => setForm({ ...form, rating: String(rating) })} />
          </Field>
          <label className="md:col-span-2">
            <span className="label">Feedback</span>
            <textarea className="input min-h-32 resize-y py-3 leading-6" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell the hotel team what worked well or what needs attention." required />
          </label>
          {status.message ? <p className={`rounded-md border p-3 text-sm font-semibold md:col-span-2 ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{status.message}</p> : null}
          <button className="btn-primary md:col-span-2" disabled={status.loading || !hotels.length} type="submit">
            <Send size={18} /> {status.loading ? 'Sending...' : 'Send feedback'}
          </button>
        </form>
      </div>
    </section>
  )
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function StarRating({ value, onChange }) {
  return (
    <div className="flex h-12 items-center gap-1 rounded-md border border-mist bg-white px-3">
      {[1, 2, 3, 4, 5].map((rating) => {
        const active = rating <= value
        return (
          <button
            key={rating}
            type="button"
            aria-label={`${rating} star rating`}
            className={`grid h-9 w-9 place-items-center rounded-md transition hover:bg-amber-50 ${active ? 'text-amber-500' : 'text-stone-300'}`}
            onClick={() => onChange(rating)}
          >
            <Star size={23} fill={active ? 'currentColor' : 'none'} strokeWidth={2.2} />
          </button>
        )
      })}
    </div>
  )
}

function HotelBannerCarousel({ hotels, activeIndex }) {
  const hotel = hotels[activeIndex] || hotels[0]
  const offers = hotel?.offers || []
  return (
    <section className="relative overflow-hidden rounded-lg border border-mist bg-charcoal shadow-panel">
      <motion.img
        key={hotel.id}
        src={hotel.hero_image_url || fallbackHotelImage}
        alt={hotel.name}
        className="absolute inset-0 h-full w-full object-cover opacity-72"
        initial={{ opacity: 0, scale: 1.035 }}
        animate={{ opacity: 0.72, scale: 1 }}
        transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-charcoal/92 via-charcoal/55 to-charcoal/18" />
      <div className="relative grid min-h-[540px] gap-6 p-5 text-white sm:min-h-[500px] md:p-8 lg:grid-cols-[1fr_360px] lg:items-end">
        <motion.div key={`${hotel.id}-copy`} className="max-w-3xl self-end" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">Hotel {activeIndex + 1} of {hotels.length}</p>
          <h3 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl md:text-6xl">{cleanHotelName(hotel.name)}</h3>
          <p className="mt-5 line-clamp-5 max-w-2xl text-sm leading-7 text-white/82">{hotelSummary(hotel)}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a href={buildHotelUrl(hotel)} className="btn-dark w-full sm:w-auto">Enter this hotel <ArrowUpRight size={17} /></a>
            <a href={buildHotelUrl(hotel, '/#rooms')} className="btn-primary w-full bg-amber-600 hover:bg-amber-700 sm:w-auto">View rooms</a>
          </div>
        </motion.div>
        <div className="self-end rounded-lg border border-white/25 bg-white/12 p-4 backdrop-blur-xl">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-100"><Gift size={16} /> Signature notes</p>
          <div className="mt-3 grid gap-3">
            {(offers.length ? offers.slice(0, 2) : [{ title: 'Direct booking clarity', description: 'Live rooms, direct pricing, secure payment.' }]).map((offer) => (
              <div key={offer.title} className="rounded-md bg-white/14 p-3">
                <p className="font-extrabold">{offer.title}</p>
                <p className="mt-1 text-xs leading-5 text-white/72">{offer.description}</p>
              </div>
            ))}
          </div>
          {hotels.length > 1 ? (
            <div className="mt-5 grid gap-2">
              {hotels.map((item, index) => (
                <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs font-bold text-white/72">
                  <span className="truncate">{cleanHotelName(item.name)}</span>
                  <span className={index === activeIndex ? 'text-amber-100' : 'text-white/45'}>{index === activeIndex ? 'Now showing' : String(index + 1).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function GroupFooter({ hotels }) {
  const primarySocial = socialLinks(hotels)

  return (
    <footer className="bg-[linear-gradient(180deg,#222222_0%,#111111_100%)] py-12 text-white md:py-16">
      <div className="container-page grid gap-10 lg:grid-cols-[1.1fr_0.9fr_1fr_0.75fr]">
        <div>
          <img src="/mainlogo.png" alt="Ranjeet Groups of Hotels Akola logo" className="h-16 w-auto object-contain" />
          <p className="mt-5 text-3xl font-semibold leading-tight">Ranjeet Groups of Hotels Akola</p>
          <p className="mt-4 max-w-md text-sm leading-7 text-stone-300">
            A curated Akola hotel collection for direct booking, refined guest care, and distinct property experiences.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {primarySocial.map(({ label, href, icon: Icon }) => (
              <a key={label} href={href} target={href.startsWith('#') ? undefined : '_blank'} rel={href.startsWith('#') ? undefined : 'noreferrer'} aria-label={label} className="grid h-10 w-10 place-items-center rounded-md border border-white/12 bg-white/8 text-white transition hover:-translate-y-0.5 hover:border-amber-200/50 hover:bg-white/14">
                <Icon size={18} />
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-stone-400">Listed Hotels</p>
          <div className="mt-4 grid gap-3">
            {hotels.length ? hotels.map((hotel) => (
              <a key={hotel.id} href={buildHotelUrl(hotel)} className="group rounded-md border border-white/10 bg-white/5 p-3 transition hover:border-amber-200/40 hover:bg-white/10">
                <span className="block text-sm font-bold text-white group-hover:text-amber-100">{cleanHotelName(hotel.name)}</span>
                <span className="mt-1 flex items-center gap-2 text-xs font-semibold text-stone-400"><MapPin size={14} /> {cleanCity(hotel.address?.city)}, {hotel.address?.state || 'Maharashtra'}</span>
              </a>
            )) : <span className="text-sm text-stone-300">Properties will appear here after publishing.</span>}
          </div>
        </div>

        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-stone-400">Contact Numbers</p>
          <div className="mt-4 grid gap-3 text-sm text-stone-300">
            {hotels.length ? hotels.map((hotel) => (
              <div key={hotel.id} className="rounded-md border border-white/10 bg-white/5 p-3">
                <p className="font-bold text-white">{cleanHotelName(hotel.name)}</p>
                <p className="mt-2 flex items-center gap-2"><Phone size={15} className="text-amber-100" /> {hotelPhones(hotel).join(', ') || 'Phone number updating soon'}</p>
                {hotel.contact?.email ? <p className="mt-2 flex items-center gap-2"><Mail size={15} className="text-amber-100" /> {hotel.contact.email}</p> : null}
              </div>
            )) : <span>Contact details will appear with active hotels.</span>}
          </div>
        </div>

        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-stone-400">Explore</p>
          <div className="mt-4 grid gap-3 text-sm font-semibold text-stone-300">
            <a href="#properties" className="transition hover:text-white">Properties</a>
            <a href="#experience" className="transition hover:text-white">Experience</a>
            <a href="#feedback" className="transition hover:text-white">Feedback</a>
            <span className="flex items-center gap-2 pt-2 text-stone-400"><Globe2 size={16} /> Direct hotel websites</span>
            <span className="flex items-center gap-2 text-stone-400"><MapPin size={16} /> Akola, Maharashtra</span>
          </div>
        </div>
      </div>
      <div className="container-page mt-10 border-t border-white/10 pt-6">
        <div className="flex flex-col gap-4 text-sm text-stone-400 md:flex-row md:items-center md:justify-between">
          <p>&copy; {new Date().getFullYear()} Ranjeet Groups of Hotels Akola. All rights reserved.</p>
          <p>Direct bookings, guest feedback, offers, and hotel experiences in one collection.</p>
        </div>
      </div>
    </footer>
  )
}

function hotelPhones(hotel) {
  return [...new Set([...(hotel.contact?.phones || []), hotel.contact?.phone, hotel.contact?.whatsapp].filter(Boolean))]
}

function socialLinks(hotels) {
  const social = hotels.find((hotel) => hotel.contact?.social)?.contact?.social || {}
  const whatsapp = hotels.map((hotel) => hotel.contact?.whatsapp || hotel.contact?.phone).find(Boolean)
  return [
    { label: 'Facebook', href: platformUrl(social.facebook, 'facebook.com') || '#properties', icon: Facebook },
    { label: 'Instagram', href: platformUrl(social.instagram, 'instagram.com') || '#properties', icon: Instagram },
    { label: 'WhatsApp', href: whatsapp ? `https://wa.me/${String(whatsapp).replace(/\D/g, '')}` : '#properties', icon: MessageCircle },
    { label: 'LinkedIn', href: platformUrl(social.linkedin, 'linkedin.com') || '#properties', icon: Linkedin },
    { label: 'X Twitter', href: platformUrl(social.twitter || social.x, 'x.com') || platformUrl(social.twitter || social.x, 'twitter.com') || '#properties', icon: Twitter },
  ]
}

function platformUrl(value, domain) {
  const url = String(value || '').trim()
  return url.includes(domain) ? url : ''
}
