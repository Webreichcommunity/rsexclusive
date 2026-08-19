import { useLocation } from 'react-router-dom'
import { resolveTenantFromLocation } from './resolveTenant.js'

export function useTenantMode() {
  const location = useLocation()
  return resolveTenantFromLocation({
    ...window.location,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  })
}
