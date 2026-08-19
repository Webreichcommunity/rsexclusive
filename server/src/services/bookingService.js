import { customAlphabet } from 'nanoid'
import { query, transaction } from '../db/pool.js'
import { env } from '../config/env.js'
import { conflict, notFound } from '../utils/errors.js'
import { assertValidStay, searchAvailability, toDateOnly } from './availabilityService.js'
import { createRazorpayOrder, verifyPaymentSignature } from './paymentService.js'
import { generateBookingPdf } from './pdfService.js'
import { sendBookingConfirmation } from './emailService.js'

const bookingRef = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10)

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
  const tax = Math.round(((subtotalAmount * Number(taxRate || 0)) / 100 + Number.EPSILON) * 100) / 100
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

export function calculatePaymentPlan(total, paymentMode = 'full', advancePercent = 25) {
  const bookingTotal = Math.round((Math.max(0, Number(total || 0)) + Number.EPSILON) * 100) / 100
  const mode = paymentMode === 'partial' ? 'partial' : 'full'
  const paidAmount = mode === 'partial'
    ? Math.round(((bookingTotal * Math.max(1, Math.min(Number(advancePercent || 25), 99))) / 100 + Number.EPSILON) * 100) / 100
    : bookingTotal
  return {
    mode,
    advancePercent: mode === 'partial' ? Math.max(1, Math.min(Number(advancePercent || 25), 99)) : 100,
    paidAmount,
    balanceDue: Math.round((bookingTotal - paidAmount + Number.EPSILON) * 100) / 100,
  }
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

    const roomSubtotal = lockedRows.reduce((sum, row) => sum + Number(row.price) * roomsCount, 0)
    const appliedOffer = await findApplicableOffer(db, hotel.id, user?.id || null, payload.offerId)
    const discountAmount = calculateOfferDiscount(appliedOffer, roomSubtotal)
    const payableSubtotal = Math.max(0, roomSubtotal - discountAmount)
    const amounts = calculateBookingAmounts(payableSubtotal, hotel.tax_rate)
    const paymentPlan = calculatePaymentPlan(amounts.total, payload.paymentMode)
    const customerId = await ensureCustomer(db, hotel.id, user)
    const reference = `RS-${bookingRef()}`
    const bookingMetadata = {
      paymentPlan,
      ...(appliedOffer
        ? {
            offer: {
              id: appliedOffer.id,
              title: appliedOffer.title,
              code: appliedOffer.code,
              discountType: appliedOffer.discount_type,
              discountValue: Number(appliedOffer.discount_value || 0),
              discountAmount,
              originalSubtotal: Math.round((roomSubtotal + Number.EPSILON) * 100) / 100,
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
        amounts.subtotal,
        amounts.tax,
        amounts.total,
        hotel.currency,
        JSON.stringify(bookingMetadata),
      ],
    )

    const booking = bookingRows[0]
    const order = await createRazorpayOrder({
      amount: paymentPlan.paidAmount,
      currency: booking.currency,
      receipt: booking.booking_reference,
      notes: { bookingId: booking.id, hotelId: hotel.id, paymentMode: paymentPlan.mode, balanceDue: paymentPlan.balanceDue },
    })

    await db.query(
      `UPDATE bookings SET razorpay_order_id = $1 WHERE id = $2`,
      [order.id, booking.id],
    )
    await db.query(
      `INSERT INTO payments (hotel_id, booking_id, provider_order_id, status, amount, currency, raw_payload)
       VALUES ($1,$2,$3,'created',$4,$5,$6)`,
      [hotel.id, booking.id, order.id, paymentPlan.paidAmount, booking.currency, { ...order, paymentPlan }],
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
    if (booking.status === 'confirmed') return booking
    if (booking.status !== 'payment_pending') {
      throw conflict('Booking cannot be confirmed from its current status.', 'invalid_booking_status')
    }

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
    const confirmed = confirmedRows[0]
    const earnedPoints = Math.floor(Number(confirmed.total_amount || 0) / 100)
    if (confirmed.user_id && earnedPoints > 0) {
      const { rows: accountRows } = await db.query(
        `INSERT INTO loyalty_accounts (hotel_id, user_id, scope, points_balance)
         VALUES ($1, $2, 'hotel', $3)
         ON CONFLICT (hotel_id, user_id, scope) DO UPDATE SET
           points_balance = loyalty_accounts.points_balance + EXCLUDED.points_balance,
           updated_at = now()
         RETURNING id`,
        [confirmed.hotel_id, confirmed.user_id, earnedPoints],
      )
      await db.query(
        `INSERT INTO loyalty_transactions (loyalty_account_id, booking_id, points, reason)
         VALUES ($1, $2, $3, $4)`,
        [accountRows[0].id, confirmed.id, earnedPoints, 'booking_reward'],
      )
    }

    const { rows: invoiceRows } = await db.query(
      `INSERT INTO invoices (hotel_id, booking_id, invoice_number, status, issued_at)
       VALUES ($1, $2, $3, 'issued', now())
       ON CONFLICT (booking_id) DO UPDATE SET status = 'issued', issued_at = now()
       RETURNING *`,
      [confirmed.hotel_id, confirmed.id, `INV-${confirmed.booking_reference}`],
    )

    const { rows: hotelRows } = await db.query('SELECT * FROM hotels WHERE id = $1', [confirmed.hotel_id])
    return { booking: confirmed, hotel: hotelRows[0], invoice: invoiceRows[0] }
  })

  generateBookingPdf({ hotel: result.hotel, booking: result.booking, invoice: result.invoice })
    .then(async (pdf) => {
      const invoice = { ...result.invoice, pdf_url: pdf.publicUrl }
      await query('UPDATE invoices SET pdf_url = $1 WHERE id = $2', [pdf.publicUrl, result.invoice.id])
      await sendBookingConfirmation({ hotel: result.hotel, booking: result.booking, invoice, pdfPath: pdf.filePath })
    })
    .catch((error) => console.error({ message: 'Receipt workflow failed', bookingId: result.booking.id, error: error.message }))

  return result.booking
}

export async function releaseExpiredBookingHolds(db) {
  const { rows } = await db.query(
    `SELECT *
     FROM bookings
     WHERE status = 'payment_pending' AND hold_expires_at < now()
     FOR UPDATE`,
  )

  for (const booking of rows) {
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
