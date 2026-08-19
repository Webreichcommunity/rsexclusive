const primaryDomain = import.meta.env.VITE_PRIMARY_DOMAIN || 'localhost'
const savedTenantKey = 'rs-exclusive-local-tenant'

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

export function resolveTenantFromLocation(location = window.location) {
  const params = new URLSearchParams(location.search)
  const localHotel = params.get('hotel')
  if (localHotel) {
    saveTenant(localHotel)
    return { isTenant: true, key: localHotel, source: 'query' }
  }

  const host = location.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') {
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
