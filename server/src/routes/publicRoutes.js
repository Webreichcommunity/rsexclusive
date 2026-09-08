import { z } from 'zod'
import { query, transaction } from '../db/pool.js'
import { authenticate, optionalAuthenticate } from '../middleware/auth.js'
import { optionalTenant, requireTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'
import { getFirebaseAuth } from '../services/firebaseAdminService.js'
import { availabilitySchema, searchAvailability } from '../services/availabilityService.js'
import { createBookingHold, confirmBookingPayment } from '../services/bookingService.js'
import { getHotelProfile, listActiveHotels, listAmenitiesForHotel, listOffersForHotel, listRoomsForHotel } from '../services/hotelService.js'
import { createAsyncRouter } from '../utils/asyncRouter.js'
import { createCache } from '../utils/cache.js'
import { badRequest, conflict, forbidden, unauthorized } from '../utils/errors.js'

export const publicRoutes = createAsyncRouter()
const publicCache = createCache(60_000)

function requireActiveHotel(req, _res, next) {
  if (req.hotel && req.hotel.status !== 'active') {
    return next(forbidden('This hotel website is temporarily suspended. Please contact WebReich for support.'))
  }
  next()
}

const bookingSchema = z.object({
  roomTypeId: z.string().uuid(),
  offerId: z.string().uuid().optional(),
  paymentMode: z.enum(['full', 'partial']).default('full'),
  selectedAmenityIds: z.array(z.string().uuid()).default([]),
  redeemPoints: z.coerce.number().int().min(0).default(0),
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  roomsCount: z.coerce.number().int().positive().default(1),
  adults: z.coerce.number().int().positive().default(1),
  children: z.coerce.number().int().min(0).default(0),
  guestName: z.string().min(2).max(120),
  guestEmail: z.string().email(),
  guestPhone: z.string().min(7).max(24),
})

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(3),
  razorpayPaymentId: z.string().min(3),
  razorpaySignature: z.string().min(3),
})

const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().max(24).optional(),
  photoUrl: z.string().url().max(500).optional(),
})

const profileSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().max(24).optional(),
  avatar: z.string().max(80).optional(),
  photoUrl: z.string().url().max(500).optional().or(z.literal('')),
  gender: z.string().max(40).optional(),
  birthDate: z.string().max(20).optional(),
  city: z.string().max(80).optional(),
  address: z.string().max(160).optional(),
})

const feedbackSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(24).optional(),
  rating: z.coerce.number().int().min(1).max(5).default(5),
  message: z.string().min(5).max(1200),
})

publicRoutes.get('/hotels', async (_req, res) => {
  const cached = publicCache.get('hotels')
  if (cached) return res.json(cached)
  res.json(publicCache.set('hotels', { hotels: await listActiveHotels() }))
})

publicRoutes.get('/tenant', requireTenant, optionalAuthenticate, requireActiveHotel, async (req, res) => {
  const cacheKey = `tenant:${req.hotel.id}:${req.user?.id || 'guest'}`
  const cached = publicCache.get(cacheKey)
  if (cached) return res.json(cached)
  const [hotel, rooms, amenities, offers, loyaltyRows] = await Promise.all([
    getHotelProfile(req.hotel.id),
    listRoomsForHotel(req.hotel.id),
    listAmenitiesForHotel(req.hotel.id),
    listOffersForHotel(req.hotel.id, req.user?.id || null),
    req.user
      ? query(
          `SELECT coalesce(sum(points_balance), 0)::int AS points
           FROM loyalty_accounts
           WHERE user_id = $1`,
          [req.user.id],
        )
      : Promise.resolve({ rows: [] }),
  ])
  res.json(publicCache.set(cacheKey, { hotel, rooms, amenities, offers, loyaltyPoints: loyaltyRows.rows[0]?.points || 0 }))
})

publicRoutes.post('/auth/register', optionalTenant, requireActiveHotel, validate(registerSchema), async (req, res) => {
  if (!req.hotel) throw badRequest('Open a hotel website before creating a guest account.', 'hotel_context_required')

  const header = req.header('authorization')
  if (!header?.startsWith('Bearer ')) throw unauthorized('Missing Firebase ID token')

  let firebaseUser
  try {
    firebaseUser = await getFirebaseAuth().verifyIdToken(header.slice('Bearer '.length))
  } catch {
    throw unauthorized('Invalid or expired Firebase ID token')
  }

  if (!firebaseUser.email) throw unauthorized('Firebase account does not have an email address')
  if (firebaseUser.firebase?.sign_in_provider === 'password' && firebaseUser.email_verified === false) {
    throw unauthorized('Verify your email address before creating your guest profile.')
  }

  const user = await transaction(async (db) => {
    const { rows: existingRows } = await db.query(
      `SELECT id, firebase_uid, email, role, profile
       FROM users
       WHERE firebase_uid = $1 OR email = $2
       ORDER BY CASE WHEN firebase_uid = $1 THEN 0 ELSE 1 END
       FOR UPDATE`,
      [firebaseUser.uid, firebaseUser.email],
    )

    let registered
    if (existingRows[0]) {
      if (new Set(existingRows.map((row) => row.id)).size > 1) {
        throw conflict('This Firebase account and email are linked to different platform users. Contact support to merge the accounts.', 'account_identity_conflict')
      }
      if (existingRows[0].role !== 'customer') {
        throw conflict('This email belongs to a platform admin account. Sign in with the admin login instead.', 'email_belongs_to_admin')
      }
      const { rows } = await db.query(
        `UPDATE users SET
           firebase_uid = $1,
           email = $2,
           full_name = $3,
           phone = $4,
           default_hotel_id = coalesce(default_hotel_id, $5),
           profile = $6::jsonb,
           disabled_at = null,
           updated_at = now()
         WHERE id = $7
         RETURNING id, email, full_name, phone, profile, role`,
        [
          firebaseUser.uid,
          firebaseUser.email,
          req.body.fullName,
          req.body.phone || null,
          req.hotel.id,
          JSON.stringify({
            ...(existingRows[0].profile || {}),
            photoUrl: req.body.photoUrl || existingRows[0].profile?.photoUrl || firebaseUser.picture || '',
          }),
          existingRows[0].id,
        ],
      )
      registered = rows[0]
    } else {
      const { rows } = await db.query(
        `INSERT INTO users (firebase_uid, email, full_name, phone, profile, role, default_hotel_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, 'customer', $6)
         RETURNING id, email, full_name, phone, profile, role`,
        [
          firebaseUser.uid,
          firebaseUser.email,
          req.body.fullName,
          req.body.phone || null,
          JSON.stringify({ photoUrl: req.body.photoUrl || firebaseUser.picture || '' }),
          req.hotel.id,
        ],
      )
      registered = rows[0]
    }

    await db.query(
      `INSERT INTO customers (hotel_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (hotel_id, user_id) DO UPDATE SET updated_at = now()`,
      [req.hotel.id, registered.id],
    )

    return registered
  })

  res.status(201).json({ user })
})

publicRoutes.get('/availability', requireTenant, requireActiveHotel, validate(availabilitySchema, 'query'), async (req, res) => {
  const rooms = await searchAvailability({ query }, req.hotel.id, req.query)
  res.json({ rooms })
})

publicRoutes.post('/bookings/hold', requireTenant, requireActiveHotel, authenticate, validate(bookingSchema), async (req, res) => {
  const hold = await createBookingHold({ hotel: req.hotel, user: req.user, payload: req.body })
  res.status(201).json(hold)
})

publicRoutes.post('/payments/verify', authenticate, validate(verifyPaymentSchema), async (req, res) => {
  const booking = await confirmBookingPayment({
    orderId: req.body.razorpayOrderId,
    paymentId: req.body.razorpayPaymentId,
    signature: req.body.razorpaySignature,
  })
  res.json({ booking })
})

publicRoutes.post('/feedback', requireTenant, optionalAuthenticate, requireActiveHotel, validate(feedbackSchema), async (req, res) => {
  const { rows } = await query(
    `INSERT INTO hotel_feedback (hotel_id, user_id, name, email, phone, rating, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, rating, status, created_at`,
    [
      req.hotel.id,
      req.user?.role === 'customer' ? req.user.id : null,
      req.body.name,
      req.body.email,
      req.body.phone || null,
      req.body.rating,
      req.body.message,
      JSON.stringify({
        hotelName: req.hotel.name,
        userAgent: req.header('user-agent') || '',
      }),
    ],
  )
  res.status(201).json({ feedback: rows[0] })
})

publicRoutes.get('/me', optionalTenant, authenticate, async (req, res) => {
  let hotelAdminHotel = null
  if (req.user.role === 'hotel_admin') {
    const { rows } = await query(
      `SELECT h.id, h.name, h.slug, h.subdomain
       FROM hotel_admins ha
       JOIN hotels h ON h.id = ha.hotel_id
       WHERE ha.user_id = $1
       ORDER BY h.created_at ASC
       LIMIT 1`,
      [req.user.id],
    )
    hotelAdminHotel = rows[0] || null
  }

  const { rows: loyaltyRows } = await query(
    `SELECT coalesce(sum(points_balance), 0)::int AS points
     FROM loyalty_accounts
     WHERE user_id = $1`,
    [req.user.id],
  )

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      fullName: req.user.full_name,
      phone: req.user.phone,
      profile: req.user.profile || {},
      role: req.user.role,
      hotel: hotelAdminHotel,
      loyaltyPoints: loyaltyRows[0]?.points || 0,
    },
  })
})

publicRoutes.patch('/me', optionalTenant, authenticate, validate(profileSchema), async (req, res) => {
  const profile = {
    avatar: req.body.avatar || 'avatar-1',
    photoUrl: req.body.photoUrl || req.user.profile?.photoUrl || '',
    gender: req.body.gender || '',
    birthDate: req.body.birthDate || '',
    city: req.body.city || '',
    address: req.body.address || '',
  }
  const { rows } = await query(
    `UPDATE users
     SET full_name = $1,
         phone = $2,
         profile = $3::jsonb,
         updated_at = now()
     WHERE id = $4
     RETURNING id, email, full_name, phone, profile, role`,
    [req.body.fullName, req.body.phone || null, profile, req.user.id],
  )
  res.json({
    user: {
      id: rows[0].id,
      email: rows[0].email,
      fullName: rows[0].full_name,
      phone: rows[0].phone,
      profile: rows[0].profile || {},
      role: rows[0].role,
    },
  })
})

publicRoutes.get('/me/bookings', optionalTenant, authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, h.name AS hotel_name, rt.name AS room_type_name, i.pdf_url
     FROM bookings b
     JOIN hotels h ON h.id = b.hotel_id
     JOIN room_types rt ON rt.id = b.room_type_id
     LEFT JOIN invoices i ON i.booking_id = b.id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC
     LIMIT 50`,
    [req.user.id],
  )
  res.json({ bookings: rows })
})

publicRoutes.get('/me/bookings/:bookingReference', optionalTenant, authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, h.name AS hotel_name, rt.name AS room_type_name, rt.hero_image_url AS room_image_url, i.pdf_url
     FROM bookings b
     JOIN hotels h ON h.id = b.hotel_id
     JOIN room_types rt ON rt.id = b.room_type_id
     LEFT JOIN invoices i ON i.booking_id = b.id
     WHERE b.user_id = $1 AND b.booking_reference = $2
     LIMIT 1`,
    [req.user.id, req.params.bookingReference],
  )

  if (!rows[0]) {
    res.status(404).json({ error: { code: 'booking_not_found', message: 'Booking was not found in your account.' } })
    return
  }

  res.json({ booking: rows[0] })
})
