import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { corsOrigin } from './config/cors.js'
import { errorHandler } from './middleware/errorHandler.js'
import { publicRoutes } from './routes/publicRoutes.js'
import { adminRoutes } from './routes/adminRoutes.js'
import { superAdminRoutes } from './routes/superAdminRoutes.js'
import { webhookRoutes } from './routes/webhookRoutes.js'
import { mediaRoutes } from './routes/mediaRoutes.js'
import { receiptRoutes } from './routes/receiptRoutes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    }),
  )
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }))

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'rs-exclusive-api' }))
  app.use('/api/webhooks', webhookRoutes)
  app.use(express.json({ limit: '1mb' }))
  app.use('/receipts', receiptRoutes)
  app.use('/receipts', express.static(path.resolve(__dirname, '..', 'receipts')))

  app.use('/api', publicRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/super-admin', superAdminRoutes)
  app.use('/api/media', mediaRoutes)

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } })
  })
  app.use(errorHandler)

  return app
}
