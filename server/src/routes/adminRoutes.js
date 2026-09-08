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
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
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
    price: z.coerce.number().nonnegative().default(0),
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

const amenitySchema = z.object({
  name: z.string().min(2),
  description: z.string().max(300).optional(),
  price: z.coerce.number().nonnegative().default(0),
  icon: z.string().max(500).optional(),
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
     WHERE hotel_id = $1 AND check_in >= current_date
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

adminRoutes.get('/bookings', async (req, res) => {
  const { rows } = await query(
    `SELECT b.*, rt.name AS room_type_name
     FROM bookings b
     JOIN room_types rt ON rt.id = b.room_type_id
     WHERE b.hotel_id = $1
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
    const taxAmount = Math.round(((subtotal * Number(req.hotel.tax_rate || 0)) / 100 + Number.EPSILON) * 100) / 100
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
  const roomNumberPrefix =
    (body.roomNumberPrefix || body.slug)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 12) || 'ROOM'

  const room = await transaction(async (db) => {
    await assertHomepageRoomLimit(db, req.hotel.id, null, body.showOnHomepage)
    const { rows } = await db.query(
      `INSERT INTO room_types (
        hotel_id, name, slug, description, occupancy_adults, occupancy_children,
        base_price, offer_price, size_sqft, bed_type, amenities, amenity_items, hero_image_url, gallery, show_on_homepage
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        req.hotel.id,
        body.name,
        body.slug,
        body.description,
        body.occupancyAdults,
        body.occupancyChildren,
        body.basePrice,
        body.offerPrice || null,
        body.sizeSqft || null,
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
      [req.hotel.id, roomType.id, roomNumberPrefix, body.physicalRooms],
    )

    await db.query(
      `INSERT INTO room_inventory (hotel_id, room_type_id, stay_date, total_rooms, price)
       SELECT $1, $2, d::date, $3, $4
       FROM generate_series(current_date, current_date + ($5::int - 1), interval '1 day') d
       ON CONFLICT (hotel_id, room_type_id, stay_date) DO UPDATE SET
         total_rooms = EXCLUDED.total_rooms,
         price = EXCLUDED.price,
         updated_at = now()`,
      [req.hotel.id, roomType.id, body.physicalRooms, body.offerPrice || body.basePrice, body.inventoryDays],
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
      'SELECT * FROM room_types WHERE id = $1 AND hotel_id = $2 FOR UPDATE',
      [req.params.roomTypeId, req.hotel.id],
    )
    if (!previousRows[0]) throw notFound('Room category not found')
    const { rows } = await db.query(
      `UPDATE room_types SET
         name = coalesce($1, name),
         slug = coalesce($2, slug),
         description = coalesce($3, description),
         occupancy_adults = coalesce($4::int, occupancy_adults),
         occupancy_children = coalesce($5::int, occupancy_children),
         base_price = coalesce($6::numeric, base_price),
         offer_price = coalesce($7::numeric, offer_price),
         size_sqft = coalesce($8::int, size_sqft),
         bed_type = coalesce($9, bed_type),
         amenities = coalesce($10::text[], amenities),
         amenity_items = coalesce($11::jsonb, amenity_items),
         hero_image_url = CASE WHEN $12::text IS NULL THEN hero_image_url ELSE nullif($12, '') END,
         gallery = coalesce($13::jsonb, gallery),
         show_on_homepage = coalesce($14::boolean, show_on_homepage),
         active = coalesce($15::boolean, active),
         updated_at = now()
       WHERE id = $16 AND hotel_id = $17
       RETURNING *`,
      [
        body.name,
        body.slug,
        body.description,
        body.occupancyAdults,
        body.occupancyChildren,
        body.basePrice,
        body.offerPrice ?? null,
        body.sizeSqft,
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
  const { rowCount } = await query(
    `UPDATE room_types SET active = false, show_on_homepage = false, updated_at = now()
     WHERE id = $1 AND hotel_id = $2`,
    [req.params.roomTypeId, req.hotel.id],
  )
  if (!rowCount) throw notFound('Room category not found')
  res.status(204).send()
  recordActivity({
    req,
    action: 'room_hidden',
    entityType: 'room_type',
    entityId: req.params.roomTypeId,
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
  if (endDate < startDate) {
    res.status(400).json({ error: { code: 'invalid_date_range', message: 'End date must be after start date' } })
    return
  }

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
