import { ArrowUpRight, Building2, ChevronLeft, ChevronRight, Gift, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { Seo } from '../../components/seo/Seo.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { buildHotelUrl } from '../tenant/resolveTenant.js'

const fallbackHotelImage = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=80'
const groupHero = 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=2200&q=80'

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

  return (
    <main className="overflow-hidden">
      <Seo
        title="R.S. Exclusive Stay & Fine Dine"
        description="Discover premium R.S. Exclusive hotels and book refined stays through one secure hospitality platform."
      />

      <section className="relative min-h-[calc(100vh-72px)] overflow-hidden bg-charcoal">
        <motion.img
          className="absolute inset-0 h-full w-full object-cover opacity-82"
          src={groupHero}
          alt="Premium hotel lobby"
          initial={{ scale: 1.05 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal/82 via-charcoal/40 to-charcoal/10" />
        <div className="container-page relative flex min-h-[calc(100vh-72px)] items-center py-14">
          <FadeIn viewport={false} className="max-w-3xl text-white">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/74">R.S. Exclusive Stay & Fine Dine</p>
            <h1 className="mt-5 text-5xl font-bold leading-tight md:text-7xl">Independent hotels, composed into one refined collection.</h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-white/84">
              Discover distinctive properties with individual character, direct booking clarity, and a quieter standard of hospitality.
            </p>
            <a href="#properties" className="btn-dark mt-8">Choose a property <ArrowUpRight size={18} /></a>
          </FadeIn>
        </div>
      </section>

      <section id="experience" className="container-page section-pad">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <FadeIn>
            <p className="eyebrow">Collection philosophy</p>
            <h2 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">A shared platform, without losing each hotel's soul.</h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-base leading-8 text-stone-600">
              Each hotel keeps its own identity, imagery, rooms, policies, and guest experience. The platform simply makes discovery and booking feel seamless.
            </p>
          </FadeIn>
        </div>
      </section>

      <section id="properties" className="container-page pb-16 md:pb-24">
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
          <Stagger className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {hotels.map((hotel, index) => (
              <StaggerItem key={hotel.id}>
                <article className="group grid h-full overflow-hidden rounded-lg border border-mist bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-card">
                  <div className="image-lift rounded-none">
                    <img src={hotel.hero_image_url || fallbackHotelImage} alt={hotel.name} className="h-72 w-full object-cover" loading={index ? 'lazy' : 'eager'} />
                  </div>
                  <div className="flex flex-col justify-between p-5">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
                        <MapPin size={15} /> {hotel.address?.city || 'India'}, {hotel.address?.state || 'Configured soon'}
                      </p>
                      <h3 className="mt-4 text-2xl font-bold leading-tight">{hotel.name}</h3>
                      <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600">{hotel.description}</p>
                    </div>
                    <div className="mt-8 flex flex-col gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <span className="rounded-md bg-bone px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-amberline">Open for booking</span>
                      <a href={buildHotelUrl(hotel)} className="btn-primary">
                        Enter hotel <ArrowUpRight size={17} />
                      </a>
                    </div>
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
              The platform is clean and ready. Create the first hotel from the Super Admin console to publish it here.
            </p>
          </FadeIn>
        )}
      </section>
    </main>
  )
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
