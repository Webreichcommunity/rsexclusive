import { customAlphabet } from 'nanoid'
import { query, transaction } from '../db/pool.js'
import { env } from '../config/env.js'
import { conflict, notFound } from '../utils/errors.js'
import { assertValidStay, searchAvailability, toDateOnly } from './availabilityService.js'
import { createRazorpayOrder, verifyPaymentSignature } from './paymentService.js'
import { generateBookingPdf } from './pdfService.js'
import { sendBookingConfirmation } from './emailService.js'
import { ensureOfferKindColumn } from './hotelService.js'

const bookingRef = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10)
const PARTIAL_ADVANCE_PERCENT = 25
const FIXED_TAX_RATE = 5

export const BOOKING_MILESTONE_OFFERS = [
  {
    code: 'meal_or_drink',
    milestone: 5,
    redeemOnBooking: 6,
    title: 'Complimentary meal or drink',
    description: 'Complete 5 room bookings across the group and redeem one complimentary meal or drink on your next booking.',
    discountAmount: 0,
  },
  {
    code: 'rs_1000_off',
    milestone: 10,
    redeemOnBooking: 11,
    title: 'Rs 1,000 off',
    description: 'Complete 10 room bookings across the group and redeem Rs 1,000 off on your next booking.',
    discountAmount: 1000,
  },
  {
    code: 'rs_2000_off',
    milestone: 20,
    redeemOnBooking: 21,
    title: 'Rs 2,000 off',
    description: 'Complete 20 room bookings across the group and redeem Rs 2,000 off on your next booking.',
    discountAmount: 2000,
  },
]

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

async function saveCheckoutPhoneToProfile(db, user, phone) {
  const normalizedPhone = String(phone || '').trim()
  if (!user?.id || !normalizedPhone) return
  await db.query(
    `UPDATE users
     SET phone = $1,
         updated_at = now()
     WHERE id = $2`,
    [normalizedPhone, user.id],
  )
}

export function calculateBookingAmounts(subtotal) {
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

function normalizeGstClaim(input = {}) {
  if (!input?.enabled) return { enabled: false }
  return {
    enabled: true,
    companyName: String(input.companyName || '').trim(),
    gstNumber: String(input.gstNumber || '').trim().toUpperCase(),
    companyAddress: String(input.companyAddress || '').trim(),
  }
}

export function calculateMilestoneOfferDiscount(offer, eligibleSubtotal) {
  if (!offer) return 0
  const discount = Math.max(0, Number(offer.discountAmount || 0))
  const subtotal = Math.max(0, Number(eligibleSubtotal || 0))
  return Math.round((Math.min(discount, Math.max(0, subtotal - 1)) + Number.EPSILON) * 100) / 100
}

function buildMilestoneProgress(row = {}, redemptionHistory = []) {
  const completedRoomBookings = Math.max(0, Number(row.completed_room_bookings || 0))
  const eligibleOffers = BOOKING_MILESTONE_OFFERS.filter((offer) => completedRoomBookings >= offer.milestone)
  const bestEligibleOffer = eligibleOffers[eligibleOffers.length - 1] || null
  const nextOffer = BOOKING_MILESTONE_OFFERS.find((offer) => completedRoomBookings < offer.milestone) || null
  return {
    completedRoomBookings,
    eligibleOffers,
    bestEligibleOffer,
    nextOffer,
    roomsToNextOffer: nextOffer ? Math.max(0, nextOffer.milestone - completedRoomBookings) : 0,
    lastRedeemedAt: row.last_redeemed_at || null,
    lastBookingAt: row.last_booking_at || null,
    milestones: BOOKING_MILESTONE_OFFERS,
    redemptionHistory,
  }
}

export async function getBookingMilestoneProgress(db, userId, options = {}) {
  if (!userId) return buildMilestoneProgress()
  const { rows } = await db.query(
    `WITH qualified_bookings AS (
       SELECT id, rooms_count, metadata, coalesce(confirmed_at, created_at) AS activity_at
       FROM bookings
       WHERE user_id = $1
         AND status IN ('confirmed', 'completed')
     ),
     last_redemption AS (
       SELECT activity_at
       FROM qualified_bookings
       WHERE metadata ? 'milestoneRedemption'
       ORDER BY activity_at DESC, id DESC
       LIMIT 1
     )
     SELECT
       coalesce(sum(qb.rooms_count) FILTER (
         WHERE qb.activity_at > coalesce((SELECT activity_at FROM last_redemption), '-infinity'::timestamptz)
       ), 0)::int AS completed_room_bookings,
       max(qb.activity_at) FILTER (
         WHERE qb.activity_at > coalesce((SELECT activity_at FROM last_redemption), '-infinity'::timestamptz)
       ) AS last_booking_at,
       (SELECT activity_at FROM last_redemption) AS last_redeemed_at
     FROM qualified_bookings qb`,
    [userId],
  )
  const redemptionHistory = options.includeHistory ? await listMilestoneRedemptionHistory(db, userId) : []
  return buildMilestoneProgress(rows[0], redemptionHistory)
}

async function listMilestoneRedemptionHistory(db, userId) {
  const { rows } = await db.query(
    `SELECT
       b.id,
       b.booking_reference,
       b.rooms_count,
       b.total_amount,
       b.currency,
       coalesce(b.confirmed_at, b.created_at) AS redeemed_at,
       h.name AS hotel_name,
       b.metadata->'milestoneRedemption' AS redemption
     FROM bookings b
     JOIN hotels h ON h.id = b.hotel_id
     WHERE b.user_id = $1
       AND b.status IN ('confirmed', 'completed')
       AND b.metadata ? 'milestoneRedemption'
     ORDER BY coalesce(b.confirmed_at, b.created_at) DESC, b.created_at DESC
     LIMIT 25`,
    [userId],
  )
  return rows.map((row) => ({
    bookingId: row.id,
    bookingReference: row.booking_reference,
    hotelName: row.hotel_name,
    roomsCount: Number(row.rooms_count || 0),
    bookingTotal: Number(row.total_amount || 0),
    currency: row.currency || 'INR',
    redeemedAt: row.redeemed_at,
    code: row.redemption?.code || '',
    title: row.redemption?.title || 'Special offer',
    milestone: Number(row.redemption?.milestone || 0),
    redeemOnBooking: Number(row.redemption?.redeemOnBooking || 0),
    discountAmount: Number(row.redemption?.discountAmount || 0),
    faceValue: Number(row.redemption?.faceValue || 0),
    completedRoomBookings: Number(row.redemption?.completedRoomBookings || 0),
  }))
}

async function findApplicableOffer(db, hotelId, userId, offerId, roomTypeId) {
  if (!offerId) return null
  await ensureOfferKindColumn(db)
  const { rows } = await db.query(
    `WITH user_metrics AS (
       SELECT count(*) FILTER (WHERE status IN ('confirmed', 'completed'))::int AS qualified_bookings
       FROM bookings
       WHERE hotel_id = $1 AND user_id = $2
     ),
     offer_usage AS (
       SELECT count(*)::int AS used_count
       FROM bookings
       WHERE user_id = $2
         AND (
           status IN ('confirmed', 'completed')
           OR (status = 'payment_pending' AND hold_expires_at > now())
         )
         AND metadata->'offer'->>'id' = $3::text
     )
     SELECT o.*
     FROM offers o
     CROSS JOIN user_metrics um
     CROSS JOIN offer_usage ou
     WHERE o.id = $3
       AND o.hotel_id = $1
       AND o.offer_kind = 'applied'
       AND o.active = true
       AND now() BETWEEN o.starts_at AND o.ends_at
       AND (cardinality(coalesce(o.room_type_ids, '{}'::uuid[])) = 0 OR $4::uuid = ANY(o.room_type_ids))
       AND (
         o.audience_type = 'general'
         OR ($2::uuid IS NOT NULL AND o.audience_type = 'repeat_guest' AND um.qualified_bookings >= o.min_completed_bookings)
       )
       AND (
         coalesce(o.redemption_limit_per_user, 0) = 0
         OR ou.used_count < o.redemption_limit_per_user
       )
     LIMIT 1`,
    [hotelId, userId || null, offerId, roomTypeId],
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
    let selectedAmenityIds = [...new Set(payload.selectedAmenityIds || [])]
    const extraBedAmenityId = await findExtraBedAmenityId(db, hotel.id)
    if (Number(payload.adults || 1) === 3 && availability[0]?.extra_bed_recommended) {
      if (extraBedAmenityId && !selectedAmenityIds.includes(extraBedAmenityId)) {
        selectedAmenityIds.push(extraBedAmenityId)
      }
    } else if (extraBedAmenityId) {
      selectedAmenityIds = selectedAmenityIds.filter((id) => id !== extraBedAmenityId)
    }

    const selectedAmenities = await findSelectedAmenities(db, hotel.id, selectedAmenityIds)
    const amenitySubtotal = selectedAmenities.reduce((sum, amenity) => sum + Number(amenity.price || 0) * roomsCount, 0)
    const grossSubtotal = Math.round((roomSubtotal + amenitySubtotal + Number.EPSILON) * 100) / 100
    const appliedOffer = await findApplicableOffer(db, hotel.id, user?.id || null, payload.offerId, roomTypeId)
    const discountAmount = calculateOfferDiscount(appliedOffer, grossSubtotal)
    const afterOfferSubtotal = Math.max(0, Math.round((grossSubtotal - discountAmount + Number.EPSILON) * 100) / 100)
    const customerId = await ensureCustomer(db, hotel.id, user)
    await saveCheckoutPhoneToProfile(db, user, payload.guestPhone)
    const reference = `RS-${bookingRef()}`
    const gstClaim = normalizeGstClaim(payload.gstClaim)
    const milestoneProgress = await getBookingMilestoneProgress(db, user?.id || null)
    const milestoneOffer = payload.redeemMilestoneOffer ? milestoneProgress.bestEligibleOffer : null
    if (payload.redeemMilestoneOffer && !milestoneOffer) {
      throw conflict('This special offer is not available yet for this guest.', 'milestone_offer_unavailable')
    }
    if (milestoneOffer && user?.id) {
      const { rows: activeRedemptionRows } = await db.query(
        `SELECT id
         FROM bookings
         WHERE user_id = $1
           AND status = 'payment_pending'
           AND hold_expires_at > now()
           AND metadata ? 'milestoneRedemption'
         LIMIT 1
         FOR UPDATE`,
        [user.id],
      )
      if (activeRedemptionRows[0]) {
        throw conflict('A special offer is already reserved in another pending checkout. Complete or let that hold expire first.', 'milestone_offer_already_reserved')
      }
    }
    const milestoneDiscount = calculateMilestoneOfferDiscount(milestoneOffer, afterOfferSubtotal)
    const bookingMetadata = {
      pricing: {
        roomSubtotal: Math.round((roomSubtotal + Number.EPSILON) * 100) / 100,
        rateCategory: availability[0].selected_rate_category || 'standard',
        amenitySubtotal: Math.round((amenitySubtotal + Number.EPSILON) * 100) / 100,
        grossSubtotal,
        offerDiscount: discountAmount,
        milestoneDiscount,
      },
      termsAndConditions: {
        accepted: true,
        version: payload.termsVersion || '2026-09-19',
        acceptedAt: new Date().toISOString(),
        source: 'room_booking',
      },
      selectedAmenities,
      gstClaim,
      ...(Number(payload.adults || 1) === 3 && availability[0]?.extra_bed_recommended
        ? {
            extraBed: {
              required: true,
              count: Number(availability[0].extra_bed_count || 1),
              note: 'Extra bed amenity added for requested adult occupancy.',
            },
          }
        : {}),
      ...(milestoneOffer
        ? {
            milestoneRedemption: {
              code: milestoneOffer.code,
              title: milestoneOffer.title,
              milestone: milestoneOffer.milestone,
              redeemOnBooking: milestoneOffer.redeemOnBooking,
              discountAmount: milestoneDiscount,
              faceValue: Number(milestoneOffer.discountAmount || 0),
              completedRoomBookings: milestoneProgress.completedRoomBookings,
              resetAfterConfirmation: true,
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
              roomTypeIds: appliedOffer.room_type_ids || [],
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
        currency, hold_expires_at, metadata, gst_claim
      )
      VALUES ($1,$2,$3,$4,$5,'payment_pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now() + interval '15 minutes', $19::jsonb, $20::jsonb)
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
        JSON.stringify(gstClaim),
      ],
    )

    const initialBooking = bookingRows[0]
    const taxableSubtotal = Math.max(0, Math.round((afterOfferSubtotal - milestoneDiscount + Number.EPSILON) * 100) / 100)
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
        milestoneDiscount,
      },
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
        milestoneOffer: milestoneOffer?.code || '',
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

export async function ensureBookingReceiptByInvoice(invoiceNumber) {
  const result = await transaction(async (db) => {
    const { rows: invoiceRows } = await db.query(
      `SELECT i.*
       FROM invoices i
       WHERE i.invoice_number = $1
       FOR UPDATE`,
      [invoiceNumber],
    )
    const invoice = invoiceRows[0]
    if (!invoice) throw notFound('Receipt not found')
    return loadReceiptData(db, invoice.booking_id, invoice)
  })

  const pdf = await generateBookingPdf(result)
  await query('UPDATE invoices SET pdf_url = $1 WHERE id = $2', [pdf.publicUrl, result.invoice.id])
  return { ...pdf, invoice: { ...result.invoice, pdf_url: pdf.publicUrl } }
}

export async function ensureBookingReceipt(bookingId) {
  const result = await transaction(async (db) => {
    const { rows: bookingRows } = await db.query(
      `SELECT id, hotel_id, booking_reference
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId],
    )
    const booking = bookingRows[0]
    if (!booking) throw notFound('Booking not found')
    const { rows: invoiceRows } = await db.query(
      `INSERT INTO invoices (hotel_id, booking_id, invoice_number, status, issued_at)
       VALUES ($1, $2, $3, 'issued', now())
       ON CONFLICT (booking_id) DO UPDATE
       SET status = 'issued',
           issued_at = coalesce(invoices.issued_at, now())
       RETURNING *`,
      [booking.hotel_id, booking.id, `INV-${booking.booking_reference}`],
    )
    return loadReceiptData(db, booking.id, invoiceRows[0])
  })

  const pdf = await generateBookingPdf(result)
  await query('UPDATE invoices SET pdf_url = $1 WHERE id = $2', [pdf.publicUrl, result.invoice.id])
  return { ...pdf, invoice: { ...result.invoice, pdf_url: pdf.publicUrl } }
}

async function loadReceiptData(db, bookingId, invoice) {
  const [{ rows: bookingRows }, { rows: hotelRows }] = await Promise.all([
    db.query(
      `SELECT b.*,
              h.name AS hotel_name,
              coalesce(rt.name, b.room_snapshot->>'name') AS room_type_name
       FROM bookings b
       JOIN hotels h ON h.id = b.hotel_id
       LEFT JOIN room_types rt ON rt.id = b.room_type_id
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId],
    ),
    db.query(
      `SELECT h.*
       FROM hotels h
       JOIN bookings b ON b.hotel_id = h.id
       WHERE b.id = $1
       LIMIT 1`,
      [bookingId],
    ),
  ])
  const booking = bookingRows[0]
  if (!booking) throw notFound('Booking not found')
  const room = booking.room_type_id
    ? (await db.query(
        `SELECT id, name, slug, description, occupancy_adults, occupancy_children,
                base_price, offer_price, size_sqft, bed_type, amenities,
                amenity_items, hero_image_url, gallery
         FROM room_types
         WHERE id = $1
         LIMIT 1`,
        [booking.room_type_id],
      )).rows[0]
    : snapshotRoom(booking.room_snapshot)
  return { booking, hotel: hotelRows[0], room, invoice }
}

function snapshotRoom(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object') return null
  return {
    id: snapshot.id || null,
    name: snapshot.name || 'Deleted room category',
    slug: snapshot.slug || '',
    description: snapshot.description || 'Room details captured at booking time.',
    bed_type: snapshot.bed_type || null,
    size_sqft: snapshot.size_sqft || null,
    amenities: snapshot.amenities || [],
    amenity_items: snapshot.amenity_items || [],
    hero_image_url: snapshot.hero_image_url || null,
    gallery: snapshot.gallery || [],
  }
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
