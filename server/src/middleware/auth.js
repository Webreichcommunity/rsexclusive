import { env, isTest } from '../config/env.js'
import { query } from '../db/pool.js'
import { getFirebaseAuth } from '../services/firebaseAdminService.js'
import { forbidden, unauthorized } from '../utils/errors.js'

function isUnverifiedPasswordUser(firebaseUser) {
  return firebaseUser?.firebase?.sign_in_provider === 'password' && firebaseUser.email_verified === false
}

export async function authenticate(req, _res, next) {
  try {
    if (isTest && req.header('x-test-firebase-uid')) {
      req.firebaseUser = {
        uid: req.header('x-test-firebase-uid'),
        email: req.header('x-test-email') || 'test@example.com',
        name: req.header('x-test-name') || 'Test User',
      }
    } else {
      const header = req.header('authorization')
      if (!header?.startsWith('Bearer ')) throw unauthorized('Missing Firebase ID token')
      const token = header.slice('Bearer '.length)
      try {
        req.firebaseUser = await getFirebaseAuth().verifyIdToken(token)
      } catch (error) {
        console.error({
          message: 'Firebase ID token verification failed',
          code: error.code,
          reason: error.message,
        })
        throw unauthorized('Invalid or expired Firebase ID token')
      }
    }

    const { rows } = await query(
      `SELECT id, firebase_uid, email, full_name, phone, profile, role, default_hotel_id, disabled_at
       FROM users
       WHERE firebase_uid = $1
       LIMIT 1`,
      [req.firebaseUser.uid],
    )

    if (!rows[0]) {
      const email = req.firebaseUser.email
      if (email) {
        const { rows: relinkRows } = await query(
          `UPDATE users
           SET firebase_uid = $1, disabled_at = null, updated_at = now()
           WHERE email = $2 AND role = 'customer'
           RETURNING id, firebase_uid, email, full_name, phone, profile, role, default_hotel_id, disabled_at`,
          [req.firebaseUser.uid, email],
        )
        if (relinkRows[0]) rows[0] = relinkRows[0]
      }

      if (!rows[0]) {
        const message =
          env.nodeEnv === 'production'
            ? 'User is not active in this platform'
            : `Firebase user is valid but not registered in Neon users table. Firebase UID: ${req.firebaseUser.uid}`
        throw unauthorized(message)
      }
    }
    if (rows[0].disabled_at) throw unauthorized('User is disabled in this platform')
    if (rows[0].role === 'customer' && isUnverifiedPasswordUser(req.firebaseUser)) {
      throw unauthorized('Verify your email address before continuing.')
    }
    req.user = rows[0]
    next()
  } catch (error) {
    next(error.statusCode ? error : unauthorized('Invalid or expired session'))
  }
}

export async function optionalAuthenticate(req, _res, next) {
  const header = req.header('authorization')
  if (!header?.startsWith('Bearer ')) return next()
  return authenticate(req, _res, (error) => {
    if (error) return next()
    return next()
  })
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (!roles.includes(req.user.role)) return next(forbidden())
    next()
  }
}

export async function requireHotelAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized())
  if (!req.hotel) return next(forbidden('Hotel context is required'))
  if (req.user.role === 'super_admin') return next()
  if (req.user.role !== 'hotel_admin') return next(forbidden())

  const { rows } = await query(
    `SELECT id, permissions
     FROM hotel_admins
     WHERE user_id = $1 AND hotel_id = $2
     LIMIT 1`,
    [req.user.id, req.hotel.id],
  )

  if (!rows[0]) return next(forbidden('Hotel admin does not belong to this hotel'))
  req.hotelAdmin = rows[0]
  next()
}
