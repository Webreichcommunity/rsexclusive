const primaryDomain = (import.meta.env.VITE_PRIMARY_DOMAIN || 'localhost').toLowerCase()
const savedTenantKey = 'rs-exclusive-local-tenant'
const localHostnames = new Set(['localhost', '127.0.0.1', '::1'])

function readSavedTenant() {
  try {
    return window.localStorage.getItem(savedTenantKey)
  } catch {
    return null
  }
}

function saveTenant(key) {
  try {
    if (key) window.localStorage.setItem(savedTenantKey, key)
  } catch {
    // Local storage can be unavailable in private or restricted browser modes.
  }
}

export function getSavedTenantKey() {
  return readSavedTenant()
}

export function buildHotelUrl(hotelOrSubdomain, path = '/', location = window.location) {
  const subdomain = typeof hotelOrSubdomain === 'string' ? hotelOrSubdomain : hotelOrSubdomain?.subdomain
  const customDomain = typeof hotelOrSubdomain === 'string' ? '' : hotelOrSubdomain?.customDomain || hotelOrSubdomain?.custom_domain
  const hostname = normalizeHostname(customDomain) || buildSubdomainHost(subdomain)

  if (!subdomain && !hostname) return path
  if (!hostname) return withHotelQuery(path, subdomain)

  const protocol = shouldUseCurrentOriginDetails(hostname, location) ? location.protocol || 'https:' : 'https:'
  const port = shouldUseCurrentOriginDetails(hostname, location) && location.port ? `:${location.port}` : ''
  return new URL(path || '/', `${protocol}//${hostname}${port}`).toString()
}

export function formatHotelHost(hotelOrSubdomain, location = window.location) {
  const subdomain = typeof hotelOrSubdomain === 'string' ? hotelOrSubdomain : hotelOrSubdomain?.subdomain
  const customDomain = typeof hotelOrSubdomain === 'string' ? '' : hotelOrSubdomain?.customDomain || hotelOrSubdomain?.custom_domain
  const hostname = normalizeHostname(customDomain) || buildSubdomainHost(subdomain)
  if (!hostname) return subdomain || ''
  return `${hostname}${shouldUseCurrentOriginDetails(hostname, location) && location.port ? `:${location.port}` : ''}`
}

export function navigateToHotelPath(navigate, hotelOrSubdomain, path = '/', options = {}) {
  const target = buildHotelUrl(hotelOrSubdomain, path)
  const url = new URL(target, window.location.origin)
  if (url.origin === window.location.origin) {
    navigate(`${url.pathname}${url.search}${url.hash}`, options)
    return
  }
  if (options.replace) {
    window.location.replace(url.toString())
    return
  }
  window.location.assign(url.toString())
}

export function resolveTenantFromLocation(location = window.location) {
  const params = new URLSearchParams(location.search)
  const localHotel = params.get('hotel')
  if (localHotel) {
    saveTenant(localHotel)
    return { isTenant: true, key: localHotel, source: 'query' }
  }

  const host = location.hostname.toLowerCase()
  if (localHostnames.has(host)) {
    const saved = readSavedTenant()
    const tenantOnlyPaths = ['/book', '/rooms', '/admin', '/login', '/account', '/confirmation']
    if (saved && tenantOnlyPaths.some((path) => location.pathname.startsWith(path))) {
      return { isTenant: true, key: saved, source: 'local-storage' }
    }
    return { isTenant: false, key: null, source: 'local' }
  }
  if (host === primaryDomain || host === `www.${primaryDomain}`) return { isTenant: false, key: null, source: 'primary' }
  if (host.startsWith('admin.')) return { isTenant: false, key: 'admin', source: 'admin-subdomain' }
  if (host.endsWith(`.${primaryDomain}`)) return { isTenant: true, key: host.replace(`.${primaryDomain}`, ''), source: 'subdomain' }
  return { isTenant: true, key: host, source: 'custom-domain' }
}

function buildSubdomainHost(subdomain) {
  if (!subdomain) return ''
  if (primaryDomain === 'localhost') return `${subdomain}.localhost`
  if (localHostnames.has(primaryDomain)) return ''
  return `${subdomain}.${primaryDomain}`
}

function shouldUseCurrentOriginDetails(hostname, location) {
  const currentHost = String(location.hostname || '').toLowerCase()
  if (!hostname) return true
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  return currentHost === hostname || currentHost.endsWith(`.${primaryDomain}`)
}

function normalizeHostname(value) {
  const domain = String(value || '').trim()
  if (!domain) return ''
  try {
    return new URL(domain.includes('://') ? domain : `https://${domain}`).hostname.toLowerCase()
  } catch {
    return domain.split('/')[0].toLowerCase()
  }
}

function withHotelQuery(path, subdomain) {
  const url = new URL(path || '/', window.location.origin)
  url.searchParams.set('hotel', subdomain)
  return `${url.pathname}${url.search}${url.hash}`
}
