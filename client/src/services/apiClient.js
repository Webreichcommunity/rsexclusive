import { getFirebaseToken } from '../modules/auth/firebaseClient.js'
import { resolveTenantFromLocation } from '../modules/tenant/resolveTenant.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
const PUBLIC_GET_CACHE_MS = 30_000
const getCache = new Map()
const inFlightGets = new Map()
const loadingHotelProfiles = new Map()
let loadingHotelCollection = []

export function clearApiClientCache() {
  getCache.clear()
  inFlightGets.clear()
}

if (typeof window !== 'undefined') {
  window.addEventListener('rs-exclusive-auth-cleared', clearApiClientCache)
}

export function publicApiUrl(path) {
  const base = new URL(API_BASE_URL, window.location.origin)
  return new URL(path.startsWith('/') ? path : `/${path}`, `${base.origin}/`).toString()
}

export function receiptDownloadUrl(booking) {
  const invoiceNumber = booking?.invoice_number || (booking?.booking_reference ? `INV-${booking.booking_reference}` : '')
  if (invoiceNumber) return publicApiUrl(`/receipts/${encodeURIComponent(invoiceNumber)}.pdf`)
  return booking?.pdf_url || ''
}

export function getPublicHotelLoadingProfile() {
  const tenant = resolveTenantFromLocation()
  if (tenant.key) {
    const profile = loadingHotelProfiles.get(tenant.key)
    if (profile) return profile
  }
  return loadingHotelCollection[0] || fallbackLoadingProfile(tenant.key)
}

function withTenant(url) {
  const tenant = resolveTenantFromLocation()
  const base = new URL(API_BASE_URL, window.location.origin)
  const basePath = base.pathname.replace(/\/$/, '')
  const requestPath = `${basePath}${url.startsWith('/') ? url : `/${url}`}`
  const parsed = new URL(requestPath, base.origin)
  if (tenant.key && tenant.isTenant) parsed.searchParams.set('hotel', tenant.key)
  return parsed.toString()
}

export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {})
  if (!(options.body instanceof FormData)) headers.set('content-type', 'application/json')
  const token = options.authToken || (options.skipAuth ? null : await getFirebaseToken())
  if (token) headers.set('authorization', `Bearer ${token}`)

  const { authToken: _authToken, skipAuth: _skipAuth, ...fetchOptions } = options
  const requestUrl = withTenant(url)
  const method = String(fetchOptions.method || 'GET').toUpperCase()
  const canCache = method === 'GET' && isPublicCachedEndpoint(requestUrl)
  const cacheKey = canCache ? `${requestUrl}::${token || 'guest'}` : ''

  if (canCache) {
    const cached = getCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.data
    const pending = inFlightGets.get(cacheKey)
    if (pending) return pending
  }

  const request = fetch(requestUrl, {
    ...fetchOptions,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body,
  })
    .then(async (response) => {
      const contentType = response.headers.get('content-type') || ''
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : { error: { message: await response.text().then((text) => text.slice(0, 180)).catch(() => '') } }
      if (!response.ok) {
        const message = toCustomerMessage(payload?.error?.message, response.status, contentType)
        throw new Error(message)
      }
      if (!contentType.includes('application/json')) {
        throw new Error('The API returned a non-JSON response. Check the Vercel API rewrite and VITE_API_BASE_URL setting.')
      }
      rememberPublicLoadingMedia(requestUrl, payload)
      if (canCache) getCache.set(cacheKey, { data: payload, expiresAt: Date.now() + PUBLIC_GET_CACHE_MS })
      return payload
    })
    .finally(() => {
      if (canCache) inFlightGets.delete(cacheKey)
    })

  if (canCache) inFlightGets.set(cacheKey, request)
  return request
}

function rememberPublicLoadingMedia(requestUrl, payload) {
  const pathname = new URL(requestUrl).pathname
  if (pathname.endsWith('/tenant') && payload?.hotel) {
    addLoadingProfile(payload.hotel, payload.rooms)
    notifyLoadingProfiles()
    return
  }
  if (pathname.endsWith('/hotels') && Array.isArray(payload?.hotels)) {
    loadingHotelCollection = payload.hotels.map((hotel) => normalizeLoadingProfile(hotel)).filter((profile) => profile.images.length)
    for (const hotel of payload.hotels) addLoadingProfile(hotel)
    notifyLoadingProfiles()
  }
}

function addLoadingProfile(hotel, rooms = []) {
  const profile = normalizeLoadingProfile(hotel, rooms)
  for (const key of [hotel?.slug, hotel?.subdomain, hotel?.id, profile.name]) {
    const normalized = normalizeTenantKey(key)
    if (normalized) loadingHotelProfiles.set(normalized, profile)
  }
}

function normalizeLoadingProfile(hotel = {}, rooms = []) {
  const images = unique([
    ...mediaItems([hotel.branding?.mainImage || hotel.branding?.mainImageUrl]),
    ...mediaItems(hotel.branding?.heroImages),
    ...mediaItems([hotel.hero_image_url]),
    ...mediaItems(hotel.room_preview_images),
    ...mediaItems(hotel.branding?.showcaseImages),
    ...mediaItems([hotel.branding?.showcaseImageUrl, hotel.branding?.diningImage, hotel.branding?.diningImageUrl]),
    ...mediaItems(hotel.branding?.gallery),
    ...rooms.flatMap((room) => [
      ...mediaItems([room?.hero_image_url]),
      ...mediaItems(room?.gallery),
    ]),
  ]).slice(0, 6)

  return {
    name: cleanName(hotel.name),
    city: cleanCity(hotel.address?.city),
    images,
  }
}

function mediaItems(items) {
  const list = Array.isArray(items) ? items : [items]
  return list
    .map((item) => (typeof item === 'string' ? item : item?.url || item?.secureUrl))
    .map((url) => String(url || '').trim())
    .filter((url) => /^https?:\/\//i.test(url) || url.startsWith('/'))
}

function unique(items) {
  return [...new Set(items)]
}

function normalizeTenantKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
}

function cleanName(value) {
  return String(value || 'Ranjeet Groups of Hotels Akola').replace(/\s+/g, ' ').trim()
}

function cleanCity(value) {
  const city = String(value || '').replace(/\s+/g, ' ').trim()
  if (!city || /exlusive|exclusive|fine dine|stay/i.test(city)) return 'Akola'
  return city
}

function fallbackLoadingProfile(tenantKey) {
  const key = normalizeTenantKey(tenantKey)
  if (/rg/.test(key)) {
    return {
      name: 'RG Exclusive Stay & Fine Dine',
      city: 'Akola',
      images: [],
    }
  }
  if (/ranjeet/.test(key)) {
    return {
      name: 'Ranjeet Hotel',
      city: 'Akola',
      images: [],
    }
  }
  return {
    name: key ? 'RS Exclusive Stay & Fine Dine' : 'Ranjeet Groups of Hotels Akola',
    city: 'Akola',
    images: [],
  }
}

function notifyLoadingProfiles() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('rs-exclusive-public-media-ready'))
}

function isPublicCachedEndpoint(url) {
  const pathname = new URL(url).pathname
  return pathname.endsWith('/tenant') || pathname.endsWith('/hotels')
}

function toCustomerMessage(message, status, contentType = '') {
  const raw = String(message || '').trim()
  if (contentType && !contentType.includes('application/json')) return 'The API returned a website page instead of JSON. Check the Vercel /api rewrite and Render backend URL.'
  if (raw.includes('Firebase user is valid but not registered')) return 'Complete your account setup before continuing.'
  if (raw.includes('Invalid or expired Firebase ID token')) return 'Your session expired. Please sign in again.'
  if (raw.includes('Verify your email')) return 'Verify your email address before continuing.'
  if (status === 401) return raw || 'Please sign in to continue.'
  if (status === 403) return raw || 'You do not have access to this action.'
  if (status >= 500) return 'Something went wrong on our side. Please try again in a moment.'
  return raw || 'Request failed. Please try again.'
}
