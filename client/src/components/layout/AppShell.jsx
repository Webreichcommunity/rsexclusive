import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, Instagram, LayoutDashboard, Menu, Phone, Sparkles, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ContactPanel } from '../contact/ContactPanel.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { useAuth } from '../../modules/auth/authContext.js'
import { apiFetch } from '../../services/apiClient.js'

export function AppShell({ children, mode }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { isAuthenticated, firebaseUser } = useAuth()
  const tenant = useAsync(() => (mode.isTenant ? apiFetch('/tenant') : Promise.resolve({ hotel: null })), mode.isTenant ? `tenant:${mode.key}:${firebaseUser?.uid || 'guest'}:${firebaseUser?.emailVerified ? 'verified' : 'unverified'}` : 'group')
  const hotel = tenant.data?.hotel
  const offers = tenant.data?.offers || []
  const brandName = hotel?.branding?.logoText || hotel?.name || 'R.S. Exclusive'
  const subline = mode.isTenant ? hotel?.address?.city || 'Boutique hospitality' : 'Stay & Fine Dine'
  const accountLabel = isAuthenticated ? firstName(firebaseUser?.displayName || firebaseUser?.email || 'Account') : 'Login / Join'
  const accountPath = isAuthenticated ? '/account' : tenantPath('/login?mode=register', mode)
  const accountTitle = isAuthenticated ? firebaseUser?.email || 'Account' : 'Login or join'

  const nav = mode.isTenant
    ? [
        ['Hotel', tenantPath('/#hotel', mode)],
        ['Rooms', tenantPath('/book', mode)],
        ['Experience', tenantPath('/#experience', mode)],
        ...(offers.length ? [['Offers', tenantPath('/#offers', mode)]] : []),
      ]
    : [
        ['Properties', '/#properties'],
        ['Experience', '/#experience'],
        ['Super Admin', '/super-admin'],
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

  return (
    <div className="min-h-screen bg-ivory text-charcoal">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-gray-900 text-white shadow-sm">
        <div className="container-page flex min-h-[72px] items-center justify-between gap-4">
          <Link to={tenantPath('/', mode)} className="group flex min-w-0 items-center gap-3">
            <span className={`grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md text-base font-bold transition ${hotel?.branding?.logoUrl ? 'bg-white/5' : 'bg-white text-gray-900 group-hover:bg-amberline group-hover:text-white'}`}>
              {hotel?.branding?.logoUrl ? (
                <img src={hotel.branding.logoUrl} alt={`${brandName} logo`} className="h-full w-full object-contain" />
              ) : (
                initials(brandName)
              )}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-lg font-bold text-white">{brandName}</span>
              <span className="block truncate text-[0.68rem] font-bold uppercase tracking-[0.12em] text-white/60">{subline}</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map(([label, to]) => (
              <Link key={`${label}-${to}`} to={to} className="rounded-md px-3 py-2 text-sm font-bold text-white/72 transition hover:-translate-y-0.5 hover:bg-white/10 hover:text-white">
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
              <Link to="/super-admin" className="btn-dark !min-h-10 !px-4">
                <LayoutDashboard size={17} /> Console
              </Link>
            )}
            {isAuthenticated ? (
              <Link className="btn-dark !min-h-10 !px-3" to="/account" title={accountTitle}>
                <UserRound size={17} />
                {accountLabel}
              </Link>
            ) : (
              <Link to={tenantPath('/login?mode=register', mode)} className="btn-dark !min-h-10 !px-4">{accountLabel}</Link>
            )}
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
              className="grid h-11 w-11 place-items-center rounded-md border border-white/15 bg-white text-gray-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-amberline hover:text-white hover:shadow-card"
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
                    <span className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md text-sm font-bold ${hotel?.branding?.logoUrl ? 'bg-white' : 'bg-charcoal text-white'}`}>
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
                  <Link to={accountPath} onClick={() => setOpen(false)} className="btn-secondary w-full">
                    <UserRound size={17} /> {accountLabel}
                  </Link>
                  {mode.isTenant ? <Link to={tenantPath('/book', mode)} onClick={() => setOpen(false)} className="btn-primary w-full"><CalendarDays size={17} /> Book Your Stay</Link> : null}
                  {!mode.isTenant ? <Link to="/super-admin" onClick={() => setOpen(false)} className="btn-primary w-full"><LayoutDashboard size={17} /> Console</Link> : null}
                </div>
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      {mode.isTenant && offers.length && !location.pathname.startsWith('/admin') ? <OfferTicker offers={offers} mode={mode} /> : null}

      {children}

      {mode.isTenant && hotel && !location.pathname.startsWith('/admin') ? <ContactPanel hotel={hotel} /> : null}

      <footer className="bg-charcoal py-12 text-white md:py-16">
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

function OfferTicker({ offers, mode }) {
  return (
    <div className="sticky top-[72px] z-30 border-b border-amberline/10 bg-[linear-gradient(120deg,rgba(255,255,255,0.98),rgba(250,247,241,0.94),rgba(127,29,29,0.08))] text-charcoal shadow-sm backdrop-blur-xl">
      <Link to={tenantPath('/#offers', mode)} className="container-page flex min-h-11 items-center gap-4 overflow-hidden text-sm font-extrabold text-charcoal">
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="offer-marquee inline-flex gap-7 whitespace-nowrap">
            {[...offers, ...offers].map((offer, index) => (
              <span key={`${offer.id || offer.title}-${index}`} className="inline-flex items-center gap-2">
                <Sparkles size={15} className="text-amberline" />
                <span>{offer.title}</span>
                <span className="font-semibold text-stone-600">{formatOfferValue(offer)}</span>
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
  if (!mode?.isTenant || !mode.key || !['query', 'local-storage'].includes(mode.source)) return path
  const [baseWithSearch, hash = ''] = path.split('#')
  const [base, search = ''] = baseWithSearch.split('?')
  const params = new URLSearchParams(search)
  params.set('hotel', mode.key)
  const query = params.toString()
  return `${base}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`
}
