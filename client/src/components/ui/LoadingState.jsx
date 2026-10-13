import { useEffect, useState } from 'react'
import { getPublicHotelLoadingProfile } from '../../services/apiClient.js'

export function LoadingState({ label = 'Loading', brand }) {
  const [profile, setProfile] = useState(() => getPublicHotelLoadingProfile())
  const displayBrand = brand || profile.name || getLoadingBrand()
  const image = profile.images?.[0] || ''
  const status = loadingStatus(label)

  useEffect(() => {
    const refresh = () => setProfile(getPublicHotelLoadingProfile())
    window.addEventListener('rs-exclusive-public-media-ready', refresh)
    return () => window.removeEventListener('rs-exclusive-public-media-ready', refresh)
  }, [])

  return (
    <div className="relative min-h-[calc(100svh-72px)] overflow-hidden bg-charcoal text-white">
      {image ? (
        <img
          src={image}
          alt=""
          className="loading-kenburns absolute inset-0 h-full w-full object-cover"
          loading="eager"
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_42%,rgba(127,29,29,0.34),transparent_34%),linear-gradient(135deg,#111111_0%,#222222_52%,#0c0a09_100%)]" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.86)_0%,rgba(0,0,0,0.58)_48%,rgba(0,0,0,0.24)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 to-transparent" />

      <div className="container-page relative flex min-h-[calc(100svh-72px)] items-center py-12">
        <div className="max-w-2xl">
          <p className="inline-flex max-w-full rounded-md border border-white/18 bg-white/10 px-3 py-2 text-[0.66rem] font-black uppercase leading-5 tracking-[0.14em] text-amber-100 shadow-[0_14px_42px_rgba(0,0,0,0.22)] backdrop-blur-md sm:text-xs sm:tracking-[0.18em]">
            {profile.city ? `${profile.city} hospitality` : 'Direct hotel booking'}
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.58)] sm:text-5xl md:text-6xl">
            {displayBrand}
          </h1>
          <p className="mt-5 max-w-xl text-base font-semibold leading-8 text-white/86 md:text-lg">
            {status}
          </p>
          <p className="mt-3 max-w-xl text-sm font-bold leading-7 text-amber-100/90">
            Please stay with us, we are crafting the best experience for you.
          </p>

          <div className="mt-8 max-w-xl">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="loading-progress h-full rounded-full bg-white" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.12em] text-white/74">
              <span className="rounded-md border border-white/16 bg-white/10 px-3 py-2 backdrop-blur-md">Rooms</span>
              <span className="rounded-md border border-white/16 bg-white/10 px-3 py-2 backdrop-blur-md">Offers</span>
              <span className="rounded-md border border-white/16 bg-white/10 px-3 py-2 backdrop-blur-md">Gallery</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getLoadingBrand() {
  if (typeof window === 'undefined') return 'Ranjeet Groups of Hotels Akola'
  const params = new URLSearchParams(window.location.search)
  const tenant = params.get('hotel') || pathTenant() || safeLocalStorage('rs-exclusive-local-tenant')
  return tenant ? tenantDisplayName(tenant) : 'Ranjeet Groups of Hotels Akola'
}

function safeLocalStorage(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return ''
  }
}

function toTitle(value) {
  return String(value || '')
    .split(/[-_\s.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function pathTenant() {
  const segment = String(window.location.pathname || '').split('/').filter(Boolean)[0] || ''
  const reserved = new Set(['admin', 'api', 'assets', 'book', 'confirmation', 'login', 'receipts', 'rooms', 'super-admin', 'account', 'faq', 'terms'])
  return reserved.has(segment) ? '' : segment
}

function tenantDisplayName(value) {
  const key = String(value || '').toLowerCase()
  if (/(^|-)rs($|-)|rs-exclusive|r-s-exclusive/.test(key)) return 'RS Exclusive Stay & Fine Dine'
  if (/(^|-)rg($|-)|rg-exclusive|r-g-exclusive/.test(key)) return 'RG Exclusive Stay & Fine Dine'
  if (/ranjeet/.test(key)) return 'Ranjeet Hotel'
  return toTitle(value)
}

function loadingStatus(label) {
  const text = String(label || '').toLowerCase()
  if (text.includes('hotel')) return 'Preparing real hotel details, rooms, offers, and gallery for your visit.'
  if (text.includes('properties')) return 'Bringing the hotel collection into view.'
  if (text.includes('booking')) return 'Preparing a secure direct booking experience.'
  if (text.includes('account') || text.includes('session') || text.includes('access')) return label
  return 'Setting up a smoother hotel experience for you.'
}
