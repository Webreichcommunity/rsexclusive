import { env } from '../config/env.js'
import { query } from '../db/pool.js'
import { notFound } from '../utils/errors.js'

function extractTenantKey(req) {
  const localHotel = req.query[env.localTenantQueryParam] || req.header('x-tenant-slug')
  if (localHotel) return String(localHotel).toLowerCase()

  const host = (req.hostname || '').toLowerCase()
  if (!host || host === 'localhost' || host === '127.0.0.1') return null

  const primary = env.primaryDomain.toLowerCase()
  const primaryAliases = new Set([primary, primary.startsWith('www.') ? primary.slice(4) : `www.${primary}`])
  if (primaryAliases.has(host) || host.startsWith('admin.')) return null
  for (const domain of primaryAliases) {
    if (host.endsWith(`.${domain}`)) return host.replace(`.${domain}`, '')
  }

  return host
}

export async function optionalTenant(req, _res, next) {
  const tenantKey = extractTenantKey(req)
  if (!tenantKey) return next()

  const { rows } = await query(
    `SELECT * FROM hotels
     WHERE subdomain = $1 OR slug = $1 OR custom_domain = $1
     LIMIT 1`,
    [tenantKey],
  )
  req.hotel = rows[0] || null
  next()
}

export async function requireTenant(req, _res, next) {
  await optionalTenant(req, _res, async () => {
    if (!req.hotel) return next(notFound('Hotel tenant was not found'))
    next()
  })
}
