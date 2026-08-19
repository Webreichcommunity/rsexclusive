import express from 'express'
import { query, transaction } from '../db/pool.js'
import { confirmBookingPayment } from '../services/bookingService.js'
import { verifyWebhookSignature } from '../services/paymentService.js'
import { createAsyncRouter } from '../utils/asyncRouter.js'
import { forbidden } from '../utils/errors.js'

export const webhookRoutes = createAsyncRouter()

webhookRoutes.post('/razorpay', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    const signature = req.header('x-razorpay-signature')
    if (!verifyWebhookSignature(req.body, signature)) throw forbidden('Invalid webhook signature')

    const payload = JSON.parse(req.body.toString('utf8'))
    const eventId = payload.event_id || payload.payload?.payment?.entity?.id || `${payload.event}:${Date.now()}`

    const inserted = await transaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO webhook_events (provider, event_id, event_type, payload)
         VALUES ('razorpay', $1, $2, $3)
         ON CONFLICT (provider, event_id) DO NOTHING
         RETURNING id`,
        [eventId, payload.event, payload],
      )
      return rows[0]
    })

    if (!inserted) return res.json({ received: true, duplicate: true })

    if (payload.event === 'payment.captured' || payload.event === 'order.paid') {
      const payment = payload.payload?.payment?.entity
      const order = payload.payload?.order?.entity
      const orderId = payment?.order_id || order?.id
      const paymentId = payment?.id
      if (orderId && paymentId) {
        await query(`UPDATE payments SET raw_payload = raw_payload || $1::jsonb WHERE provider_order_id = $2`, [
          JSON.stringify(payload),
          orderId,
        ])
        await confirmBookingPayment({
          orderId,
          paymentId,
          signature: `webhook:${paymentId}`,
          trustedWebhook: true,
        })
      }
    }

    await query(`UPDATE webhook_events SET processed_at = now() WHERE provider = 'razorpay' AND event_id = $1`, [eventId])
    res.json({ received: true })
  } catch (error) {
    next(error)
  }
})
