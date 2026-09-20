import { v2 as cloudinary } from 'cloudinary'
import { z } from 'zod'
import { env } from '../config/env.js'
import { authenticate, requireHotelAdmin, requireRole } from '../middleware/auth.js'
import { requireTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'
import { query, transaction } from '../db/pool.js'
import { deleteFirebaseUser } from '../services/firebaseAdminService.js'
import { recordActivity } from '../services/activityService.js'
import { createAsyncRouter } from '../utils/asyncRouter.js'
import { badRequest, conflict, notFound } from '../utils/errors.js'

export const adminRoutes = createAsyncRouter()

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
})

const roomTypeSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().min(10),
  occupancyAdults: z.coerce.number().int().positive(),
  occupancyChildren: z.coerce.number().int().min(0).default(0),
  basePrice: z.coerce.number().nonnegative(),
  offerPrice: z.coerce.number().nonnegative().optional(),
  sizeSqft: z.coerce.number().int().positive().optional(),
  bedType: z.string().optional(),
  amenities: z.array(z.string()).default([]),
  amenityItems: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().max(300).optional(),
    price: z.coerce.number().nonnegative().default(0),
    icon: z.string().max(500).optional(),
  })).default([]),
  heroImageUrl: z.string().url().or(z.literal('')).optional(),
  gallery: z.array(z.object({
    url: z.string().url(),
    alt: z.string().optional(),
  })).default([]),
  showOnHomepage: z.coerce.boolean().default(false),
  physicalRooms: z.coerce.number().int().positive().default(1),
  inventoryDays: z.coerce.number().int().min(1).max(730).default(180),
  roomNumberPrefix: z.string().optional(),
  rateOptions: z.record(z.enum(['single', 'double']), z.object({
    enabled: z.coerce.boolean().default(true),
    basePrice: z.coerce.number().nonnegative(),
    offerPrice: z.coerce.number().nonnegative().optional().nullable(),
    sizeSqft: z.coerce.number().int().positive().optional().nullable(),
    physicalRooms: z.coerce.number().int().positive().default(1),
    occupancyAdults: z.coerce.number().int().positive(),
    occupancyChildren: z.coerce.number().int().min(0).default(0),
  })).optional(),
})

const roomFeatureSchema = z.object({
  showOnHomepage: z.coerce.boolean(),
})

const roomUpdateSchema = roomTypeSchema.partial().extend({
  active: z.coerce.boolean().optional(),
})

const inventorySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  totalRooms: z.coerce.number().int().min(0),
  price: z.coerce.number().nonnegative(),
  minNights: z.coerce.number().int().positive().default(1),
  closed: z.coerce.boolean().default(false),
})

const inventoryBlockSchema = z.object({
  roomTypeId: z.string().uuid().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  offlineRooms: z.coerce.number().int().min(0).default(0),
  closed: z.coerce.boolean().default(false),
  note: z.string().max(240).optional(),
})

const rateManagementSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  rateCategory: z.enum(['all', 'single', 'double']).default('all'),
  price: z.coerce.number().nonnegative(),
  minNights: z.coerce.number().int().positive().default(1),
})

const dateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
})

const rateDeleteSchema = dateRangeSchema.extend({
  rateCategory: z.enum(['all', 'single', 'double']).default('all'),
})

const bookingUpdateSchema = z.object({
  guestName: z.string().min(2).optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  adults: z.coerce.number().int().positive().optional(),
  children: z.coerce.number().int().min(0).optional(),
  internalNote: z.string().max(500).optional(),
})

const bookingCreateSchema = z.object({
  roomTypeId: z.string().uuid(),
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  roomsCount: z.coerce.number().int().positive().default(1),
  adults: z.coerce.number().int().positive().default(1),
  children: z.coerce.number().int().min(0).default(0),
  guestName: z.string().min(2),
  guestEmail: z.string().email(),
  guestPhone: z.string().optional(),
  status: z.enum(['pending', 'payment_pending', 'confirmed', 'cancelled', 'completed', 'failed']).default('confirmed'),
  totalAmount: z.coerce.number().nonnegative().optional(),
})

const hotelSettingsSchema = z.object({
  loyaltyRedemptionMinPoints: z.coerce.number().int().min(0).max(1000000).default(1000),
})

const amenitySchema = z.object({
  name: z.string().min(2),
  description: z.string().max(300).optional(),
  price: z.coerce.number().nonnegative().default(0),
  icon: z.string().max(500).optional(),
  active: z.coerce.boolean().default(true),
})

const faqSchema = z.object({
  question: z.string().min(5).max(240),
  answer: z.string().min(5).max(1200),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  active: z.coerce.boolean().default(true),
})

const offerSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(5),
  code: z.string().max(40).optional(),
  discountType: z.enum(['percentage', 'fixed']).default('percentage'),
  discountValue: z.coerce.number().nonnegative(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  active: z.coerce.boolean().default(true),
  imageUrl: z.string().url().or(z.literal('')).optional(),
  audienceType: z.enum(['general', 'repeat_guest']).default('general'),
  minCompletedBookings: z.coerce.number().int().min(0).default(0),
  badge: z.string().max(40).optional(),
  highlightColor: z.string().max(40).optional(),
})

adminRoutes.use(requireTenant, authenticate, requireHotelAdmin)

const FIXED_TAX_RATE = 5

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `room-${Date.now()}`
}

async function uniqueRoomSlug(db, hotelId, name, currentSlug = '') {
  const base = slugify(currentSlug || name)
  let slug = base
  for (let index = 2; index < 100; index += 1) {
    const { rows } = await db.query(
      'SELECT id FROM room_types WHERE hotel_id = $1 AND slug = $2 LIMIT 1',
      [hotelId, slug],
    )
    if (!rows[0]) return slug
    slug = `${base}-${index}`
  }
  return `${base}-${Date.now()}`
}

function normalizeRateOptions(body) {
  const input = body.rateOptions || {}
  const options = {}
  for (const category of ['single', 'double']) {
    const item = input[category]
    if (!item?.enabled) continue
    options[category] = {
      enabled: true,
      basePrice: Number(item.basePrice || 0),
      offerPrice: item.offerPrice === null || item.offerPrice === undefined || item.offerPrice === '' ? null : Number(item.offerPrice),
      sizeSqft: item.sizeSqft ? Number(item.sizeSqft) : null,
      physicalRooms: Number(item.physicalRooms || 1),
      occupancyAdults: Number(item.occupancyAdults || (category === 'single' ? 1 : 2)),
      occupancyChildren: Number(item.occupancyChildren || 0),
    }
  }
  if (Object.keys(options).length) return options
  return {
    [Number(body.occupancyAdults || 1) <= 1 ? 'single' : 'double']: {
      enabled: true,
      basePrice: Number(body.basePrice || 0),
      offerPrice: body.offerPrice === undefined ? null : Number(body.offerPrice),
      sizeSqft: body.sizeSqft ? Number(body.sizeSqft) : null,
      physicalRooms: Number(body.physicalRooms || 1),
      occupancyAdults: Number(body.occupancyAdults || 1),
      occupancyChildren: Number(body.occupancyChildren || 0),
    },
  }
}

function summarizeRateOptions(body) {
  const options = normalizeRateOptions(body)
  const values = Object.values(options)
  const preferred = options.double || options.single || values[0]
  return {
    rateOptions: options,
    basePrice: Number(preferred?.basePrice || body.basePrice || 0),
    offerPrice: preferred?.offerPrice === null || preferred?.offerPrice === undefined ? null : Number(preferred.offerPrice),
    sizeSqft: preferred?.sizeSqft || body.sizeSqft || null,
    physicalRooms: Math.max(1, ...values.map((item) => Number(item.physicalRooms || 1))),
    occupancyAdults: Math.max(1, ...values.map((item) => Number(item.occupancyAdults || 1))),
    occupancyChildren: Math.max(0, ...values.map((item) => Number(item.occupancyChildren || 0))),
  }
}

function assertDateRange(startDate, endDate) {
  if (endDate < startDate) {
    throw badRequest('End date must be after start date.', 'invalid_date_range')
  }
}

function getRateOptions(room = {}) {
  return room.rate_options && typeof room.rate_options === 'object' ? room.rate_options : {}
}

function getRoomCapacity(room = {}) {
  const rates = Object.values(getRateOptions(room))
  const rateCapacity = Math.max(0, ...rates.map((item) => Number(item?.physicalRooms || 0)))
  return Math.max(rateCapacity, Number(room.physical_rooms || room.physicalRooms || 0), 1)
}

function getRoomFallbackPrice(room = {}) {
  const rates = getRateOptions(room)
  const preferred = rates.double || rates.single
  return Number(preferred?.offerPrice || preferred?.basePrice || room.offer_price || room.base_price || 0)
}

function roomNumberPrefix(value) {
  return String(value || 'ROOM')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 12) || 'ROOM'
}

function buildRateOverride(room, rateCategory, price) {
  const rates = getRateOptions(room)
  const categories = rateCategory === 'all'
    ? ['single', 'double'].filter((category) => rates[category])
    : [rateCategory]
  const effectiveCategories = categories.length ? categories : [rateCategory === 'all' ? 'double' : rateCategory]
  return effectiveCategories.reduce((overrides, category) => {
    overrides[category] = { price: Number(price) }
    return overrides
  }, {})
}

async function assertHomepageRoomLimit(db, hotelId, roomTypeId, showOnHomepage) {
  if (!showOnHomepage) return
  const { rows } = await db.query(
    `SELECT count(*)::int AS count
     FROM room_types
     WHERE hotel_id = $1 AND show_on_homepage = true AND id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
    [hotelId, roomTypeId || null],
  )
  if (Number(rows[0]?.count || 0) >= 3) {
    const error = new Error('Only three room categories can be shown on the homepage.')
    error.statusCode = 400
    error.code = 'homepage_room_limit'
    throw error
  }
}

adminRoutes.get('/dashboard', async (req, res) => {
  recordActivity({
    req,
    action: 'admin_panel_opened',
    entityType: 'hotel',
    entityId: req.hotel.id,
    metadata: { page: 'dashboard' },
  })
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_bookings,
       count(*) FILTER (WHERE check_in >= current_date AND status IN ('confirmed','payment_pending'))::int AS upcoming_bookings,
       count(*) FILTER (WHERE status = 'completed')::int AS completed_bookings,
       count(*) FILTER (WHERE status = 'payment_pending')::int AS pending_bookings,
       coalesce(sum(total_amount) FILTER (WHERE status IN ('confirmed','completed')), 0)::numeric AS revenue,
       count(DISTINCT user_id)::int AS guests
     FROM bookings
     WHERE hotel_id = $1`,
    [req.hotel.id],
  )
  const { rows: arrivals } = await query(
    `SELECT booking_reference, guest_name, check_in, check_out, total_amount, status
     FROM bookings
     WHERE hotel_id = $1
       AND check_in >= current_date
       AND status IN ('confirmed','payment_pending')
     ORDER BY check_in ASC
     LIMIT 8`,
    [req.hotel.id],
  )
  const { rows: roomRows } = await query('SELECT count(*)::int AS rooms FROM room_types WHERE hotel_id = $1', [req.hotel.id])
  const { rows: offerRows } = await query(
    `SELECT count(*) FILTER (WHERE active = true AND now() BETWEEN starts_at AND ends_at)::int AS live_offers
     FROM offers WHERE hotel_id = $1`,
    [req.hotel.id],
  )
  const { rows: feedbackRows } = await query(
    `SELECT count(*)::int AS feedback_count,
            coalesce(avg(rating), 0)::numeric(3,2) AS average_rating
     FROM hotel_feedback
     WHERE hotel_id = $1`,
    [req.hotel.id],
  )
  res.json({
    hotel: {
      id: req.hotel.id,
      name: req.hotel.name,
      slug: req.hotel.slug,
      subdomain: req.hotel.subdomain,
      address: req.hotel.address,
      branding: req.hotel.branding,
      hero_image_url: req.hotel.hero_image_url,
      policies: req.hotel.policies || {},
    },
    metrics: {
      ...rows[0],
      rooms: roomRows[0]?.rooms || 0,
      live_offers: offerRows[0]?.live_offers || 0,
      feedback_count: feedbackRows[0]?.feedback_count || 0,
      average_rating: feedbackRows[0]?.average_rating || 0,
    },
    arrivals,
  })
})

adminRoutes.patch('/hotel-settings', requireRole('hotel_admin', 'super_admin'), validate(hotelSettingsSchema), async (req, res) => {
  const { rows } = await query(
    `UPDATE hotels
     SET policies = jsonb_set(coalesce(policies, '{}'::jsonb), '{loyaltyRedemptionMinPoints}', to_jsonb($1::int), true),
         updated_at = now()
     WHERE id = $2
     RETURNING id, name, policies`,
    [req.body.loyaltyRedemptionMinPoints, req.hotel.id],
  )
  res.json({ hotel: rows[0] })
  recordActivity({
    req,
    action: 'hotel_loyalty_settings_updated',
    entityType: 'hotel',
    entityId: req.hotel.id,
    metadata: { loyaltyRedemptionMinPoints: req.body.loyaltyRedemptionMinPoints },
  })
})

adminRoutes.get('/bookings', async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, rt.name AS room_type_name, rt.bed_type, rt.size_sqft,
            rt.description AS room_description, rt.hero_image_url AS room_image_url,
            i.invoice_number, i.issued_at AS invoice_issued_at, i.pdf_url
     FROM bookings b
     JOIN room_types rt ON rt.id = b.room_type_id
     LEFT JOIN invoices i ON i.booking_id = b.id
     WHERE b.hotel_id = $1
       AND b.status <> 'completed'
     ORDER BY b.created_at DESC
     LIMIT 100`,
    [req.hotel.id],
  )
  res.json({ bookings: rows })
})

adminRoutes.post('/bookings', requireRole('hotel_admin', 'super_admin'), validate(bookingCreateSchema), async (req, res) => {
  const body = req.body
  const checkIn = body.checkIn.toISOString().slice(0, 10)
  const checkOut = body.checkOut.toISOString().slice(0, 10)
  const nights = Math.round((body.checkOut - body.checkIn) / 86_400_000)
  if (!Number.isFinite(nights) || nights < 1) throw badRequest('Check-out date must be after check-in date', 'invalid_stay_dates')

  const booking = await transaction(async (db) => {
    const { rows: roomRows } = await db.query('SELECT id, base_price FROM room_types WHERE id = $1 AND hotel_id = $2', [body.roomTypeId, req.hotel.id])
    if (!roomRows[0]) throw notFound('Room category not found')
    const subtotal = body.totalAmount ?? (Number(roomRows[0].base_price) * nights * body.roomsCount)
    const taxAmount = Math.round(((subtotal * FIXED_TAX_RATE) / 100 + Number.EPSILON) * 100) / 100
    const total = Math.round((subtotal + taxAmount + Number.EPSILON) * 100) / 100
    const reference = `RS-MANUAL-${Date.now().toString(36).toUpperCase()}`
    const { rows } = await db.query(
      `INSERT INTO bookings (
        hotel_id, room_type_id, booking_reference, status, check_in, check_out, nights,
        rooms_count, adults, children, guest_name, guest_email, guest_phone,
        subtotal_amount, tax_amount, total_amount, currency, confirmed_at, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, CASE WHEN $4 = 'confirmed' THEN now() ELSE null END, $18::jsonb)
      RETURNING *`,
      [
        req.hotel.id,
        body.roomTypeId,
        reference,
        body.status,
        checkIn,
        checkOut,
        nights,
        body.roomsCount,
        body.adults,
        body.children,
        body.guestName,
        body.guestEmail,
        body.guestPhone || null,
        subtotal,
        taxAmount,
        total,
        req.hotel.currency,
        JSON.stringify({ source: 'manual_admin' }),
      ],
    )
    return rows[0]
  })

  res.status(201).json({ booking })
  recordActivity({
    req,
    action: 'booking_created',
    entityType: 'booking',
    entityId: booking.id,
    metadata: { reference: booking.booking_reference, source: 'manual_admin' },
  })
})

adminRoutes.get('/users', async (req, res) => {
  const { rows } = await query(
    `WITH hotel_customer_users AS (
       SELECT DISTINCT u.id
       FROM users u
       LEFT JOIN customers c ON c.user_id = u.id AND c.hotel_id = $1
       LEFT JOIN bookings b ON b.user_id = u.id AND b.hotel_id = $1
       WHERE u.role = 'customer' AND (c.id IS NOT NULL OR b.id IS NOT NULL)
     ),
     booking_metrics AS (
       SELECT
         user_id,
         count(*)::int AS bookings,
         coalesce(sum(total_amount) FILTER (WHERE status = 'confirmed'), 0)::numeric AS revenue,
         max(created_at) AS last_booking_at
       FROM bookings
       WHERE hotel_id = $1 AND user_id IS NOT NULL
       GROUP BY user_id
     )
     SELECT
       u.id,
       u.email,
       u.full_name,
       u.phone,
       u.profile,
       u.created_at,
       coalesce(bm.bookings, 0)::int AS bookings,
       coalesce(bm.revenue, 0)::numeric AS revenue,
       bm.last_booking_at
     FROM hotel_customer_users hcu
     JOIN users u ON u.id = hcu.id
     LEFT JOIN booking_metrics bm ON bm.user_id = u.id
     ORDER BY coalesce(bm.last_booking_at, u.created_at) DESC
     LIMIT 300`,
    [req.hotel.id],
  )
  res.json({ users: rows })
})

adminRoutes.get('/users/:userId', async (req, res) => {
  const { rows } = await query(
    `WITH booking_metrics AS (
       SELECT
         user_id,
         count(*)::int AS bookings,
         coalesce(sum(total_amount) FILTER (WHERE status IN ('confirmed','completed')), 0)::numeric AS revenue,
         max(created_at) AS last_booking_at
       FROM bookings
       WHERE hotel_id = $1 AND user_id = $2
       GROUP BY user_id
     )
     SELECT
       u.id, u.email, u.full_name, u.phone, u.profile, u.created_at,
       coalesce(bm.bookings, 0)::int AS bookings,
       coalesce(bm.revenue, 0)::numeric AS revenue,
       bm.last_booking_at,
       coalesce(la.points_balance, 0)::int AS loyalty_points
     FROM users u
     LEFT JOIN booking_metrics bm ON bm.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT coalesce(sum(points_balance), 0)::int AS points_balance
       FROM loyalty_accounts
       WHERE user_id = u.id
     ) la ON true
     WHERE u.id = $2 AND u.role = 'customer'
     LIMIT 1`,
    [req.hotel.id, req.params.userId],
  )
  if (!rows[0]) throw notFound('Customer user not found')

  const { rows: bookingRows } = await query(
    `SELECT b.*, rt.name AS room_type_name
     FROM bookings b
     JOIN room_types rt ON rt.id = b.room_type_id
     WHERE b.hotel_id = $1 AND b.user_id = $2
     ORDER BY b.created_at DESC
     LIMIT 50`,
    [req.hotel.id, req.params.userId],
  )

  const { rows: feedbackRows } = await query(
    `SELECT id, rating, message, status, created_at
     FROM hotel_feedback
     WHERE hotel_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.hotel.id, req.params.userId],
  )

  res.json({ user: rows[0], bookings: bookingRows, feedback: feedbackRows })
})

adminRoutes.get('/feedback', async (req, res) => {
  const { rows } = await query(
    `SELECT f.*, u.full_name AS user_full_name, u.profile AS user_profile
     FROM hotel_feedback f
     LEFT JOIN users u ON u.id = f.user_id
     WHERE f.hotel_id = $1
     ORDER BY f.created_at DESC
     LIMIT 300`,
    [req.hotel.id],
  )
  res.json({ feedback: rows })
})

adminRoutes.delete('/users/:userId', requireRole('hotel_admin', 'super_admin'), async (req, res) => {
  const { rows: userRows } = await query(
    `SELECT id, firebase_uid, email, role
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [req.params.userId],
  )
  const user = userRows[0]
  if (!user || user.role !== 'customer') throw notFound('Customer user not found')

  const { rows: membershipRows } = await query(
    `SELECT
       EXISTS (SELECT 1 FROM customers WHERE hotel_id = $1 AND user_id = $2) OR
       EXISTS (SELECT 1 FROM bookings WHERE hotel_id = $1 AND user_id = $2) AS belongs_to_hotel,
       EXISTS (SELECT 1 FROM customers WHERE hotel_id <> $1 AND user_id = $2) OR
       EXISTS (SELECT 1 FROM bookings WHERE hotel_id <> $1 AND user_id = $2) AS belongs_elsewhere`,
    [req.hotel.id, req.params.userId],
  )
  if (!membershipRows[0]?.belongs_to_hotel) throw notFound('Customer user not found for this hotel')
  if (membershipRows[0]?.belongs_elsewhere) {
    throw conflict('This customer has records in another hotel, so they cannot be globally deleted from this hotel admin panel.', 'customer_shared_across_hotels')
  }

  await deleteFirebaseUser(user.firebase_uid)
  await transaction(async (db) => {
    await db.query('DELETE FROM customers WHERE user_id = $1 AND hotel_id = $2', [req.params.userId, req.hotel.id])
    await db.query('UPDATE bookings SET user_id = null, customer_id = null WHERE user_id = $1 AND hotel_id = $2', [req.params.userId, req.hotel.id])
    await db.query('DELETE FROM loyalty_accounts WHERE user_id = $1', [req.params.userId])
    await db.query('DELETE FROM users WHERE id = $1', [req.params.userId])
  })
  res.status(204).send()
  recordActivity({
    req,
    action: 'customer_deleted',
    entityType: 'user',
    entityId: req.params.userId,
    metadata: { email: user.email },
  })
})

adminRoutes.patch('/bookings/:bookingId', requireRole('hotel_admin', 'super_admin'), validate(bookingUpdateSchema), async (req, res) => {
  const body = req.body
  const { rows } = await query(
    `UPDATE bookings SET
       guest_name = coalesce($1, guest_name),
       guest_email = coalesce($2, guest_email),
       guest_phone = coalesce($3, guest_phone),
       adults = coalesce($4::int, adults),
       children = coalesce($5::int, children),
       metadata = CASE
         WHEN $6::text IS NULL THEN metadata
         ELSE jsonb_set(metadata, '{internalNote}', to_jsonb($6::text), true)
       END,
       updated_at = now()
     WHERE id = $7 AND hotel_id = $8
     RETURNING *`,
    [
      body.guestName,
      body.guestEmail,
      body.guestPhone,
      body.adults,
      body.children,
      body.internalNote,
      req.params.bookingId,
      req.hotel.id,
    ],
  )
  if (!rows[0]) throw notFound('Booking not found')
  res.json({ booking: rows[0] })
  recordActivity({
    req,
    action: 'booking_updated',
    entityType: 'booking',
    entityId: rows[0].id,
    metadata: { reference: rows[0].booking_reference },
  })
})

adminRoutes.delete('/bookings/:bookingId', requireRole('hotel_admin', 'super_admin'), async (req, res) => {
  await transaction(async (db) => {
    const { rows } = await db.query(
      `SELECT id, room_type_id, check_in, check_out, rooms_count, status
       FROM bookings
       WHERE id = $1 AND hotel_id = $2
       FOR UPDATE`,
      [req.params.bookingId, req.hotel.id],
    )
    const booking = rows[0]
    if (!booking) throw notFound('Booking not found')

    if (!['failed', 'cancelled'].includes(booking.status)) {
      await db.query(
        `UPDATE room_inventory
         SET reserved_rooms = GREATEST(reserved_rooms - $1, 0),
             updated_at = now()
         WHERE hotel_id = $2
           AND room_type_id = $3
           AND stay_date >= $4
           AND stay_date < $5`,
        [booking.rooms_count, req.hotel.id, booking.room_type_id, booking.check_in, booking.check_out],
      )
    }

    await db.query('DELETE FROM bookings WHERE id = $1 AND hotel_id = $2', [booking.id, req.hotel.id])
  })

  res.status(204).send()
  recordActivity({
    req,
    action: 'booking_deleted',
    entityType: 'booking',
    entityId: req.params.bookingId,
  })
})

adminRoutes.get('/rooms', async (req, res) => {
  const { rows } = await query(
    `SELECT rt.*,
      (SELECT count(*)::int FROM rooms r WHERE r.room_type_id = rt.id AND r.status = 'active') AS physical_rooms,
      (SELECT count(*)::int FROM room_inventory ri WHERE ri.room_type_id = rt.id AND ri.stay_date >= current_date) AS inventory_days,
      (SELECT min(ri.price)::numeric FROM room_inventory ri WHERE ri.room_type_id = rt.id AND ri.stay_date >= current_date) AS lowest_inventory_price,
      (SELECT min(ri.total_rooms - ri.reserved_rooms)::int FROM room_inventory ri WHERE ri.room_type_id = rt.id AND ri.stay_date >= current_date AND ri.closed = false) AS lowest_available_rooms
     FROM room_types rt
     WHERE rt.hotel_id = $1
     ORDER BY rt.base_price ASC`,
    [req.hotel.id],
  )
  res.json({ rooms: rows })
})

adminRoutes.post('/rooms', requireRole('hotel_admin', 'super_admin'), validate(roomTypeSchema), async (req, res) => {
  const body = req.body
  const summary = summarizeRateOptions(body)
  const prefix = roomNumberPrefix(body.roomNumberPrefix || body.slug || body.name)

  const room = await transaction(async (db) => {
    await assertHomepageRoomLimit(db, req.hotel.id, null, body.showOnHomepage)
    const slug = await uniqueRoomSlug(db, req.hotel.id, body.name, body.slug)
    const { rows } = await db.query(
      `INSERT INTO room_types (
        hotel_id, name, slug, description, occupancy_adults, occupancy_children,
        base_price, offer_price, rate_options, size_sqft, bed_type, amenities, amenity_items, hero_image_url, gallery, show_on_homepage
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        req.hotel.id,
        body.name,
        slug,
        body.description,
        summary.occupancyAdults,
        summary.occupancyChildren,
        summary.basePrice,
        summary.offerPrice,
        JSON.stringify(summary.rateOptions),
        summary.sizeSqft,
        body.bedType || null,
        body.amenities,
        JSON.stringify(body.amenityItems),
        body.heroImageUrl || null,
        JSON.stringify(body.gallery),
        body.showOnHomepage,
      ],
    )
    const roomType = rows[0]

    await db.query(
      `INSERT INTO rooms (hotel_id, room_type_id, room_number)
       SELECT $1, $2, $3 || '-' || lpad(n::text, 3, '0')
       FROM generate_series(1, $4) n
       ON CONFLICT (hotel_id, room_number) DO NOTHING`,
      [req.hotel.id, roomType.id, prefix, summary.physicalRooms],
    )

    await db.query(
      `INSERT INTO room_inventory (hotel_id, room_type_id, stay_date, total_rooms, price, rate_options)
       SELECT $1, $2, d::date, $3, $4, $6::jsonb
       FROM generate_series(current_date, current_date + ($5::int - 1), interval '1 day') d
       ON CONFLICT (hotel_id, room_type_id, stay_date) DO UPDATE SET
         total_rooms = EXCLUDED.total_rooms,
         price = EXCLUDED.price,
         rate_options = EXCLUDED.rate_options,
         updated_at = now()`,
      [req.hotel.id, roomType.id, summary.physicalRooms, summary.offerPrice || summary.basePrice, body.inventoryDays, JSON.stringify(summary.rateOptions)],
    )

    return roomType
  })

  await recordMediaAssets(req.hotel.id, 'room_type', room.id, collectRoomMedia(room), room.name)
  res.status(201).json({ room })
  recordActivity({
    req,
    action: 'room_created',
    entityType: 'room_type',
    entityId: room.id,
    metadata: { name: room.name },
  })
})

adminRoutes.patch('/rooms/:roomTypeId', requireRole('hotel_admin', 'super_admin'), validate(roomUpdateSchema), async (req, res) => {
  const body = req.body
  const result = await transaction(async (db) => {
    if (body.showOnHomepage !== undefined) {
      await assertHomepageRoomLimit(db, req.hotel.id, req.params.roomTypeId, body.showOnHomepage)
    }
    const { rows: previousRows } = await db.query(
      `SELECT rt.*,
              (SELECT count(*)::int FROM rooms r WHERE r.room_type_id = rt.id AND r.status = 'active') AS physical_rooms
       FROM room_types rt
       WHERE rt.id = $1 AND rt.hotel_id = $2
       FOR UPDATE`,
      [req.params.roomTypeId, req.hotel.id],
    )
    if (!previousRows[0]) throw notFound('Room category not found')
    const summary = body.rateOptions ? summarizeRateOptions(body) : null
    const activeRoomCount = Number(previousRows[0].physical_rooms || 0)
    const { rows } = await db.query(
      `UPDATE room_types SET
         name = coalesce($1, name),
         slug = coalesce($2, slug),
         description = coalesce($3, description),
         occupancy_adults = coalesce($4::int, occupancy_adults),
         occupancy_children = coalesce($5::int, occupancy_children),
         base_price = coalesce($6::numeric, base_price),
         offer_price = CASE WHEN $8::jsonb IS NULL THEN coalesce($7::numeric, offer_price) ELSE $7::numeric END,
         rate_options = coalesce($8::jsonb, rate_options),
         size_sqft = coalesce($9::int, size_sqft),
         bed_type = coalesce($10, bed_type),
         amenities = coalesce($11::text[], amenities),
         amenity_items = coalesce($12::jsonb, amenity_items),
         hero_image_url = CASE WHEN $13::text IS NULL THEN hero_image_url ELSE nullif($13, '') END,
         gallery = coalesce($14::jsonb, gallery),
         show_on_homepage = coalesce($15::boolean, show_on_homepage),
         active = coalesce($16::boolean, active),
         updated_at = now()
       WHERE id = $17 AND hotel_id = $18
       RETURNING *`,
      [
        body.name,
        body.slug ? slugify(body.slug) : null,
        body.description,
        summary?.occupancyAdults ?? body.occupancyAdults,
        summary?.occupancyChildren ?? body.occupancyChildren,
        summary?.basePrice ?? body.basePrice,
        summary ? summary.offerPrice : body.offerPrice ?? null,
        summary ? JSON.stringify(summary.rateOptions) : null,
        summary?.sizeSqft ?? body.sizeSqft,
        body.bedType,
        body.amenities,
        body.amenityItems ? JSON.stringify(body.amenityItems) : null,
        body.heroImageUrl,
        body.gallery ? JSON.stringify(body.gallery) : null,
        body.showOnHomepage,
        body.active,
        req.params.roomTypeId,
        req.hotel.id,
      ],
    )
    if (!rows[0]) throw notFound('Room category not found')
    if (summary) {
      const { rows: countRows } = await db.query(
        `SELECT count(*)::int AS count
         FROM rooms
         WHERE hotel_id = $1 AND room_type_id = $2 AND status = 'active'`,
        [req.hotel.id, req.params.roomTypeId],
      )
      const currentCount = Number(countRows[0]?.count || 0)
      if (summary.physicalRooms > currentCount) {
        const neededRooms = summary.physicalRooms - currentCount
        const { rowCount: reactivatedCount } = await db.query(
          `UPDATE rooms
           SET status = 'active'
           WHERE id = ANY (
             SELECT id
             FROM rooms
             WHERE hotel_id = $1 AND room_type_id = $2 AND status = 'inactive'
             ORDER BY created_at ASC
             LIMIT $3
           )`,
          [req.hotel.id, req.params.roomTypeId, neededRooms],
        )
        const remainingRooms = neededRooms - reactivatedCount
        const prefix = roomNumberPrefix(body.slug || body.name || rows[0].slug || rows[0].name)
        if (remainingRooms > 0) {
          await db.query(
            `INSERT INTO rooms (hotel_id, room_type_id, room_number)
             SELECT $1, $2, $3 || '-' || lpad(n::text, 3, '0')
             FROM generate_series($4::int + 1, $4::int + $5::int) n
             ON CONFLICT (hotel_id, room_number) DO NOTHING`,
            [req.hotel.id, req.params.roomTypeId, prefix, currentCount + reactivatedCount, remainingRooms],
          )
        }
      } else if (summary.physicalRooms < currentCount) {
        await db.query(
          `UPDATE rooms
           SET status = 'inactive'
           WHERE id = ANY (
             SELECT id
             FROM rooms
             WHERE hotel_id = $1 AND room_type_id = $2 AND status = 'active'
             ORDER BY created_at DESC
             LIMIT $3
           )`,
          [req.hotel.id, req.params.roomTypeId, currentCount - summary.physicalRooms],
        )
      }
      await db.query(
        `UPDATE room_inventory
         SET total_rooms = greatest($3::int, reserved_rooms),
             price = $4::numeric,
             rate_options = $5::jsonb,
             updated_at = now()
         WHERE hotel_id = $1
           AND room_type_id = $2
           AND stay_date >= current_date
           AND closed = false
           AND total_rooms >= least($6::int, $3::int)`,
        [
          req.hotel.id,
          req.params.roomTypeId,
          summary.physicalRooms,
          summary.offerPrice || summary.basePrice,
          JSON.stringify(summary.rateOptions),
          activeRoomCount,
        ],
      )
    }
    return { previousRoom: previousRows[0], room: rows[0] }
  })
  const { previousRoom, room } = result

  const previousMedia = collectRoomMedia(previousRoom)
  const nextMedia = collectRoomMedia(room)
  await syncRemovedCloudinaryMedia(req.hotel.id, previousMedia, nextMedia)
  await recordMediaAssets(req.hotel.id, 'room_type', room.id, nextMedia, room.name)

  res.json({ room })
  recordActivity({
    req,
    action: 'room_updated',
    entityType: 'room_type',
    entityId: room.id,
    metadata: { name: room.name },
  })
})

adminRoutes.delete('/rooms/:roomTypeId', requireRole('hotel_admin', 'super_admin'), async (req, res) => {
  const result = await transaction(async (db) => {
    const { rows: roomRows } = await db.query(
      'SELECT * FROM room_types WHERE id = $1 AND hotel_id = $2 FOR UPDATE',
      [req.params.roomTypeId, req.hotel.id],
    )
    const room = roomRows[0]
    if (!room) throw notFound('Room category not found')

    const { rows: bookingRows } = await db.query(
      `SELECT count(*)::int AS count
       FROM bookings
       WHERE hotel_id = $1 AND room_type_id = $2`,
      [req.hotel.id, req.params.roomTypeId],
    )
    const bookingCount = Number(bookingRows[0]?.count || 0)
    if (bookingCount > 0) {
      await db.query(
        `UPDATE room_types
         SET active = false, show_on_homepage = false, updated_at = now()
         WHERE id = $1 AND hotel_id = $2`,
        [req.params.roomTypeId, req.hotel.id],
      )
      await db.query(
        `DELETE FROM room_inventory
         WHERE hotel_id = $1
           AND room_type_id = $2
           AND stay_date >= current_date`,
        [req.hotel.id, req.params.roomTypeId],
      )
      return { room, mode: 'archived', bookingCount }
    }

    await db.query('DELETE FROM media_assets WHERE hotel_id = $1 AND entity_type = $2 AND entity_id = $3', [req.hotel.id, 'room_type', req.params.roomTypeId])
    await db.query('DELETE FROM room_types WHERE id = $1 AND hotel_id = $2', [req.params.roomTypeId, req.hotel.id])
    return { room, mode: 'deleted', bookingCount: 0 }
  })

  await syncRemovedCloudinaryMedia(req.hotel.id, collectRoomMedia(result.room), [])
  res.json({ mode: result.mode, bookingCount: result.bookingCount })
  recordActivity({
    req,
    action: result.mode === 'deleted' ? 'room_deleted' : 'room_archived',
    entityType: 'room_type',
    entityId: req.params.roomTypeId,
    metadata: { mode: result.mode, bookings: result.bookingCount },
  })
})

adminRoutes.patch('/rooms/:roomTypeId/homepage', requireRole('hotel_admin', 'super_admin'), validate(roomFeatureSchema), async (req, res) => {
  const room = await transaction(async (db) => {
    const { rows: roomRows } = await db.query(
      'SELECT id FROM room_types WHERE id = $1 AND hotel_id = $2',
      [req.params.roomTypeId, req.hotel.id],
    )
    if (!roomRows[0]) throw notFound('Room category not found')
    await assertHomepageRoomLimit(db, req.hotel.id, req.params.roomTypeId, req.body.showOnHomepage)
    const { rows } = await db.query(
      `UPDATE room_types
       SET show_on_homepage = $1, updated_at = now()
       WHERE id = $2 AND hotel_id = $3
       RETURNING *`,
      [req.body.showOnHomepage, req.params.roomTypeId, req.hotel.id],
    )
    return rows[0]
  })

  res.json({ room })
  recordActivity({
    req,
    action: req.body.showOnHomepage ? 'room_featured' : 'room_unfeatured',
    entityType: 'room_type',
    entityId: room.id,
    metadata: { showOnHomepage: req.body.showOnHomepage },
  })
})

adminRoutes.patch('/rooms/:roomTypeId/inventory', requireRole('hotel_admin', 'super_admin'), validate(inventorySchema), async (req, res) => {
  const startDate = req.body.startDate.toISOString().slice(0, 10)
  const endDate = req.body.endDate.toISOString().slice(0, 10)
  assertDateRange(startDate, endDate)

  const { rows: roomRows } = await query(
    'SELECT id FROM room_types WHERE id = $1 AND hotel_id = $2',
    [req.params.roomTypeId, req.hotel.id],
  )
  if (!roomRows[0]) throw notFound('Room category not found')

  const { rowCount } = await query(
    `INSERT INTO room_inventory (hotel_id, room_type_id, stay_date, total_rooms, price, min_nights, closed)
     SELECT $1, $2, d::date, $3, $4, $5, $6
     FROM generate_series($7::date, $8::date, interval '1 day') d
     ON CONFLICT (hotel_id, room_type_id, stay_date) DO UPDATE SET
       total_rooms = EXCLUDED.total_rooms,
       price = EXCLUDED.price,
       min_nights = EXCLUDED.min_nights,
       closed = EXCLUDED.closed,
       updated_at = now()`,
    [
      req.hotel.id,
      req.params.roomTypeId,
      req.body.totalRooms,
      req.body.price,
      req.body.minNights,
      req.body.closed,
      startDate,
      endDate,
    ],
  )

  res.json({ updatedDays: rowCount })
  recordActivity({
    req,
    action: 'inventory_updated',
    entityType: 'room_type',
    entityId: req.params.roomTypeId,
    metadata: { startDate, endDate, updatedDays: rowCount },
  })
})

adminRoutes.get('/inventory-blocks', async (req, res) => {
  const { rows } = await query(
    `WITH room_caps AS (
       SELECT
         rt.id,
         rt.name,
         greatest(
           coalesce((rt.rate_options->'single'->>'physicalRooms')::int, 0),
           coalesce((rt.rate_options->'double'->>'physicalRooms')::int, 0),
           (SELECT count(*)::int FROM rooms r WHERE r.room_type_id = rt.id AND r.status = 'active'),
           1
         ) AS capacity
       FROM room_types rt
       WHERE rt.hotel_id = $1
     ),
     marked AS (
       SELECT
         ri.room_type_id,
         rc.name AS room_name,
         rc.capacity,
         ri.stay_date,
         ri.total_rooms,
         ri.reserved_rooms,
         ri.closed,
         greatest(rc.capacity - ri.total_rooms, 0)::int AS offline_rooms,
         ri.stay_date - (row_number() OVER (
           PARTITION BY ri.room_type_id, ri.total_rooms, ri.closed
           ORDER BY ri.stay_date
         )::int * interval '1 day') AS grp
       FROM room_inventory ri
       JOIN room_caps rc ON rc.id = ri.room_type_id
       WHERE ri.hotel_id = $1
         AND ri.stay_date >= current_date
         AND (ri.closed = true OR ri.total_rooms < rc.capacity)
     )
     SELECT
       (room_type_id::text || ':' || min(stay_date)::text || ':' || max(stay_date)::text || ':' || total_rooms::text || ':' || closed::text) AS id,
       room_type_id,
       room_name,
       min(stay_date)::text AS start_date,
       max(stay_date)::text AS end_date,
       count(*)::int AS days,
       capacity,
       total_rooms,
       offline_rooms,
       max(reserved_rooms)::int AS reserved_rooms,
       closed
     FROM marked
     GROUP BY room_type_id, room_name, capacity, total_rooms, offline_rooms, closed, grp
     ORDER BY start_date ASC, room_name ASC`,
    [req.hotel.id],
  )
  res.json({ entries: rows })
})

adminRoutes.get('/rate-plans', async (req, res) => {
  const { rows } = await query(
    `WITH expanded AS (
       SELECT
         ri.room_type_id,
         rt.name AS room_name,
         ri.stay_date,
         ri.min_nights,
         rate.key AS rate_category,
         (rate.value->>'price')::numeric AS price,
         ri.stay_date - (row_number() OVER (
           PARTITION BY ri.room_type_id, rate.key, (rate.value->>'price')::numeric, ri.min_nights
           ORDER BY ri.stay_date
         )::int * interval '1 day') AS grp
     FROM room_inventory ri
     JOIN room_types rt ON rt.id = ri.room_type_id AND rt.hotel_id = ri.hotel_id
     CROSS JOIN LATERAL jsonb_each(coalesce(ri.rate_options, '{}'::jsonb)) AS rate(key, value)
       WHERE ri.hotel_id = $1
         AND ri.stay_date >= current_date
         AND rate.value ? 'price'
     ),
     grouped AS (
       SELECT
         (room_type_id::text || ':' || rate_category || ':' || min(stay_date)::text || ':' || max(stay_date)::text || ':' || price::text || ':' || min_nights::text) AS id,
         room_type_id,
         room_name,
         rate_category,
         min(stay_date)::text AS start_date,
         max(stay_date)::text AS end_date,
         count(*)::int AS days,
         price,
         min_nights
       FROM expanded
       GROUP BY room_type_id, room_name, rate_category, price, min_nights, grp
     )
     SELECT
       (room_type_id::text || ':' || array_to_string(array_agg(rate_category ORDER BY rate_category), '+') || ':' || start_date::text || ':' || end_date::text || ':' || price::text || ':' || min_nights::text) AS id,
       room_type_id,
       room_name,
       CASE
         WHEN array_agg(rate_category) @> ARRAY['single', 'double']::text[] THEN 'all'
         ELSE min(rate_category)
       END AS rate_category,
       array_agg(rate_category ORDER BY rate_category) AS rate_categories,
       start_date::text AS start_date,
       end_date::text AS end_date,
       days,
       price,
       min_nights
     FROM grouped
     GROUP BY room_type_id, room_name, start_date, end_date, days, price, min_nights
     ORDER BY start_date ASC, room_name ASC, rate_category ASC`,
    [req.hotel.id],
  )
  res.json({ entries: rows })
})

adminRoutes.get('/rooms/:roomTypeId/calendar-summary', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days || 180), 14), 370)
  const { rows: roomRows } = await query(
    `SELECT rt.*,
            (SELECT count(*)::int FROM rooms r WHERE r.room_type_id = rt.id AND r.status = 'active') AS physical_rooms
     FROM room_types rt
     WHERE rt.id = $1 AND rt.hotel_id = $2`,
    [req.params.roomTypeId, req.hotel.id],
  )
  const room = roomRows[0]
  if (!room) throw notFound('Room category not found')

  const capacity = getRoomCapacity(room)
  const fallbackPrice = getRoomFallbackPrice(room)
  const rates = getRateOptions(room)
  const { rows } = await query(
    `WITH dates AS (
       SELECT d::date AS stay_date
       FROM generate_series(current_date, current_date + ($3::int - 1), interval '1 day') d
     )
     SELECT
       d.stay_date::text AS stay_date,
       coalesce(ri.total_rooms, $4::int)::int AS total_rooms,
       coalesce(ri.reserved_rooms, 0)::int AS reserved_rooms,
       coalesce(ri.closed, false)::boolean AS closed,
       coalesce(ri.price, $5::numeric)::numeric AS price,
       coalesce(ri.min_nights, 1)::int AS min_nights,
       coalesce(ri.rate_options, '{}'::jsonb) AS rate_options,
       nullif(ri.rate_options->'single'->>'price', '')::numeric AS single_override_price,
       nullif(ri.rate_options->'double'->>'price', '')::numeric AS double_override_price
     FROM dates d
     LEFT JOIN room_inventory ri
       ON ri.hotel_id = $1
      AND ri.room_type_id = $2
      AND ri.stay_date = d.stay_date
     ORDER BY d.stay_date ASC`,
    [req.hotel.id, req.params.roomTypeId, days, capacity, fallbackPrice],
  )

  res.json({
    room: {
      id: room.id,
      name: room.name,
      capacity,
      baseRates: {
        single: rates.single ? Number(rates.single.offerPrice || rates.single.basePrice || 0) : null,
        double: rates.double ? Number(rates.double.offerPrice || rates.double.basePrice || 0) : null,
      },
    },
    days: rows.map((day) => {
      const totalRooms = day.total_rooms === null || day.total_rooms === undefined ? capacity : Number(day.total_rooms)
      const reservedRooms = Number(day.reserved_rooms || 0)
      const closed = Boolean(day.closed)
      return {
        ...day,
        total_rooms: totalRooms,
        reserved_rooms: reservedRooms,
        price: Number(day.price || fallbackPrice),
        min_nights: Number(day.min_nights || 1),
        single_override_price: day.single_override_price === null ? null : Number(day.single_override_price),
        double_override_price: day.double_override_price === null ? null : Number(day.double_override_price),
        offline_rooms: closed ? capacity : Math.max(0, capacity - totalRooms),
        sellable_online: closed ? 0 : Math.max(0, totalRooms - reservedRooms),
      }
    }),
  })
})

adminRoutes.patch('/rooms/:roomTypeId/inventory-blocks', requireRole('hotel_admin', 'super_admin'), validate(inventoryBlockSchema), async (req, res) => {
  const startDate = req.body.startDate.toISOString().slice(0, 10)
  const endDate = req.body.endDate.toISOString().slice(0, 10)
  assertDateRange(startDate, endDate)

  const { rows: roomRows } = await query(
    `SELECT rt.*,
            (SELECT count(*)::int FROM rooms r WHERE r.room_type_id = rt.id AND r.status = 'active') AS physical_rooms
     FROM room_types rt
     WHERE rt.id = $1 AND rt.hotel_id = $2`,
    [req.params.roomTypeId, req.hotel.id],
  )
  const room = roomRows[0]
  if (!room) throw notFound('Room category not found')

  const capacity = getRoomCapacity(room)
  const offlineRooms = req.body.closed ? capacity : Math.min(Number(req.body.offlineRooms || 0), capacity)
  const totalRooms = req.body.closed ? 0 : Math.max(0, capacity - offlineRooms)
  const fallbackPrice = getRoomFallbackPrice(room)

  const { rowCount } = await query(
    `INSERT INTO room_inventory (hotel_id, room_type_id, stay_date, total_rooms, price, rate_options, closed)
     SELECT $1, $2, d::date, $3, $4, $5::jsonb, $6
     FROM generate_series($7::date, $8::date, interval '1 day') d
     ON CONFLICT (hotel_id, room_type_id, stay_date) DO UPDATE SET
       total_rooms = greatest(EXCLUDED.total_rooms, room_inventory.reserved_rooms),
       closed = EXCLUDED.closed,
       rate_options = CASE
         WHEN room_inventory.rate_options = '{}'::jsonb THEN EXCLUDED.rate_options
         ELSE room_inventory.rate_options
       END,
       updated_at = now()`,
    [
      req.hotel.id,
      req.params.roomTypeId,
      totalRooms,
      fallbackPrice,
      JSON.stringify(getRateOptions(room)),
      req.body.closed,
      startDate,
      endDate,
    ],
  )

  res.json({ updatedDays: rowCount, capacity, offlineRooms, totalRooms })
  recordActivity({
    req,
    action: 'inventory_block_updated',
    entityType: 'room_type',
    entityId: req.params.roomTypeId,
    metadata: { startDate, endDate, offlineRooms, totalRooms, closed: req.body.closed, note: req.body.note || '' },
  })
})

adminRoutes.delete('/rooms/:roomTypeId/inventory-blocks', requireRole('hotel_admin', 'super_admin'), validate(dateRangeSchema), async (req, res) => {
  const startDate = req.body.startDate.toISOString().slice(0, 10)
  const endDate = req.body.endDate.toISOString().slice(0, 10)
  assertDateRange(startDate, endDate)

  const { rows: roomRows } = await query(
    `SELECT rt.*,
            (SELECT count(*)::int FROM rooms r WHERE r.room_type_id = rt.id AND r.status = 'active') AS physical_rooms
     FROM room_types rt
     WHERE rt.id = $1 AND rt.hotel_id = $2`,
    [req.params.roomTypeId, req.hotel.id],
  )
  const room = roomRows[0]
  if (!room) throw notFound('Room category not found')

  const capacity = getRoomCapacity(room)
  const { rowCount } = await query(
    `UPDATE room_inventory
     SET total_rooms = $3::int,
         closed = false,
         updated_at = now()
     WHERE hotel_id = $1
       AND room_type_id = $2
       AND stay_date BETWEEN $4::date AND $5::date`,
    [req.hotel.id, req.params.roomTypeId, capacity, startDate, endDate],
  )
  const { rows: remainingRows } = await query(
    `SELECT count(*)::int AS count
     FROM room_inventory
     WHERE hotel_id = $1
       AND room_type_id = $2
       AND stay_date BETWEEN $3::date AND $4::date
       AND (closed = true OR total_rooms < $5::int)`,
    [req.hotel.id, req.params.roomTypeId, startDate, endDate, capacity],
  )

  res.json({ updatedDays: rowCount, capacity, remainingBlockedDays: Number(remainingRows[0]?.count || 0) })
  recordActivity({
    req,
    action: 'inventory_block_deleted',
    entityType: 'room_type',
    entityId: req.params.roomTypeId,
    metadata: { startDate, endDate, updatedDays: rowCount },
  })
})

adminRoutes.patch('/rooms/:roomTypeId/rates', requireRole('hotel_admin', 'super_admin'), validate(rateManagementSchema), async (req, res) => {
  const startDate = req.body.startDate.toISOString().slice(0, 10)
  const endDate = req.body.endDate.toISOString().slice(0, 10)
  assertDateRange(startDate, endDate)

  const { rows: roomRows } = await query(
    `SELECT rt.*,
            (SELECT count(*)::int FROM rooms r WHERE r.room_type_id = rt.id AND r.status = 'active') AS physical_rooms
     FROM room_types rt
     WHERE rt.id = $1 AND rt.hotel_id = $2`,
    [req.params.roomTypeId, req.hotel.id],
  )
  const room = roomRows[0]
  if (!room) throw notFound('Room category not found')

  const capacity = getRoomCapacity(room)
  const rateOverride = buildRateOverride(room, req.body.rateCategory, req.body.price)
  const { rowCount } = await query(
    `INSERT INTO room_inventory (hotel_id, room_type_id, stay_date, total_rooms, price, rate_options, min_nights)
     SELECT $1, $2, d::date, $3, $4, $5::jsonb, $6
     FROM generate_series($7::date, $8::date, interval '1 day') d
     ON CONFLICT (hotel_id, room_type_id, stay_date) DO UPDATE SET
       price = EXCLUDED.price,
       rate_options = coalesce(room_inventory.rate_options, '{}'::jsonb) || EXCLUDED.rate_options,
       min_nights = EXCLUDED.min_nights,
       updated_at = now()`,
    [
      req.hotel.id,
      req.params.roomTypeId,
      capacity,
      req.body.price,
      JSON.stringify(rateOverride),
      req.body.minNights,
      startDate,
      endDate,
    ],
  )

  res.json({ updatedDays: rowCount, rateCategory: req.body.rateCategory, price: Number(req.body.price) })
  recordActivity({
    req,
    action: 'rate_plan_updated',
    entityType: 'room_type',
    entityId: req.params.roomTypeId,
    metadata: { startDate, endDate, rateCategory: req.body.rateCategory, price: Number(req.body.price), minNights: req.body.minNights },
  })
})

adminRoutes.delete('/rooms/:roomTypeId/rates', requireRole('hotel_admin', 'super_admin'), validate(rateDeleteSchema), async (req, res) => {
  const startDate = req.body.startDate.toISOString().slice(0, 10)
  const endDate = req.body.endDate.toISOString().slice(0, 10)
  assertDateRange(startDate, endDate)

  const { rows: roomRows } = await query(
    'SELECT id FROM room_types WHERE id = $1 AND hotel_id = $2',
    [req.params.roomTypeId, req.hotel.id],
  )
  if (!roomRows[0]) throw notFound('Room category not found')

  const resetExpression = req.body.rateCategory === 'all'
    ? "coalesce(rate_options, '{}'::jsonb) - 'single' - 'double'"
    : `coalesce(rate_options, '{}'::jsonb) - '${req.body.rateCategory}'`
  const { rows } = await query(
    `WITH updated AS (
       UPDATE room_inventory
       SET rate_options = ${resetExpression},
           min_nights = CASE
             WHEN NOT EXISTS (
               SELECT 1
               FROM jsonb_each(${resetExpression}) AS remaining(key, value)
               WHERE remaining.value ? 'price'
             ) THEN 1
             ELSE min_nights
           END,
           updated_at = now()
       WHERE hotel_id = $1
         AND room_type_id = $2
         AND stay_date BETWEEN $3::date AND $4::date
       RETURNING 1
     )
     SELECT count(*)::int AS updated_days FROM updated`,
    [req.hotel.id, req.params.roomTypeId, startDate, endDate],
  )
  const rowCount = rows[0]?.updated_days || 0
  const { rows: remainingRows } = await query(
    `SELECT count(*)::int AS count
     FROM room_inventory ri
     CROSS JOIN LATERAL jsonb_each(coalesce(ri.rate_options, '{}'::jsonb)) AS rate(key, value)
     WHERE ri.hotel_id = $1
       AND ri.room_type_id = $2
       AND ri.stay_date BETWEEN $3::date AND $4::date
       AND rate.value ? 'price'`,
    [req.hotel.id, req.params.roomTypeId, startDate, endDate],
  )

  res.json({ updatedDays: rowCount, rateCategory: req.body.rateCategory, remainingOverrideDays: Number(remainingRows[0]?.count || 0) })
  recordActivity({
    req,
    action: 'rate_plan_deleted',
    entityType: 'room_type',
    entityId: req.params.roomTypeId,
    metadata: { startDate, endDate, rateCategory: req.body.rateCategory, updatedDays: rowCount },
  })
})

adminRoutes.get('/payments', async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, b.booking_reference, b.guest_name
     FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     WHERE p.hotel_id = $1
     ORDER BY p.created_at DESC
     LIMIT 100`,
    [req.hotel.id],
  )
  res.json({ payments: rows })
})

adminRoutes.get('/amenities', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM hotel_amenities
     WHERE hotel_id = $1
     ORDER BY active DESC, name ASC`,
    [req.hotel.id],
  )
  res.json({ amenities: rows })
})

adminRoutes.post('/amenities', requireRole('hotel_admin', 'super_admin'), validate(amenitySchema), async (req, res) => {
  const { rows } = await query(
    `INSERT INTO hotel_amenities (hotel_id, name, description, price, icon, active)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (hotel_id, name) DO UPDATE SET
       description = EXCLUDED.description,
       price = EXCLUDED.price,
       icon = EXCLUDED.icon,
       active = EXCLUDED.active,
       updated_at = now()
     RETURNING *`,
    [req.hotel.id, req.body.name, req.body.description || '', req.body.price, req.body.icon || 'sparkles', req.body.active],
  )
  res.status(201).json({ amenity: rows[0] })
  recordActivity({
    req,
    action: 'amenity_saved',
    entityType: 'amenity',
    entityId: rows[0].id,
    metadata: { name: rows[0].name },
  })
})

adminRoutes.patch('/amenities/:amenityId', requireRole('hotel_admin', 'super_admin'), validate(amenitySchema.partial()), async (req, res) => {
  const { rows } = await query(
    `UPDATE hotel_amenities SET
       name = coalesce($1, name),
       description = coalesce($2, description),
       price = coalesce($3::numeric, price),
       icon = coalesce($4, icon),
       active = coalesce($5::boolean, active),
       updated_at = now()
     WHERE id = $6 AND hotel_id = $7
     RETURNING *`,
    [req.body.name, req.body.description, req.body.price, req.body.icon, req.body.active, req.params.amenityId, req.hotel.id],
  )
  if (!rows[0]) throw notFound('Amenity not found')
  res.json({ amenity: rows[0] })
  recordActivity({
    req,
    action: 'amenity_updated',
    entityType: 'amenity',
    entityId: rows[0].id,
    metadata: { name: rows[0].name },
  })
})

adminRoutes.delete('/amenities/:amenityId', requireRole('hotel_admin', 'super_admin'), async (req, res) => {
  const { rowCount } = await query('DELETE FROM hotel_amenities WHERE id = $1 AND hotel_id = $2', [req.params.amenityId, req.hotel.id])
  if (!rowCount) throw notFound('Amenity not found')
  res.status(204).send()
  recordActivity({
    req,
    action: 'amenity_deleted',
    entityType: 'amenity',
    entityId: req.params.amenityId,
  })
})

adminRoutes.get('/faqs', async (req, res) => {
  const { rows } = await query(
    `SELECT id, question, answer, sort_order, active, created_at
     FROM hotel_faqs
     WHERE hotel_id = $1
     ORDER BY sort_order ASC, created_at DESC`,
    [req.hotel.id],
  )
  res.json({ faqs: rows })
})

adminRoutes.post('/faqs', requireRole('hotel_admin', 'super_admin'), validate(faqSchema), async (req, res) => {
  const { rows } = await query(
    `INSERT INTO hotel_faqs (hotel_id, question, answer, sort_order, active)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, question, answer, sort_order, active, created_at`,
    [req.hotel.id, req.body.question, req.body.answer, req.body.sortOrder, req.body.active],
  )
  res.status(201).json({ faq: rows[0] })
  recordActivity({
    req,
    action: 'faq_saved',
    entityType: 'faq',
    entityId: rows[0].id,
    metadata: { question: rows[0].question },
  })
})

adminRoutes.patch('/faqs/:faqId', requireRole('hotel_admin', 'super_admin'), validate(faqSchema.partial()), async (req, res) => {
  const { rows } = await query(
    `UPDATE hotel_faqs SET
       question = coalesce($1, question),
       answer = coalesce($2, answer),
       sort_order = coalesce($3::int, sort_order),
       active = coalesce($4::boolean, active),
       updated_at = now()
     WHERE id = $5 AND hotel_id = $6
     RETURNING id, question, answer, sort_order, active, created_at`,
    [req.body.question, req.body.answer, req.body.sortOrder, req.body.active, req.params.faqId, req.hotel.id],
  )
  if (!rows[0]) throw notFound('FAQ not found')
  res.json({ faq: rows[0] })
  recordActivity({
    req,
    action: 'faq_updated',
    entityType: 'faq',
    entityId: rows[0].id,
    metadata: { question: rows[0].question },
  })
})

adminRoutes.delete('/faqs/:faqId', requireRole('hotel_admin', 'super_admin'), async (req, res) => {
  const { rowCount } = await query('DELETE FROM hotel_faqs WHERE id = $1 AND hotel_id = $2', [req.params.faqId, req.hotel.id])
  if (!rowCount) throw notFound('FAQ not found')
  res.status(204).send()
  recordActivity({
    req,
    action: 'faq_deleted',
    entityType: 'faq',
    entityId: req.params.faqId,
  })
})

adminRoutes.get('/offers', async (req, res) => {
  const { rows } = await query(
    `SELECT *
     FROM offers
     WHERE hotel_id = $1
     ORDER BY active DESC, starts_at DESC, created_at DESC`,
    [req.hotel.id],
  )
  res.json({ offers: rows })
})

adminRoutes.post('/offers', requireRole('hotel_admin', 'super_admin'), validate(offerSchema), async (req, res) => {
  if (req.body.endsAt <= req.body.startsAt) throw badRequest('Offer end date must be after start date', 'invalid_offer_dates')
  const { rows } = await query(
    `INSERT INTO offers (
       hotel_id, title, description, code, discount_type, discount_value, starts_at,
       ends_at, active, image_url, audience_type, min_completed_bookings, badge, highlight_color
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      req.hotel.id,
      req.body.title,
      req.body.description,
      req.body.code || null,
      req.body.discountType,
      req.body.discountValue,
      req.body.startsAt,
      req.body.endsAt,
      req.body.active,
      req.body.imageUrl || null,
      req.body.audienceType,
      req.body.minCompletedBookings,
      req.body.badge || '',
      req.body.highlightColor || '#f59e0b',
    ],
  )
  await recordMediaAssets(req.hotel.id, 'offer', rows[0].id, collectOfferMedia(rows[0]), rows[0].title)
  res.status(201).json({ offer: rows[0] })
  recordActivity({
    req,
    action: 'offer_created',
    entityType: 'offer',
    entityId: rows[0].id,
    metadata: { title: rows[0].title },
  })
})

adminRoutes.patch('/offers/:offerId', requireRole('hotel_admin', 'super_admin'), validate(offerSchema.partial()), async (req, res) => {
  const body = req.body
  const result = await transaction(async (db) => {
    const { rows: previousRows } = await db.query(
      'SELECT * FROM offers WHERE id = $1 AND hotel_id = $2 FOR UPDATE',
      [req.params.offerId, req.hotel.id],
    )
    if (!previousRows[0]) throw notFound('Offer not found')
    const { rows } = await db.query(
      `UPDATE offers SET
         title = coalesce($1, title),
         description = coalesce($2, description),
         code = coalesce($3, code),
         discount_type = coalesce($4, discount_type),
         discount_value = coalesce($5::numeric, discount_value),
         starts_at = coalesce($6::timestamptz, starts_at),
         ends_at = coalesce($7::timestamptz, ends_at),
         active = coalesce($8::boolean, active),
         image_url = CASE WHEN $9::text IS NULL THEN image_url ELSE nullif($9, '') END,
         audience_type = coalesce($10, audience_type),
         min_completed_bookings = coalesce($11::int, min_completed_bookings),
         badge = coalesce($12, badge),
         highlight_color = coalesce($13, highlight_color),
         updated_at = now()
       WHERE id = $14 AND hotel_id = $15
       RETURNING *`,
      [
        body.title,
        body.description,
        body.code,
        body.discountType,
        body.discountValue,
        body.startsAt,
        body.endsAt,
        body.active,
        body.imageUrl,
        body.audienceType,
        body.minCompletedBookings,
        body.badge,
        body.highlightColor,
        req.params.offerId,
        req.hotel.id,
      ],
    )
    if (!rows[0]) throw notFound('Offer not found')
    return { previousOffer: previousRows[0], offer: rows[0] }
  })
  const { previousOffer, offer } = result

  const previousMedia = collectOfferMedia(previousOffer)
  const nextMedia = collectOfferMedia(offer)
  await syncRemovedCloudinaryMedia(req.hotel.id, previousMedia, nextMedia)
  await recordMediaAssets(req.hotel.id, 'offer', offer.id, nextMedia, offer.title)

  res.json({ offer })
  recordActivity({
    req,
    action: 'offer_updated',
    entityType: 'offer',
    entityId: offer.id,
    metadata: { title: offer.title },
  })
})

adminRoutes.delete('/offers/:offerId', requireRole('hotel_admin', 'super_admin'), async (req, res) => {
  const { rows: offerRows } = await query('SELECT * FROM offers WHERE id = $1 AND hotel_id = $2', [req.params.offerId, req.hotel.id])
  if (!offerRows[0]) throw notFound('Offer not found')
  const { rowCount } = await query('DELETE FROM offers WHERE id = $1 AND hotel_id = $2', [req.params.offerId, req.hotel.id])
  if (!rowCount) throw notFound('Offer not found')
  await destroyCloudinaryMedia(req.hotel.id, collectOfferMedia(offerRows[0]))
  await query('DELETE FROM media_assets WHERE hotel_id = $1 AND entity_type = $2 AND entity_id = $3', [req.hotel.id, 'offer', req.params.offerId])
  res.status(204).send()
  recordActivity({
    req,
    action: 'offer_deleted',
    entityType: 'offer',
    entityId: req.params.offerId,
  })
})

async function recordMediaAssets(hotelId, entityType, entityId, items, fallbackAlt = '') {
  for (const item of items.filter((media) => media.publicId && media.url)) {
    await query(
      `INSERT INTO media_assets (hotel_id, entity_type, entity_id, cloudinary_public_id, secure_url, alt_text, metadata)
       SELECT $1, $2, $3, $4, $5, $6, $7::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM media_assets WHERE hotel_id = $1 AND cloudinary_public_id = $4
       )`,
      [
        hotelId,
        entityType,
        entityId,
        item.publicId,
        item.url,
        item.alt || fallbackAlt || null,
        JSON.stringify({ source: item.source }),
      ],
    )
  }
}

async function syncRemovedCloudinaryMedia(hotelId, previousItems, nextItems) {
  const nextPublicIds = new Set(nextItems.map((item) => item.publicId).filter(Boolean))
  const removed = previousItems.filter((item) => item.publicId && !nextPublicIds.has(item.publicId))
  await destroyCloudinaryMedia(hotelId, removed)
}

async function destroyCloudinaryMedia(hotelId, items) {
  for (const item of items.filter((media) => media.publicId)) {
    if (hotelId && await isCloudinaryPublicIdStillReferenced(hotelId, item.publicId)) continue
    await destroyCloudinaryPublicId(item.publicId)
    await query('DELETE FROM media_assets WHERE hotel_id = $1 AND cloudinary_public_id = $2', [hotelId, item.publicId])
  }
}

async function destroyCloudinaryPublicId(publicId) {
  if (!publicId || !env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) return
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true })
  } catch (error) {
    console.warn(`Cloudinary cleanup failed for ${publicId}: ${error.message}`)
  }
}

function collectRoomMedia(roomOrPayload = {}) {
  const items = []
  addMediaItem(items, roomOrPayload.hero_image_url || roomOrPayload.heroImageUrl, 'roomHero')
  for (const item of normalizeMediaList(roomOrPayload.gallery)) {
    addMediaItem(items, item, 'roomGallery')
  }
  return uniqueMediaItems(items)
}

function collectOfferMedia(offerOrPayload = {}) {
  const items = []
  addMediaItem(items, offerOrPayload.image_url || offerOrPayload.imageUrl, 'offerImage')
  return uniqueMediaItems(items)
}

function collectHotelMedia(hotelOrPayload = {}) {
  const branding = hotelOrPayload.branding || {}
  const items = []
  addMediaItem(items, hotelOrPayload.hero_image_url || hotelOrPayload.heroImageUrl, 'hotelHero')
  addMediaItem(items, branding.logoUrl, 'logo')
  addMediaItem(items, branding.showcaseImageUrl, 'showcaseImage')
  addMediaItem(items, branding.diningImageUrl, 'diningImage')
  for (const item of normalizeMediaList(branding.heroImages)) addMediaItem(items, item, 'heroImages')
  for (const item of normalizeMediaList(branding.showcaseImages)) addMediaItem(items, item, 'showcaseImages')
  for (const item of normalizeMediaList(branding.gallery)) addMediaItem(items, item, 'gallery')
  return uniqueMediaItems(items)
}

async function isCloudinaryPublicIdStillReferenced(hotelId, publicId) {
  const [{ rows: hotelRows }, { rows: roomRows }, { rows: offerRows }] = await Promise.all([
    query('SELECT hero_image_url, branding FROM hotels WHERE id = $1', [hotelId]),
    query('SELECT hero_image_url, gallery FROM room_types WHERE hotel_id = $1', [hotelId]),
    query('SELECT image_url FROM offers WHERE hotel_id = $1', [hotelId]),
  ])
  const references = [
    ...hotelRows.flatMap((hotel) => collectHotelMedia(hotel)),
    ...roomRows.flatMap((room) => collectRoomMedia(room)),
    ...offerRows.flatMap((offer) => collectOfferMedia(offer)),
  ]
  return references.some((item) => item.publicId === publicId)
}

function normalizeMediaList(value) {
  if (!Array.isArray(value)) return []
  return value
}

function addMediaItem(items, value, source) {
  if (!value) return
  const url = typeof value === 'string' ? value : value.url || value.secureUrl
  if (!url) return
  const publicId = typeof value === 'string' ? extractCloudinaryPublicId(value) : value.publicId || value.cloudinaryPublicId || extractCloudinaryPublicId(url)
  items.push({ url, publicId, alt: typeof value === 'string' ? '' : value.alt || value.altText || '', source })
}

function uniqueMediaItems(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = item.publicId || item.url
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractCloudinaryPublicId(url) {
  const raw = String(url || '')
  const marker = '/upload/'
  const markerIndex = raw.indexOf(marker)
  if (markerIndex < 0) return ''
  const afterUpload = raw.slice(markerIndex + marker.length).split(/[?#]/)[0]
  const withoutTransforms = afterUpload.replace(/^((?:[a-z]_|ar_|bo_|co_|dpr_|e_|fl_|l_|r_|t_|u_)[^/]+\/)+/, '')
  const withoutVersion = withoutTransforms.replace(/^v\d+\//, '')
  return withoutVersion.replace(/\.[a-z0-9]+$/i, '')
}
