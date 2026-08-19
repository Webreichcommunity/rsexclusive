import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

test('Razorpay signature verification accepts correct HMAC', async () => {
  process.env.RAZORPAY_KEY_SECRET = 'test_secret'
  const { verifyPaymentSignature } = await import('../src/services/paymentService.js?payment-ok')
  const orderId = 'order_123'
  const paymentId = 'pay_123'
  const signature = crypto.createHmac('sha256', 'test_secret').update(`${orderId}|${paymentId}`).digest('hex')

  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature }), true)
})

test('Razorpay signature verification rejects tampering', async () => {
  process.env.RAZORPAY_KEY_SECRET = 'test_secret'
  const { verifyPaymentSignature } = await import('../src/services/paymentService.js?payment-bad')

  assert.equal(verifyPaymentSignature({ orderId: 'order_123', paymentId: 'pay_123', signature: 'bad' }), false)
})
