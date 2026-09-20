import { customAlphabet } from 'nanoid'
import { query, transaction } from '../db/pool.js'
import { env } from '../config/env.js'
import { conflict, notFound } from '../utils/errors.js'
import { assertValidStay, searchAvailability, toDateOnly } from './availabilityService.js'
import { createRazorpayOrder, verifyPaymentSignature } from './paymentService.js'
import { generateBookingPdf } from './pdfService.js'
import { sendBookingConfirmation } from './emailService.js'

const bookingRef = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10)
const LOYALTY_POINT_VALUE = 100
const PARTIAL_ADVANCE_PERCENT = 25
const DEFAULT_LOYALTY_REDEMPTION_MIN_POINTS = 1000
const FIXED_TAX_RATE = 5

async function ensureCustomer(db, hotelId, user) {
  if (!user) return null

  const { rows } = await db.query(
    `INSERT INTO customers (hotel_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (hotel_id, user_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [hotelId, user.id],
  )
  return rows[0].id
}

export function calculateBookingAmounts(subtotal, taxRate) {
  const subtotalAmount = Math.round((Number(subtotal || 0) + Number.EPSILON) * 100) / 100
  const tax = Math.round(((subtotalAmount * FIXED_TAX_RATE) / 100 + Number.EPSILON) * 100) / 100
  return {
    subtotal: subtotalAmount,
    tax,
    total: Math.round((subtotalAmount + tax + Number.EPSILON) * 100) / 100,
  }
}

export function calculateOfferDiscount(offer, subtotal) {
  if (!offer) return 0
  const subtotalAmount = Math.max(0, Number(subtotal || 0))
  const discountValue = Math.max(0, Number(offer.discount_value || 0))
  const rawDiscount = offer.discount_type === 'percentage'
    ? subtotalAmount * Math.min(discountValue, 100) / 100
    : discountValue
  return Math.round((Math.min(rawDiscount, subtotalAmount) + Number.EPSILON) * 100) / 100
}

export function calculatePaymentPlan(total, paymentMode = 'full', advancePercent = PARTIAL_ADVANCE_PERCENT) {
  const bookingTotal = Math.round((Math.max(0, Number(total || 0)) + Number.EPSILON) * 100) / 100
  const mode = paymentMode === 'partial' ? 'partial' : 'full'
  const paidAmount = mode === 'partial'
    ? Math.round(((bookingTotal * Math.max(1, Math.min(Number(advancePercent || PARTIAL_ADVANCE_PERCENT), 99))) / 100 + Number.EPSILON) * 100) / 100
    : bookingTotal
  return {
    mode,
    advancePercent: mode === 'partial' ? Math.max(1, Math.min(Number(advancePercent || PARTIAL_ADVANCE_PERCENT), 99)) : 100,
    paidAmount,
    balanceDue: Math.round((bookingTotal - paidAmount + Number.EPSILON) * 100) / 100,
  }
}

export function calculateLoyaltyRedemption(requestedPoints, availablePoints, eligibleSubtotal, pointValue = LOYALTY_POINT_VALUE, redemptionMinPoints = 0) {
  const requested = Math.max(0, Math.floor(Number(requestedPoints || 0)))
  const available = Math.max(0, Math.floor(Number(availablePoints || 0)))
  const minimum = Math.max(0, Math.floor(Number(redemptionMinPoints || 0)))
  if (minimum && available < minimum) {
    return { points: 0, amount: 0, pointValue }
  }
  const redeemableByTotal = Math.max(0, Math.floor(Math.max(0, Number(eligibleSubtotal || 0) - 1) / pointValue))
  const points = Math.min(requested, available, redeemableByTotal)
  return {
    points,
    amount: Math.round((points * pointValue + Number.EPSILON) * 100) / 100,
    pointValue,
  }
}

function getLoyaltyRedemptionMinPoints(hotel) {
  return Math.max(0, Number(hotel?.policies?.loyaltyRedemptionMinPoints || DEFAULT_LOYALTY_REDEMPTION_MIN_POINTS))
}

async function findApplicableOffer(db, hotelId, userId, offerId) {
  if (!offerId) return null
  const { rows } = await db.query(
    `WITH user_metrics AS (
       SELECT count(*) FILTER (WHERE status IN ('confirmed', 'completed'))::int AS qualified_bookings
       FROM bookings
       WHERE hotel_id = $1 AND user_id = $2
     )
     SELECT o.*
     FROM offers o
     CROSS JOIN user_metrics um
     WHERE o.id = $3
       AND o.hotel_id = $1
       AND o.active = true
       AND now() BETWEEN o.starts_at AND o.ends_at
       AND (
         o.audience_type = 'general'
         OR ($2::uuid IS NOT NULL AND o.audience_type = 'repeat_guest' AND um.qualified_bookings >= o.min_completed_bookings)
       )
     LIMIT 1`,
    [hotelId, userId || null, offerId],
  )
  if (!rows[0]) throw conflict('This offer is not available for this booking.', 'offer_unavailable')
  return rows[0]
}

async function findSelectedAmenities(db, hotelId, selectedAmenityIds = []) {
  const ids = [...new Set((selectedAmenityIds || []).filter(Boolean))]
  if (!ids.length) return []

  const { rows } = await db.query(
    `SELECT id, name, description, price, icon
     FROM hotel_amenities
     WHERE hotel_id = $1
       AND active = true
       AND id = ANY($2::uuid[])
     ORDER BY array_position($2::uuid[], id)`,
    [hotelId, ids],
  )

  if (rows.length !== ids.length) {
    throw conflict('One or more selected amenities are no longer available.', 'amenity_unavailable')
  }

  return rows.map((amenity) => ({
    id: amenity.id,
    name: amenity.name,
    description: amenity.description || '',
    price: Number(amenity.price || 0),
    icon: amenity.icon || 'sparkles',
  }))
}

async function findExtraBedAmenityId(db, hotelId) {
  const { rows } = await db.query(
    `SELECT id
     FROM hotel_amenities
     WHERE hotel_id = $1
       AND active = true
       AND (
         name ILIKE '%extra bed%'
         OR name ILIKE '%additional bed%'
         OR name ILIKE '%rollaway%'
       )
     ORDER BY price ASC, name ASC
     LIMIT 1`,
    [hotelId],
  )
  return rows[0]?.id || ''
}

async function reserveLoyaltyRedemption(db, _hotelId, userId, bookingId, requestedPoints, eligibleSubtotal, redemptionMinPoints = 0) {
  if (!requestedPoints || !userId) return { points: 0, amount: 0, pointValue: LOYALTY_POINT_VALUE }

  const { rows } = await db.query(
    `SELECT id, points_balance, scope, hotel_id
     FROM loyalty_accounts
     WHERE user_id = $1 AND points_balance > 0
     ORDER BY CASE WHEN scope = 'group' THEN 0 ELSE 1 END, updated_at ASC
     FOR UPDATE`,
    [userId],
  )
  const availablePoints = rows.reduce((sum, account) => sum + Number(account.points_balance || 0), 0)
  const redemption = calculateLoyaltyRedemption(requestedPoints, availablePoints, eligibleSubtotal, LOYALTY_POINT_VALUE, redemptionMinPoints)
  if (!redemption.points) return redemption

  let remaining = redemption.points
  const accounts = []
  for (const account of rows) {
    if (remaining <= 0) break
    const points = Math.min(remaining, Number(account.points_balance || 0))
    if (!points) continue
    remaining -= points
    accounts.push({ id: account.id, points })
    await db.query(
      `UPDATE loyalty_accounts
       SET points_balance = points_balance - $1,
           updated_at = now()
       WHERE id = $2`,
      [points, account.id],
    )
    await db.query(
      `INSERT INTO loyalty_transactions (loyalty_account_id, booking_id, points, reason)
       VALUES ($1, $2, $3, $4)`,
      [account.id, bookingId, -points, 'group_booking_redemption_hold'],
    )
  }

  return { ...redemption, accounts, accountId: accounts[0]?.id }
}

export async function createBookingHold({ hotel, user, payload }) {
  return transaction(async (db) => {
    const checkIn = toDateOnly(payload.checkIn)
    const checkOut = toDateOnly(payload.checkOut)
    const nights = assertValidStay(payload.checkIn, payload.checkOut)
    const roomTypeId = payload.roomTypeId
    const roomsCount = payload.roomsCount

    const availability = await searchAvailability(db, hotel.id, {
      ...payload,
      roomTypeId,
    })
    if (!availability[0]) {
      throw conflict('This room is no longer available for the selected dates.', 'room_unavailable')
    }

    const { rows: lockedRows } = await db.query(
      `SELECT id, price, total_rooms, reserved_rooms
       FROM room_inventory
       WHERE hotel_id = $1
         AND room_type_id = $2
         AND stay_date >= $3::date
         AND stay_date < $4::date
         AND closed = false
       ORDER BY stay_date ASC
       FOR UPDATE`,
      [hotel.id, roomTypeId, checkIn, checkOut],
    )

    if (
      lockedRows.length !== nights ||
      lockedRows.some((row) => Number(row.total_rooms) - Number(row.reserved_rooms) < roomsCount)
    ) {
      throw conflict('Inventory changed during checkout. Please choose another room.', 'inventory_changed')
    }

    const roomSubtotal = Number(availability[0].subtotal || lockedRows.reduce((sum, row) => sum + Number(row.price), 0)) * roomsCount
    const selectedAmenityIds = [...new Set(payload.selectedAmenityIds || [])]
    if (availability[0]?.extra_bed_recommended) {
      const extraBedAmenityId = await findExtraBedAmenityId(db, hotel.id)
      if (extraBedAmenityId && !selectedAmenityIds.includes(extraBedAmenityId)) {
        selectedAmenityIds.push(extraBedAmenityId)
      }
    }

    const selectedAmenities = await findSelectedAmenities(db, hotel.id, selectedAmenityIds)
    const amenitySubtotal = selectedAmenities.reduce((sum, amenity) => sum + Number(amenity.price || 0) * roomsCount, 0)
    const grossSubtotal = Math.round((roomSubtotal + amenitySubtotal + Number.EPSILON) * 100) / 100
    const appliedOffer = await findApplicableOffer(db, hotel.id, user?.id || null, payload.offerId)
    const discountAmount = calculateOfferDiscount(appliedOffer, grossSubtotal)
    const afterOfferSubtotal = Math.max(0, Math.round((grossSubtotal - discountAmount + Number.EPSILON) * 100) / 100)
    const customerId = await ensureCustomer(db, hotel.id, user)
    const reference = `RS-${bookingRef()}`
    const redemptionMinPoints = getLoyaltyRedemptionMinPoints(hotel)
    const bookingMetadata = {
      pricing: {
        roomSubtotal: Math.round((roomSubtotal + Number.EPSILON) * 100) / 100,
        rateCategory: availability[0].selected_rate_category || 'standard',
        amenitySubtotal: Math.round((amenitySubtotal + Number.EPSILON) * 100) / 100,
        grossSubtotal,
        offerDiscount: discountAmount,
        loyaltyDiscount: 0,
      },
      termsAndConditions: {
        accepted: true,
        version: payload.termsVersion || '2026-09-19',
        acceptedAt: new Date().toISOString(),
        source: 'room_booking',
      },
      selectedAmenities,
      ...(availability[0]?.extra_bed_recommended
        ? {
            extraBed: {
              required: true,
              count: Number(availability[0].extra_bed_count || 1),
              note: 'Extra bed amenity added for requested adult occupancy.',
            },
          }
        : {}),
      ...(appliedOffer
        ? {
            offer: {
              id: appliedOffer.id,
              title: appliedOffer.title,
              code: appliedOffer.code,
              discountType: appliedOffer.discount_type,
              discountValue: Number(appliedOffer.discount_value || 0),
              discountAmount,
              originalSubtotal: grossSubtotal,
            },
          }
        : {}),
    }

    await db.query(
      `UPDATE room_inventory
       SET reserved_rooms = reserved_rooms + $1
       WHERE hotel_id = $2
         AND room_type_id = $3
         AND stay_date >= $4::date
         AND stay_date < $5::date`,
      [roomsCount, hotel.id, roomTypeId, checkIn, checkOut],
    )

    const { rows: bookingRows } = await db.query(
      `INSERT INTO bookings (
        hotel_id, customer_id, user_id, room_type_id, booking_reference, status,
        check_in, check_out, nights, rooms_count, adults, children, guest_name,
        guest_email, guest_phone, subtotal_amount, tax_amount, total_amount,
        currency, hold_expires_at, metadata
      )
      VALUES ($1,$2,$3,$4,$5,'payment_pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now() + interval '15 minutes', $19::jsonb)
      RETURNING *`,
      [
        hotel.id,
        customerId,
        user?.id || null,
        roomTypeId,
        reference,
        checkIn,
        checkOut,
        nights,
        roomsCount,
        payload.adults,
        payload.children || 0,
        payload.guestName,
        payload.guestEmail,
        payload.guestPhone || null,
        afterOfferSubtotal,
        0,
        0,
        hotel.currency,
        JSON.stringify(bookingMetadata),
      ],
    )

    const initialBooking = bookingRows[0]
    const loyaltyRedemption = await reserveLoyaltyRedemption(
      db,
      hotel.id,
      user?.id || null,
      initialBooking.id,
      payload.redeemPoints,
      afterOfferSubtotal,
      redemptionMinPoints,
    )
    const taxableSubtotal = Math.max(0, Math.round((afterOfferSubtotal - loyaltyRedemption.amount + Number.EPSILON) * 100) / 100)
    const amounts = calculateBookingAmounts(taxableSubtotal, hotel.tax_rate)
    const paymentPlan = calculatePaymentPlan(amounts.total, payload.paymentMode)
    const finalMetadata = {
      ...bookingMetadata,
      paymentPlan,
      pricing: {
        ...bookingMetadata.pricing,
        taxableSubtotal: amounts.subtotal,
        taxRate: FIXED_TAX_RATE,
        tax: amounts.tax,
        total: amounts.total,
        loyaltyDiscount: loyaltyRedemption.amount,
      },
      ...(loyaltyRedemption.points
        ? {
            loyaltyRedemption: {
              points: loyaltyRedemption.points,
              amount: loyaltyRedemption.amount,
              pointValue: loyaltyRedemption.pointValue,
              accountId: loyaltyRedemption.accountId,
              accounts: loyaltyRedemption.accounts || [],
              redemptionMinPoints,
            },
          }
        : {}),
    }
    const { rows: finalBookingRows } = await db.query(
      `UPDATE bookings
       SET subtotal_amount = $1,
           tax_amount = $2,
           total_amount = $3,
           metadata = $4::jsonb
       WHERE id = $5
       RETURNING *`,
      [amounts.subtotal, amounts.tax, amounts.total, JSON.stringify(finalMetadata), initialBooking.id],
    )
    const booking = finalBookingRows[0]
    const order = await createRazorpayOrder({
      amount: paymentPlan.paidAmount,
      currency: booking.currency,
      receipt: booking.booking_reference,
      hotel,
      notes: {
        bookingId: booking.id,
        hotelId: hotel.id,
        paymentMode: paymentPlan.mode,
        balanceDue: paymentPlan.balanceDue,
        amenities: selectedAmenities.map((amenity) => amenity.name).join(', '),
        loyaltyRedeemed: loyaltyRedemption.points,
      },
    })

    await db.query(
      `UPDATE bookings SET razorpay_order_id = $1 WHERE id = $2`,
      [order.id, booking.id],
    )
    await db.query(
      `INSERT INTO payments (hotel_id, booking_id, provider_order_id, status, amount, currency, raw_payload)
       VALUES ($1,$2,$3,'created',$4,$5,$6)`,
      [hotel.id, booking.id, order.id, paymentPlan.paidAmount, booking.currency, { ...order, paymentPlan, paymentRouting: order.paymentRouting }],
    )

    return {
      booking: { ...booking, razorpay_order_id: order.id },
      paymentOrder: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: env.razorpay.keyId || 'rzp_test_dev',
      },
    }
  })
}

export async function confirmBookingPayment({ orderId, paymentId, signature, trustedWebhook = false }) {
  if (!trustedWebhook && !verifyPaymentSignature({ orderId, paymentId, signature })) {
    throw conflict('Payment verification failed.', 'payment_verification_failed')
  }

  const result = await transaction(async (db) => {
    const { rows } = await db.query(
      `SELECT b.*, h.name AS hotel_name
       FROM bookings b
       JOIN hotels h ON h.id = b.hotel_id
       WHERE b.razorpay_order_id = $1
       FOR UPDATE`,
      [orderId],
    )
    const booking = rows[0]
    if (!booking) throw notFound('Booking not found')
    if (booking.status !== 'payment_pending') {
      if (booking.status !== 'confirmed') {
        throw conflict('Booking cannot be confirmed from its current status.', 'invalid_booking_status')
      }
    }

    let confirmed = booking
    if (booking.status === 'payment_pending') {
      await db.query(
        `UPDATE payments
         SET provider_payment_id = $1, provider_signature = $2, status = 'captured', updated_at = now()
         WHERE provider_order_id = $3`,
        [paymentId, signature, orderId],
      )

      const { rows: confirmedRows } = await db.query(
        `UPDATE bookings
         SET status = 'confirmed', confirmed_at = now()
         WHERE id = $1
         RETURNING *`,
        [booking.id],
      )
      confirmed = confirmedRows[0]
    }

    const earnedPoints = booking.status === 'payment_pending' ? Math.floor(Number(confirmed.total_amount || 0) / 100) : 0
    if (confirmed.user_id && earnedPoints > 0) {
      const { rows: existingGroupRows } = await db.query(
        `SELECT id
         FROM loyalty_accounts
         WHERE user_id = $1 AND scope = 'group' AND hotel_id IS NULL
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE`,
        [confirmed.user_id],
      )
      const { rows: accountRows } = existingGroupRows[0]
        ? await db.query(
            `UPDATE loyalty_accounts
             SET points_balance = points_balance + $1,
                 updated_at = now()
             WHERE id = $2
             RETURNING id`,
            [earnedPoints, existingGroupRows[0].id],
          )
        : await db.query(
            `INSERT INTO loyalty_accounts (hotel_id, user_id, scope, points_balance)
             VALUES (null, $1, 'group', $2)
             RETURNING id`,
            [confirmed.user_id, earnedPoints],
          )
      await db.query(
        `INSERT INTO loyalty_transactions (loyalty_account_id, booking_id, points, reason)
         VALUES ($1, $2, $3, $4)`,
        [accountRows[0].id, confirmed.id, earnedPoints, 'group_booking_reward'],
      )
    }

    const { rows: invoiceRows } = await db.query(
      `INSERT INTO invoices (hotel_id, booking_id, invoice_number, status, issued_at)
       VALUES ($1, $2, $3, 'issued', now())
       ON CONFLICT (booking_id) DO UPDATE SET status = 'issued', issued_at = now()
       RETURNING *`,
      [confirmed.hotel_id, confirmed.id, `INV-${confirmed.booking_reference}`],
    )

    const [{ rows: hotelRows }, { rows: roomRows }] = await Promise.all([
      db.query('SELECT * FROM hotels WHERE id = $1', [confirmed.hotel_id]),
      db.query(
        `SELECT id, name, slug, description, occupancy_adults, occupancy_children,
                base_price, offer_price, size_sqft, bed_type, amenities,
                amenity_items, hero_image_url, gallery
         FROM room_types
         WHERE id = $1
         LIMIT 1`,
        [confirmed.room_type_id],
      ),
    ])
    return { booking: { ...confirmed, room_type_name: roomRows[0]?.name }, hotel: hotelRows[0], room: roomRows[0], invoice: invoiceRows[0] }
  })

  try {
    const pdf = await generateBookingPdf({ hotel: result.hotel, room: result.room, booking: result.booking, invoice: result.invoice })
    const invoice = { ...result.invoice, pdf_url: pdf.publicUrl }
    await query('UPDATE invoices SET pdf_url = $1 WHERE id = $2', [pdf.publicUrl, result.invoice.id])
    const hotelAdminEmails = await listHotelAdminEmails(result.hotel.id)
    await sendBookingConfirmation({ hotel: result.hotel, room: result.room, booking: result.booking, invoice, pdfPath: pdf.filePath, hotelAdminEmails })
  } catch (error) {
    console.error({ message: 'Receipt workflow failed', bookingId: result.booking.id, error: error.message })
  }

  return result.booking
}

async function listHotelAdminEmails(hotelId) {
  const { rows } = await query(
    `SELECT DISTINCT u.email
     FROM hotel_admins ha
     JOIN users u ON u.id = ha.user_id
     WHERE ha.hotel_id = $1
       AND u.role = 'hotel_admin'
       AND u.disabled_at IS NULL
       AND u.email IS NOT NULL`,
    [hotelId],
  )
  return rows.map((row) => row.email).filter(Boolean)
}

export async function releaseExpiredBookingHolds(db) {
  const { rows } = await db.query(
    `SELECT *
     FROM bookings
     WHERE status = 'payment_pending' AND hold_expires_at < now()
     FOR UPDATE`,
  )

  for (const booking of rows) {
    const redemption = booking.metadata?.loyaltyRedemption
    const redemptionAccounts = Array.isArray(redemption?.accounts) && redemption.accounts.length
      ? redemption.accounts
      : redemption?.accountId && Number(redemption.points || 0) > 0
        ? [{ id: redemption.accountId, points: redemption.points }]
        : []
    for (const account of redemptionAccounts) {
      if (!account.id || Number(account.points || 0) <= 0) continue
      await db.query(
        `UPDATE loyalty_accounts
         SET points_balance = points_balance + $1,
           updated_at = now()
         WHERE id = $2`,
        [account.points, account.id],
      )
      await db.query(
        `INSERT INTO loyalty_transactions (loyalty_account_id, booking_id, points, reason)
         VALUES ($1, $2, $3, $4)`,
        [account.id, booking.id, account.points, 'group_booking_redemption_release'],
      )
    }
    await db.query(
      `UPDATE room_inventory
       SET reserved_rooms = GREATEST(reserved_rooms - $1, 0)
       WHERE hotel_id = $2
         AND room_type_id = $3
         AND stay_date >= $4
         AND stay_date < $5`,
      [booking.rooms_count, booking.hotel_id, booking.room_type_id, booking.check_in, booking.check_out],
    )
    await db.query(`UPDATE bookings SET status = 'failed' WHERE id = $1`, [booking.id])
  }

  return rows.length
}
