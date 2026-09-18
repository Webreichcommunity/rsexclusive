import { v2 as cloudinary } from 'cloudinary'
import { z } from 'zod'
import { env } from '../config/env.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { query, transaction } from '../db/pool.js'
import { createOrUpdateFirebaseUser, deleteFirebaseUser } from '../services/firebaseAdminService.js'
import { listActivities, recordActivity } from '../services/activityService.js'
import { createAsyncRouter } from '../utils/asyncRouter.js'
import { conflict, notFound } from '../utils/errors.js'

export const superAdminRoutes = createAsyncRouter()
const HOTEL_LIMIT = 3

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
})

const hotelSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  subdomain: z.string().min(2).regex(/^[a-z0-9-]+$/),
  description: z.string().min(10),
  legalName: z.string().optional(),
  customDomain: z.string().nullable().optional(),
  address: z.record(z.any()).default({}),
  contact: z.record(z.any()).default({}),
  policies: z.record(z.any()).default({}),
  amenities: z.array(z.string()).default([]),
  branding: z.record(z.any()).default({}),
  heroImageUrl: z.string().url().or(z.literal('')).nullable().optional(),
  taxRate: z.coerce.number().min(0).max(30).default(12),
  currency: z.string().length(3).default('INR'),
  admin: z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
      fullName: z.string().min(2),
      phone: z.string().optional(),
      permissions: z.array(z.string()).default(['bookings', 'rooms', 'payments']),
    })
    .optional(),
})

const platformUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  role: z.enum(['customer', 'hotel_admin', 'super_admin']).default('customer'),
})

const hotelAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  hotelIds: z.array(z.string().uuid()).min(1).optional(),
  permissions: z.array(z.string()).default(['bookings', 'rooms', 'payments']),
})

const hotelUpdateSchema = hotelSchema.partial().omit({ admin: true })

const mediaSignatureSchema = z.object({
  folder: z.string().min(2).max(80).default('hotel-assets'),
})

superAdminRoutes.use(authenticate, requireRole('super_admin'))

superAdminRoutes.get('/overview', async (_req, res) => {
  const { rows } = await query(
    `WITH booking_metrics AS (
       SELECT
         hotel_id,
         count(*)::int AS bookings,
         coalesce(sum(total_amount) FILTER (WHERE status = 'confirmed'), 0)::numeric AS revenue
       FROM bookings
       GROUP BY hotel_id
     ),
     customer_metrics AS (
       SELECT hotel_id, count(*)::int AS customers
       FROM customers
       GROUP BY hotel_id
     ),
     admin_metrics AS (
       SELECT
         ha.hotel_id,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', u.id,
               'email', u.email,
               'fullName', u.full_name,
               'phone', u.phone,
               'permissions', ha.permissions
             )
             ORDER BY u.full_name NULLS LAST, u.email
           ) FILTER (WHERE u.id IS NOT NULL),
           '[]'::jsonb
         ) AS admins
       FROM hotel_admins ha
       JOIN users u ON u.id = ha.user_id
       GROUP BY ha.hotel_id
     )
     SELECT
       h.id, h.name, h.slug, h.subdomain, h.custom_domain, h.status, h.address, h.contact, h.branding, h.hero_image_url, h.created_at,
       coalesce(bm.bookings, 0)::int AS bookings,
       coalesce(cm.customers, 0)::int AS customers,
       coalesce(bm.revenue, 0)::numeric AS revenue,
       coalesce(am.admins, '[]'::jsonb) AS admins
     FROM hotels h
     LEFT JOIN booking_metrics bm ON bm.hotel_id = h.id
     LEFT JOIN customer_metrics cm ON cm.hotel_id = h.id
     LEFT JOIN admin_metrics am ON am.hotel_id = h.id
     ORDER BY h.created_at DESC`,
  )
  res.json({ hotels: rows })
})

superAdminRoutes.get('/activities', async (req, res) => {
  res.json({ activities: listActivities({ hotelId: req.query.hotelId, limit: req.query.limit || 300 }) })
})

superAdminRoutes.get('/hotels/:hotelId', async (req, res) => {
  const { rows } = await query(
    `SELECT
       h.*,
       coalesce(bm.bookings, 0)::int AS bookings,
       coalesce(cm.customers, 0)::int AS customers,
       coalesce(bm.revenue, 0)::numeric AS revenue,
       coalesce(am.admins, '[]'::jsonb) AS admins
     FROM hotels h
     LEFT JOIN LATERAL (
       SELECT
         count(*)::int AS bookings,
         coalesce(sum(total_amount) FILTER (WHERE status = 'confirmed'), 0)::numeric AS revenue
       FROM bookings
       WHERE hotel_id = h.id
     ) bm ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS customers
       FROM customers
       WHERE hotel_id = h.id
     ) cm ON true
     LEFT JOIN LATERAL (
       SELECT coalesce(
         jsonb_agg(
           jsonb_build_object(
             'id', u.id,
             'email', u.email,
             'fullName', u.full_name,
             'phone', u.phone,
             'permissions', ha.permissions
           )
           ORDER BY u.full_name NULLS LAST, u.email
         ) FILTER (WHERE u.id IS NOT NULL),
         '[]'::jsonb
       ) AS admins
       FROM hotel_admins ha
       JOIN users u ON u.id = ha.user_id
       WHERE ha.hotel_id = h.id
     ) am ON true
     WHERE h.id = $1`,
    [req.params.hotelId],
  )
  if (!rows[0]) throw notFound('Hotel not found')

  const [{ rows: roomRows }, { rows: bookingRows }, { rows: paymentRows }] = await Promise.all([
    query('SELECT id, name, slug, base_price, active FROM room_types WHERE hotel_id = $1 ORDER BY created_at DESC LIMIT 20', [req.params.hotelId]),
    query(
      `SELECT b.booking_reference, b.guest_name, b.guest_email, b.status, b.check_in, b.check_out, b.total_amount, rt.name AS room_type_name
       FROM bookings b
       JOIN room_types rt ON rt.id = b.room_type_id
       WHERE b.hotel_id = $1
       ORDER BY b.created_at DESC
       LIMIT 20`,
      [req.params.hotelId],
    ),
    query(
      `SELECT status, count(*)::int AS count, coalesce(sum(amount), 0)::numeric AS amount
       FROM payments
       WHERE hotel_id = $1
       GROUP BY status`,
      [req.params.hotelId],
    ),
  ])

  res.json({ hotel: rows[0], rooms: roomRows, bookings: bookingRows, payments: paymentRows })
})

superAdminRoutes.get('/users', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, email, full_name, phone, role, disabled_at, created_at
     FROM users
     ORDER BY created_at DESC
     LIMIT 200`,
  )
  res.json({ users: rows })
})

superAdminRoutes.post('/users', validate(platformUserSchema), async (req, res) => {
  const firebaseUser = await createOrUpdateFirebaseUser(req.body)
  const { rows } = await query(
    `INSERT INTO users (firebase_uid, email, full_name, phone, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (firebase_uid) DO UPDATE SET
       email = EXCLUDED.email,
       full_name = EXCLUDED.full_name,
       phone = EXCLUDED.phone,
       role = EXCLUDED.role,
       disabled_at = null,
       updated_at = now()
     RETURNING id, email, full_name, phone, role`,
    [firebaseUser.uid, req.body.email, req.body.fullName, req.body.phone || null, req.body.role],
  )
  res.status(201).json({ user: rows[0] })
})

superAdminRoutes.post('/hotels', validate(hotelSchema), async (req, res) => {
  const body = req.body
  const { rows: limitRows } = await query('SELECT count(*)::int AS count FROM hotels')
  if (Number(limitRows[0]?.count || 0) >= HOTEL_LIMIT) {
    throw conflict('Your plan includes 3 hotels. Contact WebReich to add another hotel.', 'hotel_limit_reached')
  }
  const firebaseAdminUser = body.admin ? await createOrUpdateFirebaseUser(body.admin) : null

  const result = await transaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO hotels (
        name, slug, legal_name, subdomain, custom_domain, description, address, contact,
        policies, amenities, branding, hero_image_url, tax_rate, currency
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [
        body.name,
        body.slug,
        body.legalName || null,
        body.subdomain,
        body.customDomain || null,
        body.description,
        body.address,
        body.contact,
        body.policies,
        body.amenities,
        body.branding,
        body.heroImageUrl || null,
        body.taxRate,
        body.currency,
      ],
    )
    const hotel = rows[0]
    let adminUser = null

    if (body.admin) {
      const { rows: userRows } = await db.query(
        `INSERT INTO users (firebase_uid, email, full_name, phone, role, default_hotel_id)
         VALUES ($1, $2, $3, $4, 'hotel_admin', $5)
         ON CONFLICT (firebase_uid) DO UPDATE SET
           email = EXCLUDED.email,
           full_name = EXCLUDED.full_name,
           phone = EXCLUDED.phone,
           role = 'hotel_admin',
           default_hotel_id = EXCLUDED.default_hotel_id,
           disabled_at = null,
           updated_at = now()
         RETURNING id, email, full_name, phone, role`,
        [firebaseAdminUser.uid, body.admin.email, body.admin.fullName, body.admin.phone || null, hotel.id],
      )
      adminUser = userRows[0]
      await db.query(
        `INSERT INTO hotel_admins (hotel_id, user_id, permissions)
         VALUES ($1, $2, $3)
         ON CONFLICT (hotel_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions`,
        [hotel.id, adminUser.id, body.admin.permissions],
      )
    }

    await recordHotelMedia(db, hotel, body)

    return { hotel, admin: adminUser }
  })

  recordActivity({
    req,
    action: 'hotel_created',
    entityType: 'hotel',
    entityId: result.hotel.id,
    hotel: result.hotel,
    metadata: { name: result.hotel.name },
  })

  res.status(201).json(result)
})

superAdminRoutes.patch('/hotels/:hotelId', validate(hotelUpdateSchema), async (req, res) => {
  const body = req.body
  const { rows: previousRows } = await query('SELECT * FROM hotels WHERE id = $1', [req.params.hotelId])
  if (!previousRows[0]) throw notFound('Hotel not found')
  const { rows } = await query(
    `UPDATE hotels SET
      name = coalesce($1, name),
      slug = coalesce($2, slug),
      legal_name = coalesce($3, legal_name),
      subdomain = coalesce($4, subdomain),
      custom_domain = coalesce($5, custom_domain),
      description = coalesce($6, description),
      address = coalesce($7::jsonb, address),
      contact = coalesce($8::jsonb, contact),
      policies = coalesce($9::jsonb, policies),
      amenities = coalesce($10::text[], amenities),
      branding = coalesce($11::jsonb, branding),
      hero_image_url = CASE WHEN $12::text IS NULL THEN hero_image_url ELSE nullif($12, '') END,
      tax_rate = coalesce($13::numeric, tax_rate),
      currency = coalesce($14::char(3), currency),
      updated_at = now()
     WHERE id = $15
     RETURNING *`,
    [
      body.name,
      body.slug,
      body.legalName,
      body.subdomain,
      body.customDomain,
      body.description,
      body.address,
      body.contact,
      body.policies,
      body.amenities,
      body.branding,
      body.heroImageUrl,
      body.taxRate,
      body.currency,
      req.params.hotelId,
    ],
  )
  if (!rows[0]) throw notFound('Hotel not found')
  await syncRemovedHotelMedia(previousRows[0], rows[0])
  await recordHotelMedia({ query }, rows[0], body)
  recordActivity({
    req,
    action: 'hotel_updated',
    entityType: 'hotel',
    entityId: rows[0].id,
    hotel: rows[0],
    metadata: { name: rows[0].name },
  })
  res.json({ hotel: rows[0] })
})

superAdminRoutes.post('/media/signature', validate(mediaSignatureSchema), async (req, res) => {
  const timestamp = Math.round(Date.now() / 1000)
  const folder = `rs-exclusive/platform/${req.body.folder}`
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, env.cloudinary.apiSecret || 'dev')
  res.json({
    cloudName: env.cloudinary.cloudName,
    apiKey: env.cloudinary.apiKey,
    timestamp,
    folder,
    signature,
  })
})

superAdminRoutes.patch('/hotels/:hotelId/status', validate(z.object({ status: z.enum(['active', 'inactive']) })), async (req, res) => {
  const { rows } = await query(
    `UPDATE hotels SET status = $1 WHERE id = $2 RETURNING *`,
    [req.body.status, req.params.hotelId],
  )
  if (!rows[0]) throw notFound('Hotel not found')
  recordActivity({
    req,
    action: req.body.status === 'inactive' ? 'hotel_suspended' : 'hotel_activated',
    entityType: 'hotel',
    entityId: rows[0].id,
    hotel: rows[0],
    metadata: { status: req.body.status },
  })
  res.json({ hotel: rows[0] })
})

superAdminRoutes.delete('/hotels/:hotelId', async (req, res) => {
  const purge = await transaction(async (db) => {
    const { rows: hotelRows } = await db.query('SELECT * FROM hotels WHERE id = $1 FOR UPDATE', [req.params.hotelId])
    if (!hotelRows[0]) throw notFound('Hotel not found')

    const mediaItems = await collectHotelPurgeMedia(db, req.params.hotelId, hotelRows[0])
    const deletableUsers = await collectHotelScopedUsers(db, req.params.hotelId)
    const userIds = deletableUsers.map((user) => user.id)

    await db.query('DELETE FROM payments WHERE hotel_id = $1', [req.params.hotelId])
    await db.query('DELETE FROM invoices WHERE hotel_id = $1', [req.params.hotelId])
    await db.query('DELETE FROM bookings WHERE hotel_id = $1', [req.params.hotelId])
    if (userIds.length) {
      await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds])
    }
    const { rowCount } = await db.query('DELETE FROM hotels WHERE id = $1', [req.params.hotelId])
    if (!rowCount) throw notFound('Hotel not found')

    return { hotel: hotelRows[0], mediaItems, users: deletableUsers }
  })

  for (const item of purge.mediaItems) {
    await destroyCloudinaryPublicId(item.publicId)
  }
  for (const user of purge.users) {
    await deleteFirebaseUser(user.firebase_uid)
  }

  recordActivity({
    req,
    action: 'hotel_deleted',
    entityType: 'hotel',
    entityId: req.params.hotelId,
    hotel: purge.hotel,
    metadata: {
      name: purge.hotel.name,
      deletedUsers: purge.users.length,
    },
  })
  res.status(204).send()
})

superAdminRoutes.post('/hotels/:hotelId/media/signature', validate(mediaSignatureSchema), async (req, res) => {
  const { rows } = await query('SELECT slug FROM hotels WHERE id = $1', [req.params.hotelId])
  if (!rows[0]) throw notFound('Hotel not found')

  const timestamp = Math.round(Date.now() / 1000)
  const folder = `rs-exclusive/${rows[0].slug}/${req.body.folder}`
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, env.cloudinary.apiSecret || 'dev')
  res.json({
    cloudName: env.cloudinary.cloudName,
    apiKey: env.cloudinary.apiKey,
    timestamp,
    folder,
    signature,
  })
})

superAdminRoutes.post('/admins', validate(hotelAdminSchema), async (req, res) => {
  const firebaseUser = await createOrUpdateFirebaseUser(req.body)
  const hotelIds = req.body.hotelIds || []
  const result = await transaction(async (db) => {
    const { rows: userRows } = await db.query(
      `INSERT INTO users (firebase_uid, email, full_name, phone, role, default_hotel_id)
       VALUES ($1, $2, $3, $4, 'hotel_admin', $5)
       ON CONFLICT (firebase_uid) DO UPDATE SET
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         role = 'hotel_admin',
         default_hotel_id = EXCLUDED.default_hotel_id,
         disabled_at = null,
         updated_at = now()
       RETURNING id, email, full_name, phone, role`,
      [firebaseUser.uid, req.body.email, req.body.fullName, req.body.phone || null, hotelIds[0] || null],
    )
    const adminUser = userRows[0]
    for (const hotelId of hotelIds) {
      await db.query(
        `INSERT INTO hotel_admins (hotel_id, user_id, permissions)
         VALUES ($1, $2, $3)
         ON CONFLICT (hotel_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions`,
        [hotelId, adminUser.id, req.body.permissions],
      )
    }
    return adminUser
  })
  res.status(201).json({ admin: result })
})

superAdminRoutes.post('/hotels/:hotelId/admins', validate(hotelAdminSchema), async (req, res) => {
  const { rows: hotelRows } = await query('SELECT id FROM hotels WHERE id = $1', [req.params.hotelId])
  if (!hotelRows[0]) throw notFound('Hotel not found')

  const firebaseUser = await createOrUpdateFirebaseUser(req.body)
  const result = await transaction(async (db) => {
    const { rows: userRows } = await db.query(
      `INSERT INTO users (firebase_uid, email, full_name, phone, role, default_hotel_id)
       VALUES ($1, $2, $3, $4, 'hotel_admin', $5)
       ON CONFLICT (firebase_uid) DO UPDATE SET
         email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         role = 'hotel_admin',
         default_hotel_id = EXCLUDED.default_hotel_id,
         disabled_at = null,
         updated_at = now()
       RETURNING id, email, full_name, phone, role`,
      [firebaseUser.uid, req.body.email, req.body.fullName, req.body.phone || null, req.params.hotelId],
    )
    const adminUser = userRows[0]
    await db.query(
      `INSERT INTO hotel_admins (hotel_id, user_id, permissions)
       VALUES ($1, $2, $3)
       ON CONFLICT (hotel_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions`,
      [req.params.hotelId, adminUser.id, req.body.permissions],
    )
    return adminUser
  })

  res.status(201).json({ admin: result })
})

superAdminRoutes.delete('/hotels/:hotelId/admins/:userId', async (req, res) => {
  const { rowCount } = await query('DELETE FROM hotel_admins WHERE hotel_id = $1 AND user_id = $2', [
    req.params.hotelId,
    req.params.userId,
  ])
  if (!rowCount) throw conflict('This admin is not assigned to the selected hotel.', 'admin_not_assigned')
  res.status(204).send()
})

superAdminRoutes.delete('/admins/:userId', async (req, res) => {
  const { rows } = await query('SELECT firebase_uid, role FROM users WHERE id = $1', [req.params.userId])
  if (!rows[0]) throw notFound('User not found')
  if (rows[0].role === 'super_admin') throw conflict('Super admin users cannot be deleted from this action.', 'protected_super_admin')

  await transaction(async (db) => {
    await db.query('DELETE FROM hotel_admins WHERE user_id = $1', [req.params.userId])
    await db.query('DELETE FROM users WHERE id = $1', [req.params.userId])
  })
  await deleteFirebaseUser(rows[0].firebase_uid)
  res.status(204).send()
})

superAdminRoutes.get('/payments', async (_req, res) => {
  const { rows } = await query(
    `SELECT p.*, h.name AS hotel_name, b.booking_reference, b.guest_name
     FROM payments p
     JOIN hotels h ON h.id = p.hotel_id
     JOIN bookings b ON b.id = p.booking_id
     ORDER BY p.created_at DESC
     LIMIT 200`,
  )
  res.json({ payments: rows })
})

async function collectHotelPurgeMedia(db, hotelId, hotel) {
  const { rows: roomRows } = await db.query('SELECT hero_image_url, gallery FROM room_types WHERE hotel_id = $1', [hotelId])
  const { rows: offerRows } = await db.query('SELECT image_url FROM offers WHERE hotel_id = $1', [hotelId])
  const { rows: assetRows } = await db.query('SELECT cloudinary_public_id, secure_url, alt_text FROM media_assets WHERE hotel_id = $1', [hotelId])
  const items = [
    ...collectMediaItems(hotel),
    ...roomRows.flatMap((room) => collectRoomMedia(room)),
    ...offerRows.flatMap((offer) => collectOfferMedia(offer)),
    ...assetRows.map((asset) => ({
      url: asset.secure_url,
      publicId: asset.cloudinary_public_id,
      alt: asset.alt_text || '',
      source: 'mediaAsset',
    })),
  ]
  const seen = new Set()
  return items.filter((item) => {
    if (!item.publicId || seen.has(item.publicId)) return false
    seen.add(item.publicId)
    return true
  })
}

async function collectHotelScopedUsers(db, hotelId) {
  const { rows } = await db.query(
    `WITH hotel_related_users AS (
       SELECT user_id FROM hotel_admins WHERE hotel_id = $1
       UNION
       SELECT user_id FROM customers WHERE hotel_id = $1
       UNION
       SELECT user_id FROM bookings WHERE hotel_id = $1 AND user_id IS NOT NULL
       UNION
       SELECT user_id FROM hotel_feedback WHERE hotel_id = $1 AND user_id IS NOT NULL
       UNION
       SELECT user_id FROM loyalty_accounts WHERE hotel_id = $1
     )
     SELECT u.id, u.firebase_uid
     FROM users u
     WHERE u.role <> 'super_admin'
       AND u.firebase_uid IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM hotel_related_users hru WHERE hru.user_id = u.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM hotel_admins ha WHERE ha.user_id = u.id AND ha.hotel_id <> $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM customers c WHERE c.user_id = u.id AND c.hotel_id <> $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM bookings b WHERE b.user_id = u.id AND b.hotel_id <> $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM hotel_feedback hf WHERE hf.user_id = u.id AND hf.hotel_id <> $1
       )
       AND NOT EXISTS (
         SELECT 1
         FROM loyalty_accounts la
         WHERE la.user_id = u.id
           AND (la.hotel_id IS NULL OR la.hotel_id <> $1)
       )`,
    [hotelId],
  )
  return rows
}

async function recordHotelMedia(db, hotel, body = {}) {
  const items = collectMediaItems({
    heroImageUrl: body.heroImageUrl,
    branding: body.branding || {},
  }).filter((item) => item.publicId && item.url)

  for (const item of items) {
    await db.query(
      `INSERT INTO media_assets (hotel_id, entity_type, cloudinary_public_id, secure_url, alt_text, metadata)
       SELECT $1, 'hotel', $2, $3, $4, $5::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM media_assets WHERE hotel_id = $1 AND cloudinary_public_id = $2
       )`,
      [hotel.id, item.publicId, item.url, item.alt || hotel.name, JSON.stringify({ source: item.source })],
    )
  }
}

async function syncRemovedHotelMedia(previousHotel, nextHotel) {
  const previous = collectMediaItems(previousHotel)
  const nextPublicIds = new Set(collectMediaItems(nextHotel).map((item) => item.publicId).filter(Boolean))
  const removed = previous.filter((item) => item.publicId && !nextPublicIds.has(item.publicId))
  for (const item of removed) {
    if (await isCloudinaryPublicIdStillReferenced(previousHotel.id, item.publicId)) continue
    await destroyCloudinaryPublicId(item.publicId)
    await query('DELETE FROM media_assets WHERE hotel_id = $1 AND cloudinary_public_id = $2', [previousHotel.id, item.publicId])
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

function collectMediaItems(hotelOrPayload = {}) {
  const branding = hotelOrPayload.branding || {}
  const items = []
  addMediaItem(items, hotelOrPayload.hero_image_url || hotelOrPayload.heroImageUrl, 'heroImageUrl')
  addMediaItem(items, branding.logoUrl, 'logoUrl')
  addMediaItem(items, branding.showcaseImageUrl, 'showcaseImageUrl')
  addMediaItem(items, branding.diningImageUrl, 'diningImageUrl')
  for (const item of normalizeMediaList(branding.heroImages)) addMediaItem(items, item, 'heroImages')
  for (const item of normalizeMediaList(branding.showcaseImages)) addMediaItem(items, item, 'showcaseImages')
  for (const item of normalizeMediaList(branding.gallery)) addMediaItem(items, item, 'gallery')
  return items
}

function collectRoomMedia(roomOrPayload = {}) {
  const items = []
  addMediaItem(items, roomOrPayload.hero_image_url || roomOrPayload.heroImageUrl, 'roomHero')
  for (const item of normalizeMediaList(roomOrPayload.gallery)) addMediaItem(items, item, 'roomGallery')
  return items
}

function collectOfferMedia(offerOrPayload = {}) {
  const items = []
  addMediaItem(items, offerOrPayload.image_url || offerOrPayload.imageUrl, 'offerImage')
  return items
}

async function isCloudinaryPublicIdStillReferenced(hotelId, publicId) {
  const [{ rows: hotelRows }, { rows: roomRows }, { rows: offerRows }] = await Promise.all([
    query('SELECT hero_image_url, branding FROM hotels WHERE id = $1', [hotelId]),
    query('SELECT hero_image_url, gallery FROM room_types WHERE hotel_id = $1', [hotelId]),
    query('SELECT image_url FROM offers WHERE hotel_id = $1', [hotelId]),
  ])
  const references = [
    ...hotelRows.flatMap((hotel) => collectMediaItems(hotel)),
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
  items.push({ url, publicId, alt: value.alt || '', source })
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
