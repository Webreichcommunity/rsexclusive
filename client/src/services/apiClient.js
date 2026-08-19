import { getFirebaseToken } from '../modules/auth/firebaseClient.js'
import { resolveTenantFromLocation } from '../modules/tenant/resolveTenant.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'

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
  const response = await fetch(withTenant(url), {
    ...fetchOptions,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = toCustomerMessage(payload?.error?.message, response.status)
    throw new Error(message)
  }
  return payload
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
