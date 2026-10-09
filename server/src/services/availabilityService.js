import { z } from 'zod'
import { ensureRoomSortOrderColumn } from './hotelService.js'
import { badRequest } from '../utils/errors.js'

export const availabilitySchema = z.object({
  roomTypeId: z.string().uuid().optional(),
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  roomsCount: z.coerce.number().int().positive().default(1),
  adults: z.coerce.number().int().positive().default(1),
  children: z.coerce.number().int().min(0).default(0),
})

const EXTRA_BED_ADULT_CAPACITY = 1

export function toDateOnly(value) {
  return new Date(value).toISOString().slice(0, 10)
}

export function nightsBetween(checkIn, checkOut) {
  const start = Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate())
  const end = Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate())
  return Math.round((end - start) / 86_400_000)
}

export function assertValidStay(checkIn, checkOut) {
  const nights = nightsBetween(checkIn, checkOut)
  if (!Number.isFinite(nights) || nights < 1) {
    throw badRequest('Check-out date must be after check-in date.', 'invalid_stay_dates', {
      minNights: 1,
      maxNights: 30,
    })
  }
  if (nights > 30) {
    throw badRequest('Stay cannot be more than 30 nights.', 'invalid_stay_dates', {
      minNights: 1,
      maxNights: 30,
    })
  }
  return nights
}

export async function searchAvailability(db, hotelId, input) {
  await ensureRoomSortOrderColumn(db)
  const nights = assertValidStay(input.checkIn, input.checkOut)
  const checkIn = toDateOnly(input.checkIn)
  const checkOut = toDateOnly(input.checkOut)

  const params = [hotelId, checkIn, checkOut, input.roomsCount, input.adults, input.children]
  const roomTypeFilter = input.roomTypeId ? 'AND rt.id = $7' : ''
  if (input.roomTypeId) params.push(input.roomTypeId)

  const { rows } = await db.query(
    `WITH nights AS (
       SELECT d::date AS stay_date
       FROM generate_series($2::date, ($3::date - interval '1 day'), interval '1 day') d
     ),
     extra_bed_amenity AS (
       SELECT DISTINCT ON (hotel_id)
         hotel_id,
         price
       FROM hotel_amenities
       WHERE active = true
         AND (
           name ILIKE '%extra bed%'
           OR name ILIKE '%additional bed%'
           OR name ILIKE '%rollaway%'
         )
       ORDER BY hotel_id, price ASC, name ASC
     ),
     room_rates AS (
       SELECT
         rt.*,
         eba.price AS extra_bed_amenity_price,
         CASE
           WHEN $5::int = 1 AND coalesce((rt.rate_options->'single'->>'enabled')::boolean, rt.rate_options ? 'single') THEN rt.rate_options->'single'
           WHEN $5::int = 1 AND coalesce((rt.rate_options->'double'->>'enabled')::boolean, rt.rate_options ? 'double') THEN rt.rate_options->'double'
           WHEN $5::int >= 2 AND coalesce((rt.rate_options->'double'->>'enabled')::boolean, rt.rate_options ? 'double') THEN rt.rate_options->'double'
           ELSE '{}'::jsonb
         END AS selected_rate,
         CASE
           WHEN $5::int = 1 AND coalesce((rt.rate_options->'single'->>'enabled')::boolean, rt.rate_options ? 'single') THEN 'single'
           WHEN $5::int = 1 AND coalesce((rt.rate_options->'double'->>'enabled')::boolean, rt.rate_options ? 'double') THEN 'double'
           WHEN $5::int >= 2 AND coalesce((rt.rate_options->'double'->>'enabled')::boolean, rt.rate_options ? 'double') THEN 'double'
           ELSE 'standard'
         END AS selected_rate_category
       FROM room_types rt
       LEFT JOIN extra_bed_amenity eba ON eba.hotel_id = rt.hotel_id
     ),
     available AS (
       SELECT
         rt.id,
         rt.name,
         rt.slug,
         rt.description,
         coalesce((rt.selected_rate->>'occupancyAdults')::int, rt.occupancy_adults) AS occupancy_adults,
         coalesce((rt.selected_rate->>'occupancyChildren')::int, rt.occupancy_children) AS occupancy_children,
         coalesce((rt.selected_rate->>'basePrice')::numeric, rt.base_price) AS base_price,
         coalesce(nullif(rt.selected_rate->>'offerPrice', '')::numeric, rt.offer_price) AS offer_price,
         rt.rate_options,
         rt.selected_rate_category,
         coalesce((rt.selected_rate->>'sizeSqft')::int, rt.size_sqft) AS size_sqft,
         rt.bed_type,
         rt.amenities,
         rt.amenity_items,
         rt.hero_image_url,
         rt.gallery,
         rt.show_on_homepage,
         rt.sort_order,
         CASE
           WHEN coalesce((rt.selected_rate->'extraBed'->>'enabled')::boolean, false)
            AND coalesce((rt.selected_rate->>'occupancyAdults')::int, rt.occupancy_adults) < $5::int
           THEN greatest(0, $5::int - coalesce((rt.selected_rate->>'occupancyAdults')::int, rt.occupancy_adults))
           ELSE 0
         END::int AS extra_bed_count,
         (
           coalesce((rt.selected_rate->'extraBed'->>'enabled')::boolean, false)
           AND coalesce((rt.selected_rate->>'occupancyAdults')::int, rt.occupancy_adults) < $5::int
         )::boolean AS extra_bed_recommended,
         coalesce((rt.selected_rate->'extraBed'->>'enabled')::boolean, false)::boolean AS extra_bed_available,
         true::boolean AS extra_bed_preselected,
         coalesce(
           rt.extra_bed_amenity_price,
           nullif(rt.selected_rate->'extraBed'->>'price', '')::numeric,
           0
         )::numeric AS extra_bed_price,
         min(ri.total_rooms - ri.reserved_rooms)::int AS available_rooms,
         sum(
           coalesce(
             nullif(ri.rate_options->rt.selected_rate_category->>'price', '')::numeric,
             nullif(rt.selected_rate->>'offerPrice', '')::numeric,
             nullif(rt.selected_rate->>'basePrice', '')::numeric,
             rt.offer_price,
             rt.base_price
           )
         )::numeric AS subtotal
       FROM room_rates rt
       JOIN room_inventory ri ON ri.room_type_id = rt.id AND ri.hotel_id = rt.hotel_id
       JOIN nights n ON n.stay_date = ri.stay_date
       WHERE rt.hotel_id = $1
         AND rt.active = true
         AND ri.closed = false
         AND rt.selected_rate_category <> 'standard'
         AND (
           coalesce((rt.selected_rate->>'occupancyAdults')::int, rt.occupancy_adults) >= $5
           OR (
             coalesce((rt.selected_rate->'extraBed'->>'enabled')::boolean, false)
             AND coalesce((rt.selected_rate->>'occupancyAdults')::int, rt.occupancy_adults) + ${EXTRA_BED_ADULT_CAPACITY} >= $5
           )
         )
         AND coalesce((rt.selected_rate->>'occupancyChildren')::int, rt.occupancy_children) >= $6
         ${roomTypeFilter}
       GROUP BY
         rt.id,
         rt.name,
         rt.slug,
         rt.description,
         rt.occupancy_adults,
         rt.occupancy_children,
         rt.base_price,
         rt.offer_price,
         rt.rate_options,
         rt.selected_rate,
         rt.selected_rate_category,
         rt.size_sqft,
         rt.bed_type,
         rt.amenities,
         rt.amenity_items,
         rt.hero_image_url,
         rt.gallery,
         rt.show_on_homepage,
         rt.sort_order,
         rt.extra_bed_amenity_price
       HAVING count(ri.id) = ${nights}
          AND min(ri.total_rooms - ri.reserved_rooms) >= $4
     )
     SELECT *, $4::int AS requested_rooms, $3::date - $2::date AS nights
     FROM available
     ORDER BY sort_order ASC, subtotal ASC`,
    params,
  )

  return rows
}
