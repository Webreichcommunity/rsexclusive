import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

process.env.RAZORPAY_RS_LINKED_ACCOUNT_ID = 'acc_rs_env'
process.env.RAZORPAY_RG_LINKED_ACCOUNT_ID = 'acc_rg_env'

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

test('Razorpay Route sends linked hotel booking amount to the linked account', async () => {
  const { buildRouteTransfers, getHotelPaymentRoute } = await import('../src/services/paymentService.js?route-linked')
  const hotel = {
    id: 'hotel-rs',
    name: 'RS Exclusive Stay and Fine Dine',
    slug: 'rs-exclusive-stay-and-fine-dine',
    payment_config: { routingType: 'linked', linkedAccountId: 'acc_rs123' },
  }

  assert.deepEqual(getHotelPaymentRoute(hotel), { type: 'linked', accountId: 'acc_rs123', source: 'hotel' })
  assert.deepEqual(buildRouteTransfers({
    hotel,
    amountPaise: 379050,
    currency: 'INR',
    notes: { bookingId: 'booking-1', receipt: 'RS-123' },
  }), [{
    account: 'acc_rs123',
    amount: 379050,
    currency: 'INR',
    notes: {
      bookingId: 'booking-1',
      hotelId: 'hotel-rs',
      hotelSlug: 'rs-exclusive-stay-and-fine-dine',
      hotelName: 'RS Exclusive Stay and Fine Dine',
      receipt: 'RS-123',
    },
    linked_account_notes: ['bookingId', 'hotelId', 'hotelSlug'],
    on_hold: false,
  }])
})

test('Razorpay Route keeps primary hotel bookings on the main account', async () => {
  const { buildRouteTransfers, getHotelPaymentRoute } = await import('../src/services/paymentService.js?route-primary')
  const hotel = {
    id: 'hotel-ranjeet',
    name: 'Hotel Ranjeet',
    slug: 'hotel-ranjeet',
    payment_config: { routingType: 'primary', linkedAccountId: '' },
  }

  assert.deepEqual(getHotelPaymentRoute(hotel), { type: 'primary', accountId: '', source: 'hotel' })
  assert.deepEqual(buildRouteTransfers({ hotel, amountPaise: 250000, currency: 'INR' }), [])
})

test('Razorpay Route env fallbacks match deployed short hotel slugs', async () => {
  const { getHotelPaymentRoute } = await import('../src/services/paymentService.js?route-env-short-slugs')

  assert.deepEqual(
    getHotelPaymentRoute({ slug: 'rsexclusive', payment_config: {} }),
    { type: 'linked', accountId: 'acc_rs_env', source: 'env' },
  )
  assert.deepEqual(
    getHotelPaymentRoute({ slug: 'rgexclusive', payment_config: {} }),
    { type: 'linked', accountId: 'acc_rg_env', source: 'env' },
  )
})
