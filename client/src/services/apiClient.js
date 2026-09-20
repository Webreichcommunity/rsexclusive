import { getFirebaseToken } from '../modules/auth/firebaseClient.js'
import { resolveTenantFromLocation } from '../modules/tenant/resolveTenant.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
const PUBLIC_GET_CACHE_MS = 30_000
const getCache = new Map()
const inFlightGets = new Map()

function withTenant(url) {
  const tenant = resolveTenantFromLocation()
  const parsed = new URL(`${API_BASE_URL}${url}`)
  if (tenant.key && tenant.isTenant) parsed.searchParams.set('hotel', tenant.key)
  return parsed.toString()
}

export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {})
  if (!(options.body instanceof FormData)) headers.set('content-type', 'application/json')
  const token = options.authToken || (await getFirebaseToken())
  if (token) headers.set('authorization', `Bearer ${token}`)

  const { authToken: _authToken, ...fetchOptions } = options
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
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = toCustomerMessage(payload?.error?.message, response.status)
        throw new Error(message)
      }
      if (canCache) getCache.set(cacheKey, { data: payload, expiresAt: Date.now() + PUBLIC_GET_CACHE_MS })
      return payload
    })
    .finally(() => {
      if (canCache) inFlightGets.delete(cacheKey)
    })

  if (canCache) inFlightGets.set(cacheKey, request)
  return request
}

function isPublicCachedEndpoint(url) {
  const pathname = new URL(url).pathname
  return pathname.endsWith('/tenant') || pathname.endsWith('/hotels')
}

function toCustomerMessage(message, status) {
  const raw = String(message || '').trim()
  if (raw.includes('Firebase user is valid but not registered')) return 'Complete your account setup before continuing.'
  if (raw.includes('Invalid or expired Firebase ID token')) return 'Your session expired. Please sign in again.'
  if (raw.includes('Verify your email')) return 'Verify your email address before continuing.'
  if (status === 401) return raw || 'Please sign in to continue.'
  if (status === 403) return raw || 'You do not have access to this action.'
  if (status >= 500) return 'Something went wrong on our side. Please try again in a moment.'
  return raw || 'Request failed. Please try again.'
}
