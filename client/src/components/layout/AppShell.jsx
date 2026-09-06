import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, CalendarDays, Instagram, Menu, Phone, Sparkles, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ContactPanel } from '../contact/ContactPanel.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../modules/auth/authContext.js'
import { apiFetch } from '../../services/apiClient.js'
import { buildTenantPath, isConsolePath, stripTenantFromPath } from '../../modules/tenant/resolveTenant.js'

const fallbackHomeMediaImage = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=80'

export function AppShell({ children, mode }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { isAuthenticated, firebaseUser } = useAuth()
  const isConsoleRoute = isConsolePath(location.pathname, mode)
  const tenant = useAsync(
    () => (mode.isTenant && !isConsoleRoute ? apiFetch('/tenant') : Promise.resolve({ hotel: null, offers: [] })),
    mode.isTenant && !isConsoleRoute ? `tenant:${mode.key}:${firebaseUser?.uid || 'guest'}:${firebaseUser?.emailVerified ? 'verified' : 'unverified'}` : 'group',
  )
  const hotel = tenant.data?.hotel
  const offers = tenant.data?.offers || []
  const brandName = mode.isTenant ? hotel?.branding?.logoText || hotel?.name || 'R.S. Exclusive' : 'Ranjeet Groups of Hotels Akola'
  const subline = mode.isTenant ? hotel?.address?.city || 'Boutique hospitality' : 'Independent hotel collection'
  const accountLabel = isAuthenticated ? firstName(firebaseUser?.displayName || firebaseUser?.email || 'Account') : 'Login / Join'
  const accountPath = isAuthenticated ? tenantPath('/account', mode) : tenantPath('/login?mode=register', mode)
  const accountTitle = isAuthenticated ? firebaseUser?.email || 'Account' : 'Login or join'
  const isTenantHome = mode.isTenant && stripTenantFromPath(location.pathname, mode) === '/'
  const showOfferTicker = mode.isTenant && offers.length && !isConsoleRoute
  const headerClass = isTenantHome
    ? 'sticky top-0 z-40 border-b border-transparent bg-transparent text-white'
    : 'sticky top-0 z-40 border-b border-white/10 bg-[#070707] text-white shadow-[0_18px_42px_rgba(0,0,0,0.42)]'

  const nav = mode.isTenant
    ? [
        ['Hotel', tenantPath('/#hotel', mode)],
        ['Offers', tenantPath('/#offers', mode)],
        ['Rooms', tenantPath('/#rooms', mode)],
        ['Experience', tenantPath('/#experience', mode)],
      ]
    : [
        ['Properties', '/#properties'],
        ['About', '/#experience'],
        ['Gallery', '/#gallery'],
        ['Feedback', '/#feedback'],
      ]

  useEffect(() => {
    setOpen(false)
  }, [location.pathname, location.search, location.hash])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (isConsoleRoute) {
    return <div className="min-h-screen bg-steel text-charcoal">{children}</div>
  }

  return (
    <div className="relative min-h-screen bg-ivory text-charcoal">
      {isTenantHome ? <TenantMediaBackdrop hotel={hotel} full /> : null}
      {isTenantHome ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed inset-x-0 top-0 z-30 bg-[linear-gradient(180deg,rgba(0,0,0,0.98)_0%,rgba(0,0,0,0.90)_42%,rgba(0,0,0,0.68)_66%,rgba(0,0,0,0.32)_84%,rgba(0,0,0,0)_100%)] ${showOfferTicker ? 'h-[176px]' : 'h-[112px]'}`}
        />
      ) : null}
      <header className={headerClass}>
        <div className="container-page flex min-h-[72px] items-center justify-between gap-4">
          <Link to={tenantPath('/', mode)} className="group flex min-w-0 items-center gap-3">
            <span className={`grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md text-base font-bold transition ${hotel?.branding?.logoUrl ? 'bg-transparent' : 'bg-white text-gray-900 group-hover:bg-amberline group-hover:text-white'}`}>
              {hotel?.branding?.logoUrl ? (
                <img src={hotel.branding.logoUrl} alt={`${brandName} logo`} className="h-full w-full object-contain" />
              ) : (
                initials(brandName)
              )}
            </span>
            <span className="min-w-0 leading-tight [text-shadow:0_3px_16px_rgba(0,0,0,0.78)]">
              <span className="block truncate text-lg font-bold text-white">{brandName}</span>
              <span className="block truncate text-[0.68rem] font-bold uppercase tracking-[0.12em] text-white/60">{subline}</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map(([label, to]) => (
              <Link key={`${label}-${to}`} to={to} className="rounded-md px-3 py-2 text-sm font-bold text-white/78 [text-shadow:0_2px_14px_rgba(0,0,0,0.72)] transition hover:-translate-y-0.5 hover:bg-white/10 hover:text-white">
                {label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {mode.isTenant ? (
              <Link to={tenantPath('/book', mode)} className="btn-primary !min-h-10 !px-4 shadow-none">
                <CalendarDays size={17} /> Book Your Stay
              </Link>
            ) : (
              <Link to="/#properties" className="btn-dark !min-h-10 !px-4">
                Explore Hotels <ArrowUpRight size={17} />
              </Link>
            )}
            {mode.isTenant && isAuthenticated ? (
              <Link className="btn-dark !min-h-10 !px-3" to={accountPath} title={accountTitle}>
                <UserRound size={17} />
                {accountLabel}
              </Link>
            ) : mode.isTenant ? (
              <Link to={tenantPath('/login?mode=register', mode)} className="btn-dark !min-h-10 !px-4">{accountLabel}</Link>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            {mode.isTenant ? (
              <Link
                to={accountPath}
                title={accountTitle}
                aria-label={accountTitle}
                className="grid h-11 w-11 place-items-center rounded-md border border-white/15 bg-white/10 text-white shadow-sm transition hover:bg-white/20"
              >
                <UserRound size={20} />
              </Link>
            ) : null}
            <button
              className={`grid h-11 w-11 place-items-center rounded-md border shadow-sm transition hover:-translate-y-0.5 hover:shadow-card ${
                isTenantHome
                  ? 'border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/18'
                  : 'border-white/15 bg-white text-gray-900 hover:bg-amberline hover:text-white'
              }`}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open ? (
            <motion.div
              className="fixed inset-0 z-50 bg-charcoal/55 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onMouseDown={() => setOpen(false)}
            >
              <motion.aside
                className="flex h-full w-[min(88vw,360px)] flex-col border-r border-mist bg-white shadow-2xl"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex min-h-[72px] items-center justify-between border-b border-mist px-4">
                  <Link to={tenantPath('/', mode)} onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md text-sm font-bold ${hotel?.branding?.logoUrl ? 'bg-transparent' : 'bg-charcoal text-white'}`}>
                      {hotel?.branding?.logoUrl ? <img src={hotel.branding.logoUrl} alt={`${brandName} logo`} className="h-full w-full object-contain" /> : initials(brandName)}
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-base font-bold text-charcoal">{brandName}</span>
                      <span className="block truncate text-[0.66rem] font-bold uppercase tracking-[0.12em] text-stone-500">{subline}</span>
                    </span>
                  </Link>
                  <button className="grid h-10 w-10 place-items-center rounded-md border border-mist bg-white text-charcoal" type="button" onClick={() => setOpen(false)} aria-label="Close menu">
                    <X size={19} />
                  </button>
                </div>

                <nav className="grid gap-2 px-4 py-5">
                  {nav.map(([label, to]) => (
                    <Link key={`${label}-${to}`} to={to} onClick={() => setOpen(false)} className="rounded-md border border-transparent px-3 py-3 text-sm font-bold text-charcoal transition hover:border-mist hover:bg-bone">
                      {label}
                    </Link>
                  ))}
                </nav>

                <div className="mt-auto grid gap-3 border-t border-mist bg-bone/70 p-4">
                  {mode.isTenant ? <Link to={accountPath} onClick={() => setOpen(false)} className="btn-secondary w-full">
                    <UserRound size={17} /> {accountLabel}
                  </Link> : null}
                  {mode.isTenant ? <Link to={tenantPath('/book', mode)} onClick={() => setOpen(false)} className="btn-primary w-full"><CalendarDays size={17} /> Book Your Stay</Link> : null}
                  {!mode.isTenant ? <Link to="/#properties" onClick={() => setOpen(false)} className="btn-primary w-full">Explore Hotels <ArrowUpRight size={17} /></Link> : null}
                </div>
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      {showOfferTicker && !open ? <OfferTicker offers={offers} mode={mode} floating={isTenantHome} /> : null}

      <div className={isTenantHome ? 'relative z-10' : undefined}>{children}</div>

      {mode.isTenant && hotel && !isConsoleRoute ? <ContactPanel hotel={hotel} /> : null}

      <footer className="relative z-10 bg-charcoal py-12 text-white md:py-16">
        <div className="container-page grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div>
            <p className="text-4xl font-semibold">{brandName}</p>
            <p className="mt-4 max-w-md text-sm leading-7 text-stone-300">
              {hotel?.description || 'A refined hospitality platform for distinctive independent hotel experiences.'}
            </p>
            {mode.isTenant ? <Link to={tenantPath('/book', mode)} className="btn-dark mt-6"><CalendarDays size={18} /> Book Your Stay</Link> : null}
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-stone-400">Hotel</p>
            <div className="mt-4 grid gap-3 text-sm text-stone-300">
              <span>{hotel?.address?.line1 || 'R.S. Exclusive Collection'}</span>
              <span>{[hotel?.address?.city, hotel?.address?.state, hotel?.address?.country].filter(Boolean).join(', ') || 'India'}</span>
              <span>{hotel?.policies?.checkIn ? `Check-in ${hotel.policies.checkIn} / Check-out ${hotel.policies.checkOut}` : 'Secure bookings and tenant-isolated operations'}</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-stone-400">Contact</p>
            <div className="mt-4 grid gap-3 text-sm text-stone-300">
              <span className="flex items-center gap-2"><Phone size={16} /> {hotel?.contact?.phone || '+91 90000 00000'}</span>
              <span>{hotel?.contact?.email || 'bookings@example.com'}</span>
              <span className="flex items-center gap-2"><Instagram size={16} /> Social channels</span>
            </div>
          </div>
        </div>
        <div className="container-page mt-3 border-t border-white/10 pt-6">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-stone-500">Developed by</p>
            <span className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm font-black tracking-[0.12em] text-white">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-transparent text-[0.65rem]">
              <img src="https://www.webreich.in/logo.png" alt="WR" />
              </span>
              WEBREICH
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function TenantMediaBackdrop({ hotel, full = false }) {
  const image = hotel?.hero_image_url || fallbackHomeMediaImage
  const media = getBackgroundVideoSource(hotel?.branding?.youtubeEmbedUrl)
  const frameClass = full
    ? 'pointer-events-none fixed inset-0 z-0 overflow-hidden bg-charcoal'
    : 'pointer-events-none fixed inset-x-0 top-0 z-0 h-[136px] overflow-hidden bg-charcoal'

  return (
    <div aria-hidden="true" className={frameClass}>
      {media?.type === 'youtube' ? (
        <iframe
          className="absolute left-1/2 top-1/2 min-w-full border-0"
          style={{
            width: full ? 'max(100vw, 177.78svh)' : 'max(100vw, 242px)',
            height: full ? 'max(calc(100svh + 176px), calc(56.25vw + 176px))' : 'max(312px, calc(56.25vw + 176px))',
            transform: 'translate(-50%, -50%) scale(1.22)',
            transformOrigin: 'center',
          }}
          src={media.src}
          title=""
          allow="autoplay; encrypted-media; picture-in-picture"
          tabIndex={-1}
        />
      ) : null}
      {media?.type === 'file' ? <video className="absolute inset-0 h-full w-full object-cover object-top" src={media.src} poster={image} autoPlay muted loop playsInline /> : null}
      {!media ? <img className="absolute inset-0 h-full w-full object-cover object-top" src={image} alt="" /> : null}
    </div>
  )
}

function OfferTicker({ offers, mode, floating = false }) {
  const tickerClass = floating
    ? 'fixed inset-x-0 top-[72px] z-40 bg-[#070707]/78 text-white'
    : 'sticky top-[72px] z-30 border-b border-white/10 bg-[linear-gradient(180deg,#101010_0%,#070707_100%)] text-white shadow-[0_14px_34px_rgba(0,0,0,0.36)]'

  return (
    <div className={tickerClass}>
      <Link to={tenantPath('/#offers', mode)} className="container-page flex min-h-10 items-center gap-2 overflow-hidden text-xs font-extrabold text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.76)] sm:min-h-11 sm:text-sm">
        <span className="hidden shrink-0 rounded-full border border-white/18 bg-white/10 px-3 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] sm:inline-flex">
          Offers
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="offer-marquee inline-flex gap-10 whitespace-nowrap">
            {[...offers, ...offers].map((offer, index) => (
              <span key={`${offer.id || offer.title}-${index}`} className="inline-flex items-center gap-2">
                <Sparkles size={15} className="text-amber-200" />
                <span>{offer.title}</span>
                <span className="font-semibold text-white/68">{formatOfferValue(offer)}</span>
              </span>
            ))}
          </span>
        </span>
      </Link>
    </div>
  )
}

function formatOfferValue(offer) {
  if (!offer?.discount_type) return offer?.description || ''
  const value = Number(offer.discount_value || 0)
  if (offer.discount_type === 'percentage') return `${value}% off direct bookings`
  return `Rs ${value.toLocaleString('en-IN')} off direct bookings`
}

function initials(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function firstName(value) {
  return String(value || 'Account').split(/[ @]/).filter(Boolean)[0] || 'Account'
}

function tenantPath(path, mode) {
  return buildTenantPath(path, mode)
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
