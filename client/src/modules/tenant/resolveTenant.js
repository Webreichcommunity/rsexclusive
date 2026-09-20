const primaryDomain = (import.meta.env.VITE_PRIMARY_DOMAIN || 'localhost').toLowerCase()
const savedTenantKey = 'rs-exclusive-local-tenant'
const localHostnames = new Set(['localhost', '127.0.0.1', '::1'])
const reservedPathSegments = new Set([
  'admin',
  'api',
  'assets',
  'book',
  'confirmation',
  'login',
  'receipts',
  'rooms',
  'super-admin',
  'account',
  'faq',
  'terms',
])

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
  const tenantKey = getHotelKey(hotelOrSubdomain)
  if (!tenantKey) return path

  const targetPath = buildTenantPath(path, { isTenant: true, key: tenantKey, source: 'path' })
  const base = getPrimaryBaseUrl(location)
  return new URL(targetPath, base).toString()
}

export function buildTenantPath(path = '/', mode) {
  if (!mode?.isTenant || !mode.key) return path
  if (mode.source === 'query' || mode.source === 'local-storage') return withHotelQuery(path, mode.key)

  const [baseWithSearch, hash = ''] = String(path || '/').split('#')
  const [basePath, search = ''] = baseWithSearch.split('?')
  const cleanBase = `/${basePath.split('/').filter(Boolean).join('/')}`
  const tenantBase = `/${mode.key}`
  const pathname = cleanBase === '/' ? tenantBase : `${tenantBase}${cleanBase}`
  return `${pathname}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`
}

export function formatHotelHost(hotelOrSubdomain, location = window.location) {
  const tenantKey = getHotelKey(hotelOrSubdomain)
  if (!tenantKey) return ''
  const base = new URL(getPrimaryBaseUrl(location))
  return `${base.host}/${tenantKey}`
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
    return { isTenant: true, key: normalizeTenantKey(localHotel), source: 'query' }
  }

  const pathTenant = getPathTenantKey(location.pathname)
  if (pathTenant) {
    saveTenant(pathTenant)
    return { isTenant: true, key: pathTenant, source: 'path' }
  }

  const host = location.hostname.toLowerCase()
  if (localHostnames.has(host)) {
    const saved = readSavedTenant()
    const tenantOnlyPaths = ['/book', '/rooms', '/admin', '/login', '/account', '/confirmation', '/faq', '/terms']
    if (saved && tenantOnlyPaths.some((path) => location.pathname.startsWith(path))) {
      return { isTenant: true, key: normalizeTenantKey(saved), source: 'local-storage' }
    }
    return { isTenant: false, key: null, source: 'local' }
  }
  if (host === primaryDomain || host === `www.${primaryDomain}`) return { isTenant: false, key: null, source: 'primary' }
  if (host.startsWith('admin.')) return { isTenant: false, key: 'admin', source: 'admin-subdomain' }
  if (host.endsWith(`.${primaryDomain}`)) return { isTenant: true, key: host.replace(`.${primaryDomain}`, ''), source: 'subdomain' }
  return { isTenant: true, key: host, source: 'custom-domain' }
}

export function stripTenantFromPath(pathname, mode) {
  if (!mode?.isTenant || mode.source !== 'path' || !mode.key) return pathname
  const parts = String(pathname || '/').split('/').filter(Boolean)
  if (parts[0] !== mode.key) return pathname
  const rest = parts.slice(1).join('/')
  return rest ? `/${rest}` : '/'
}

export function isConsolePath(pathname, mode) {
  const appPath = stripTenantFromPath(pathname, mode)
  return appPath.startsWith('/admin') || appPath.startsWith('/super-admin')
}

function getPathTenantKey(pathname) {
  const segment = decodeURIComponent(String(pathname || '').split('/').filter(Boolean)[0] || '').toLowerCase()
  if (!segment || reservedPathSegments.has(segment)) return ''
  if (!/^[a-z0-9-]+$/.test(segment)) return ''
  return segment
}

function getHotelKey(hotelOrSubdomain) {
  const value = typeof hotelOrSubdomain === 'string'
    ? hotelOrSubdomain
    : hotelOrSubdomain?.slug || hotelOrSubdomain?.subdomain
  return normalizeTenantKey(value)
}

function normalizeTenantKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
}

function getPrimaryBaseUrl(location) {
  const currentHost = String(location.hostname || '').toLowerCase()
  const protocol = location.protocol || 'https:'
  if (localHostnames.has(currentHost) || primaryDomain === 'localhost' || localHostnames.has(primaryDomain)) {
    return `${protocol}//${location.host}`
  }
  return `${protocol}//${primaryDomain}${location.port ? `:${location.port}` : ''}`
}

function withHotelQuery(path, subdomain) {
  const url = new URL(path || '/', window.location.origin)
  url.searchParams.set('hotel', subdomain)
  return `${url.pathname}${url.search}${url.hash}`
}
