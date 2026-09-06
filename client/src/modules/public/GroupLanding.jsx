import { ArrowUpRight, Building2, ChevronLeft, ChevronRight, Gift, Image, MapPin, Send, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { Seo } from '../../components/seo/Seo.jsx'
import { useAsync } from '../../hooks/useAsync.js'
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
    }, 5200)
    return () => window.clearInterval(timer)
  }, [hotels.length])

  if (loading) return <LoadingState label="Preparing properties" />
  const activeHotel = hotels[activeHotelIndex] || hotels[0]
  const heroImage = activeHotel?.hero_image_url || groupFallbackHero

  return (
    <main className="overflow-hidden">
      <Seo
        title="Ranjeet Groups of Hotels Akola"
        description="Discover the Ranjeet Groups of Hotels Akola collection and enter each hotel's own booking website."
      />

      <section className="relative min-h-[calc(100svh-72px)] overflow-hidden bg-charcoal">
        <div className="absolute inset-0">
          {hotels.length ? hotels.map((hotel, index) => (
            <motion.img
              key={hotel.id}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${index === activeHotelIndex ? 'opacity-85' : 'opacity-0'}`}
              src={hotel.hero_image_url || fallbackHotelImage}
              alt=""
              initial={false}
              animate={{ scale: index === activeHotelIndex ? 1.03 : 1 }}
              transition={{ duration: 6, ease: 'linear' }}
              aria-hidden="true"
            />
          )) : (
            <motion.img
              className="absolute inset-0 h-full w-full object-cover opacity-85"
              src={heroImage}
              alt=""
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden="true"
            />
          )}
        </div>
        <div className="absolute inset-0 bg-black/16" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/44 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/48 to-transparent" />
        <div className="container-page relative flex min-h-[calc(100svh-72px)] items-center pb-20 pt-14">
          <FadeIn viewport={false} className="max-w-4xl text-white">
            <p className="inline-flex rounded-md bg-black/34 px-3 py-2 text-xs font-black uppercase tracking-[0.22em] text-amber-100">Ranjeet Groups of Hotels Akola</p>
            <h1 className="mt-5 text-5xl font-black leading-[0.98] text-white drop-shadow-[0_6px_26px_rgba(0,0,0,0.55)] md:text-7xl">Independent hotels, composed into one refined collection.</h1>
            <p className="mt-7 max-w-xl text-base font-medium leading-8 text-white/88">
              Explore every property in the Akola collection, then enter the hotel website that fits your stay.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#properties" className="btn-dark">Choose a property <ArrowUpRight size={18} /></a>
              {activeHotel ? <a href={buildHotelUrl(activeHotel)} className="btn-primary">Open {activeHotel.name}</a> : null}
            </div>
          </FadeIn>
        </div>
        {hotels.length > 1 ? (
          <div className="container-page absolute inset-x-0 bottom-5">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {hotels.map((hotel, index) => (
                <button
                  key={hotel.id}
                  className={`min-w-40 rounded-md border px-3 py-2 text-left text-white backdrop-blur-md transition ${index === activeHotelIndex ? 'border-white bg-white/22' : 'border-white/22 bg-black/22 hover:bg-white/12'}`}
                  type="button"
                  onClick={() => setActiveHotelIndex(index)}
                >
                  <span className="block truncate text-xs font-black uppercase tracking-[0.14em] text-white/60">Hotel {index + 1}</span>
                  <span className="block truncate text-sm font-extrabold">{hotel.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section id="experience" className="bg-white">
        <div className="container-page section-pad">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <FadeIn>
            <p className="eyebrow">About the group</p>
            <h2 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">One Akola hospitality group, many distinct hotel experiences.</h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-base leading-8 text-stone-600">
              Ranjeet Groups of Hotels Akola brings independent hotels together with a shared standard for discovery, direct booking, guest care, and hotel-level management.
            </p>
          </FadeIn>
        </div>
        </div>
      </section>

      <section id="properties" className="bg-white">
      <div className="container-page pb-16 md:pb-24">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Properties</p>
            <h2 className="page-title">Select your destination</h2>
          </div>
        </div>
        {error ? (
          <div className="panel p-6">
            <p className="font-bold text-red-700">Could not load hotels.</p>
            <p className="mt-2 text-sm text-stone-600">{error.message}</p>
          </div>
        ) : hotels.length ? (
          <>
          <HotelBannerCarousel hotels={hotels} activeIndex={activeHotelIndex} setActiveIndex={setActiveHotelIndex} />
          <Stagger className="mt-8 grid gap-4">
            {hotels.map((hotel, index) => (
              <StaggerItem key={hotel.id}>
                <article className="group grid overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-card md:grid-cols-[280px_minmax(0,1fr)_220px]">
                  <div className="image-lift h-56 rounded-none md:h-full md:min-h-[15rem]">
                    <img src={hotel.hero_image_url || fallbackHotelImage} alt={hotel.name} className="h-full w-full object-cover" loading={index ? 'lazy' : 'eager'} />
                  </div>
                  <div className="flex min-w-0 flex-col justify-between p-5">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
                        <MapPin size={15} /> {hotel.address?.city || 'India'}, {hotel.address?.state || 'Configured soon'}
                      </p>
                      <h3 className="mt-4 text-2xl font-bold leading-tight">{hotel.name}</h3>
                      <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-7 text-stone-600">{hotel.description}</p>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-200 pt-4">
                      <span className="rounded-md bg-bone px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-amberline">Open for booking</span>
                      <span className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">Direct rates</span>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between border-t border-emerald-200 bg-[linear-gradient(180deg,#ecfdf5_0%,#ffffff_100%)] p-4 md:border-l md:border-t-0">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Hotel site</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">Enter the property page for rooms, offers, amenities, and direct booking.</p>
                    </div>
                    <a href={buildHotelUrl(hotel)} className="btn-primary mt-4 w-full">
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

      <section id="gallery" className="bg-[#f7f7f7]">
        <div className="container-page section-pad">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Gallery</p>
              <h2 className="page-title">A quick look across the collection</h2>
            </div>
          </div>
          <Stagger className="grid gap-3 md:grid-cols-4 md:grid-rows-[210px_210px]">
            {galleryImages(hotels).map((item, index) => (
              <StaggerItem key={`${item.url}-${index}`} className={`image-lift ${index === 0 ? 'md:col-span-2 md:row-span-2' : ''}`}>
                <img src={item.url} alt={item.alt} loading={index ? 'lazy' : 'eager'} className="h-full min-h-52 w-full object-cover" />
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <GroupFeedback hotels={hotels} />
    </main>
  )
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
  const [form, setForm] = useState({ hotelKey: hotels[0]?.subdomain || hotels[0]?.slug || '', name: '', email: '', phone: '', rating: '5', message: '' })
  const [status, setStatus] = useState({ loading: false, type: '', message: '' })

  useEffect(() => {
    if (!form.hotelKey && hotels[0]) setForm((current) => ({ ...current, hotelKey: hotels[0].subdomain || hotels[0].slug }))
  }, [form.hotelKey, hotels])

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
      setForm({ hotelKey, name: '', email: '', phone: '', rating: '5', message: '' })
      setStatus({ loading: false, type: 'success', message: 'Feedback saved for the selected hotel team.' })
    } catch (error) {
      setStatus({ loading: false, type: 'error', message: error.message })
    }
  }

  return (
    <section id="feedback" className="bg-white">
      <div className="container-page grid gap-6 py-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <p className="eyebrow">Feedback</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">Send feedback to the right hotel.</h2>
          <p className="mt-4 text-sm leading-7 text-stone-600">Choose the property and your note will appear in that hotel's admin panel.</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-md bg-bone px-3 py-2 text-sm font-bold text-stone-600">
            <Image size={17} className="text-amberline" /> {hotels.length || 0} public hotels
          </div>
        </div>
        <form onSubmit={submit} className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-panel md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="label">Hotel</span>
            <select className="input" value={form.hotelKey} onChange={(event) => setForm({ ...form, hotelKey: event.target.value })} required>
              <option value="">Select hotel</option>
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.subdomain || hotel.slug}>{hotel.name}</option>)}
            </select>
          </label>
          <Field label="Name"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Rating">
            <select className="input" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })}>
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Good</option>
              <option value="3">3 - Average</option>
              <option value="2">2 - Needs attention</option>
              <option value="1">1 - Poor</option>
            </select>
          </Field>
          <label className="md:col-span-2">
            <span className="label">Feedback</span>
            <textarea className="input min-h-24 py-3" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} required />
          </label>
          {status.message ? <p className={`rounded-md border p-3 text-sm font-semibold md:col-span-2 ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{status.message}</p> : null}
          <button className="btn-primary md:col-span-2" disabled={status.loading || !hotels.length} type="submit">
            {status.loading ? <Send size={18} /> : <Star size={18} />} {status.loading ? 'Saving...' : 'Send feedback'}
          </button>
        </form>
      </div>
    </section>
  )
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function HotelBannerCarousel({ hotels, activeIndex, setActiveIndex }) {
  const hotel = hotels[activeIndex] || hotels[0]
  const offers = hotel?.offers || []
  return (
    <section className="relative overflow-hidden rounded-lg border border-mist bg-charcoal shadow-panel">
      <img src={hotel.hero_image_url || fallbackHotelImage} alt={hotel.name} className="absolute inset-0 h-full w-full object-cover opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-r from-charcoal/90 via-charcoal/45 to-charcoal/20" />
      <div className="relative grid min-h-[460px] gap-6 p-5 text-white md:p-8 lg:grid-cols-[1fr_360px] lg:items-end">
        <div className="max-w-3xl self-end">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">Hotel {activeIndex + 1} of {hotels.length}</p>
          <h3 className="mt-4 text-4xl font-bold leading-tight md:text-6xl">{hotel.name}</h3>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/82">{hotel.description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={buildHotelUrl(hotel)} className="btn-dark">Enter this hotel <ArrowUpRight size={17} /></a>
            <a href={buildHotelUrl(hotel, '/#rooms')} className="btn-primary bg-amber-600 hover:bg-amber-700">View rooms</a>
          </div>
        </div>
        <div className="self-end rounded-lg border border-white/25 bg-white/12 p-4 backdrop-blur-xl">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-100"><Gift size={16} /> Hotel offers</p>
          <div className="mt-3 grid gap-3">
            {(offers.length ? offers.slice(0, 2) : [{ title: 'Direct booking clarity', description: 'Live rooms, direct pricing, secure payment.' }]).map((offer) => (
              <div key={offer.title} className="rounded-md bg-white/14 p-3">
                <p className="font-extrabold">{offer.title}</p>
                <p className="mt-1 text-xs leading-5 text-white/72">{offer.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      {hotels.length > 1 ? (
        <>
          <button className="absolute left-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md border border-white/30 bg-white/20 text-white backdrop-blur-md" type="button" aria-label="Previous hotel" onClick={() => setActiveIndex((activeIndex - 1 + hotels.length) % hotels.length)}><ChevronLeft size={20} /></button>
          <button className="absolute right-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md border border-white/30 bg-white/20 text-white backdrop-blur-md" type="button" aria-label="Next hotel" onClick={() => setActiveIndex((activeIndex + 1) % hotels.length)}><ChevronRight size={20} /></button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {hotels.map((item, index) => <button key={item.id} className={`h-2.5 rounded-full transition-all ${index === activeIndex ? 'w-8 bg-white' : 'w-2.5 bg-white/45'}`} type="button" aria-label={`Show ${item.name}`} onClick={() => setActiveIndex(index)} />)}
          </div>
        </>
      ) : null}
    </section>
  )
}
