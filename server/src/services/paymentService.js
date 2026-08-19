import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { env } from '../config/env.js'

let client

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

export async function createRazorpayOrder({ amount, currency, receipt, notes }) {
  const razorpay = getRazorpayClient()
  const amountPaise = Math.round(Number(amount) * 100)

  if (!razorpay) {
    return {
      id: `order_dev_${receipt}`,
      amount: amountPaise,
      currency,
      receipt,
      notes,
    }
  }

  return razorpay.orders.create({
    amount: amountPaise,
    currency,
    receipt,
    notes,
    payment_capture: 1,
  })
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
