import { env } from './env.js'

const localHostnames = new Set(['localhost', '127.0.0.1', '::1'])
const privateIpPatterns = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[0-1])\./]

function isLocalDevelopmentOrigin(origin) {
  if (env.nodeEnv === 'production') return false

  try {
    const url = new URL(origin)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    if (localHostnames.has(url.hostname)) return true
    if (url.hostname.endsWith('.localhost')) return true
    return privateIpPatterns.some((pattern) => pattern.test(url.hostname))
  } catch {
    return false
  }
}

export function isAllowedCorsOrigin(origin) {
  if (!origin) return true
  if (env.clientOrigins.includes(origin)) return true
  return isLocalDevelopmentOrigin(origin)
}

export function corsOrigin(origin, callback) {
  if (isAllowedCorsOrigin(origin)) return callback(null, true)
  return callback(new Error(`CORS origin denied: ${origin}`))
}
