import { query } from '../db/pool.js'
import { notFound } from '../utils/errors.js'

let offerKindColumnPromise = null
let roomSortOrderColumnPromise = null

export async function ensureOfferKindColumn(db = { query }) {
  offerKindColumnPromise = offerKindColumnPromise || (async () => {
    await db.query(`
      ALTER TABLE offers
        ADD COLUMN IF NOT EXISTS offer_kind text NOT NULL DEFAULT 'applied'
          CHECK (offer_kind IN ('applied', 'showcase'))
    `)
    await db.query(`
      ALTER TABLE offers
        ADD COLUMN IF NOT EXISTS redemption_limit_per_user int NOT NULL DEFAULT 1
          CHECK (redemption_limit_per_user >= 0)
    `)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_offers_hotel_kind_active
        ON offers(hotel_id, offer_kind, active, starts_at, ends_at)
    `)
  })().catch((error) => {
    offerKindColumnPromise = null
    throw error
  })

  return offerKindColumnPromise
}

export async function ensureRoomSortOrderColumn(db = { query }) {
  roomSortOrderColumnPromise = roomSortOrderColumnPromise || (async () => {
    await db.query(`
      ALTER TABLE room_types
        ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 1000
    `)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_room_types_hotel_sort_order
        ON room_types(hotel_id, active, sort_order, created_at DESC)
    `)
  })().catch((error) => {
    roomSortOrderColumnPromise = null
    throw error
  })

  return roomSortOrderColumnPromise
}

export async function listActiveHotels() {
  const { rows } = await query(
    `SELECT id, slug, name, subdomain, description, address, contact, amenities, branding, hero_image_url,
            CASE
              WHEN branding->>'displayOrder' ~ '^[0-9]+$' THEN (branding->>'displayOrder')::int
              ELSE 999
            END AS display_order,
            (
              SELECT jsonb_agg(jsonb_build_object('title', o.title, 'description', o.description, 'code', o.code, 'badge', o.badge) ORDER BY o.created_at DESC)
              FROM offers o
              WHERE o.hotel_id = hotels.id
                AND o.active = true
                AND o.audience_type = 'general'
                AND now() BETWEEN o.starts_at AND o.ends_at
            ) AS offers,
            (
              SELECT jsonb_agg(room_media.item ORDER BY room_media.created_at DESC, room_media.sort_order ASC)
              FROM (
                SELECT
                  rt.created_at,
                  0 AS sort_order,
                  jsonb_build_object('url', rt.hero_image_url, 'alt', rt.name) AS item
                FROM room_types rt
                WHERE rt.hotel_id = hotels.id
                  AND rt.active = true
                  AND rt.hero_image_url IS NOT NULL
                UNION ALL
                SELECT
                  rt.created_at,
                  gallery_item.ordinality AS sort_order,
                  CASE
                    WHEN jsonb_typeof(gallery_item.value) = 'string' THEN jsonb_build_object('url', gallery_item.value #>> '{}', 'alt', rt.name)
                    ELSE gallery_item.value
                  END AS item
                FROM room_types rt
                CROSS JOIN LATERAL jsonb_array_elements(rt.gallery) WITH ORDINALITY AS gallery_item(value, ordinality)
                WHERE rt.hotel_id = hotels.id
                  AND rt.active = true
              ) room_media
              WHERE room_media.item->>'url' IS NOT NULL
            ) AS room_preview_images
     FROM hotels
     WHERE status = 'active'
     ORDER BY display_order ASC, created_at ASC`,
  )
  return rows
}

export async function getHotelProfile(hotelId) {
  const { rows } = await query(
    `SELECT id, slug, name, subdomain, description, address, contact, policies, amenities,
            branding, hero_image_url, timezone, currency, tax_rate
     FROM hotels
     WHERE id = $1`,
    [hotelId],
  )
  if (!rows[0]) throw notFound('Hotel not found')
  return rows[0]
}

export async function listAmenitiesForHotel(hotelId, { activeOnly = true } = {}) {
  const { rows } = await query(
    `SELECT id, name, description, price, icon, active, created_at
     FROM hotel_amenities
     WHERE hotel_id = $1
       AND ($2::boolean = false OR active = true)
     ORDER BY active DESC, name ASC`,
    [hotelId, activeOnly],
  )
  return rows
}

export async function listOffersForHotel(hotelId, userId = null, { activeOnly = true } = {}) {
  await ensureOfferKindColumn()
  const { rows } = await query(
    `WITH user_metrics AS (
       SELECT count(*) FILTER (WHERE status IN ('confirmed', 'completed'))::int AS qualified_bookings
       FROM bookings
       WHERE hotel_id = $1 AND user_id = $2
     )
     SELECT o.*, coalesce(ou.used_count, 0)::int AS current_user_redemptions
     FROM offers o
     CROSS JOIN user_metrics um
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS used_count
       FROM bookings b
       WHERE $2::uuid IS NOT NULL
         AND b.user_id = $2
         AND (
           b.status IN ('confirmed', 'completed')
           OR (b.status = 'payment_pending' AND b.hold_expires_at > now())
         )
         AND b.metadata->'offer'->>'id' = o.id::text
     ) ou ON true
     WHERE o.hotel_id = $1
       AND ($3::boolean = false OR (o.active = true AND now() BETWEEN o.starts_at AND o.ends_at))
       AND (
         o.audience_type = 'general'
         OR ($2::uuid IS NOT NULL AND o.audience_type = 'repeat_guest' AND um.qualified_bookings >= o.min_completed_bookings)
       )
       AND (
         $2::uuid IS NULL
         OR coalesce(o.redemption_limit_per_user, 0) = 0
         OR coalesce(ou.used_count, 0) < o.redemption_limit_per_user
       )
     ORDER BY CASE WHEN o.offer_kind = 'showcase' THEN 0 ELSE 1 END, o.audience_type DESC, o.created_at DESC`,
    [hotelId, userId, activeOnly],
  )
  return rows
}

export async function listFaqsForHotel(hotelId, { activeOnly = true } = {}) {
  try {
    const { rows } = await query(
      `SELECT id, question, answer, sort_order, active, created_at
       FROM hotel_faqs
       WHERE hotel_id = $1
         AND ($2::boolean = false OR active = true)
       ORDER BY sort_order ASC, created_at DESC`,
      [hotelId, activeOnly],
    )
    return rows
  } catch (error) {
    if (error.code === '42P01') return []
    throw error
  }
}

export async function listRoomsForHotel(hotelId) {
  await ensureRoomSortOrderColumn()
  const { rows } = await query(
    `SELECT id, name, slug, description, occupancy_adults, occupancy_children, base_price,
            offer_price, rate_options, size_sqft, bed_type, amenities, amenity_items, hero_image_url, gallery, show_on_homepage, sort_order, created_at
     FROM room_types
     WHERE hotel_id = $1 AND active = true
     ORDER BY sort_order ASC, show_on_homepage DESC, created_at DESC, base_price ASC`,
    [hotelId],
  )
  return rows
}
