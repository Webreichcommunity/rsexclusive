import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { env } from '../config/env.js'

let client
const ROUTE_NOTE_KEYS = ['bookingId', 'hotelId', 'hotelSlug']

export function getRazorpayClient() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    return null
  }
  if (!client) {
    client = new Razorpay({
      key_id: env.razorpay.keyId,
      key_secret: env.razorpay.keySecret,
    })
  }
  return client
}

export function getHotelPaymentRoute(hotel = {}) {
  const paymentConfig = hotel.payment_config || {}
  const configuredType = paymentConfig.routingType || paymentConfig.routing_type
  if (configuredType === 'primary') return { type: 'primary', accountId: '', source: 'hotel' }

  const linkedAccountId = normalizeAccountId(
    paymentConfig.linkedAccountId ||
    paymentConfig.linked_account_id ||
    paymentConfig.razorpayLinkedAccountId ||
    paymentConfig.razorpay_linked_account_id,
  )
  if (linkedAccountId) return { type: 'linked', accountId: linkedAccountId, source: 'hotel' }

  const accountIdFromEnv = findRouteAccountFromEnv(hotel)
  if (accountIdFromEnv) return { type: 'linked', accountId: accountIdFromEnv, source: 'env' }

  return { type: 'primary', accountId: '', source: 'default' }
}

export function buildRouteTransfers({ hotel, amountPaise, currency, notes = {} }) {
  const route = getHotelPaymentRoute(hotel)
  if (route.type !== 'linked') return []
  return [{
    account: route.accountId,
    amount: amountPaise,
    currency,
    notes: {
      bookingId: notes.bookingId || '',
      hotelId: notes.hotelId || hotel?.id || '',
      hotelSlug: hotel?.slug || '',
      hotelName: hotel?.name || '',
      receipt: notes.receipt || '',
    },
    linked_account_notes: ROUTE_NOTE_KEYS,
    on_hold: false,
  }]
}

export async function createRazorpayOrder({ amount, currency, receipt, notes, hotel }) {
  const razorpay = getRazorpayClient()
  const amountPaise = Math.round(Number(amount) * 100)
  const transfers = buildRouteTransfers({ hotel, amountPaise, currency, notes: { ...notes, receipt } })
  const route = getHotelPaymentRoute(hotel)
  const orderPayload = {
    amount: amountPaise,
    currency,
    receipt,
    notes,
    payment_capture: 1,
    ...(transfers.length ? { transfers } : {}),
  }

  if (!razorpay) {
    return {
      id: `order_dev_${receipt}`,
      amount: amountPaise,
      currency,
      receipt,
      notes,
      ...(transfers.length ? { transfers } : {}),
      paymentRouting: route,
    }
  }

  const order = await razorpay.orders.create(orderPayload)
  return { ...order, paymentRouting: route }
}

export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!env.razorpay.keySecret) return signature?.startsWith('dev_signature_')

  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')

  if (!signature || signature.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''))
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret) return true
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex')
  if (!signature || signature.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''))
}

function findRouteAccountFromEnv(hotel = {}) {
  const keys = [
    hotel.id,
    hotel.slug,
    hotel.subdomain,
    hotel.name,
  ].map(normalizeRouteKey).filter(Boolean)
  for (const key of keys) {
    const accountId = normalizeAccountId(env.razorpay.routeAccounts?.[key])
    if (accountId) return accountId
  }
  return ''
}

function normalizeRouteKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function normalizeAccountId(value) {
  return String(value || '').trim()
}
