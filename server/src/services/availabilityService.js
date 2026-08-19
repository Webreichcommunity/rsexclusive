import { z } from 'zod'
import { badRequest } from '../utils/errors.js'

export const availabilitySchema = z.object({
  roomTypeId: z.string().uuid().optional(),
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  roomsCount: z.coerce.number().int().positive().default(1),
  adults: z.coerce.number().int().positive().default(1),
  children: z.coerce.number().int().min(0).default(0),
})

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
     available AS (
       SELECT
         rt.id,
         rt.name,
         rt.slug,
         rt.description,
         rt.occupancy_adults,
         rt.occupancy_children,
         rt.base_price,
         rt.offer_price,
         rt.size_sqft,
         rt.bed_type,
         rt.amenities,
         rt.amenity_items,
         rt.hero_image_url,
         rt.gallery,
         rt.show_on_homepage,
         min(ri.total_rooms - ri.reserved_rooms) AS available_rooms,
         sum(ri.price) AS subtotal
       FROM room_types rt
       JOIN room_inventory ri ON ri.room_type_id = rt.id AND ri.hotel_id = rt.hotel_id
       JOIN nights n ON n.stay_date = ri.stay_date
       WHERE rt.hotel_id = $1
         AND rt.active = true
         AND ri.closed = false
         AND rt.occupancy_adults >= $5
         AND rt.occupancy_children >= $6
         ${roomTypeFilter}
       GROUP BY rt.id
       HAVING count(ri.id) = ${nights} AND min(ri.total_rooms - ri.reserved_rooms) >= $4
     )
     SELECT *, $4::int AS requested_rooms, $3::date - $2::date AS nights
     FROM available
     ORDER BY subtotal ASC`,
    params,
  )

  return rows
}
