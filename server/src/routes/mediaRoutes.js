import { v2 as cloudinary } from 'cloudinary'
import { z } from 'zod'
import { env } from '../config/env.js'
import { authenticate, requireHotelAdmin } from '../middleware/auth.js'
import { requireTenant } from '../middleware/tenant.js'
import { validate } from '../middleware/validate.js'
import { query } from '../db/pool.js'
import { createAsyncRouter } from '../utils/asyncRouter.js'

export const mediaRoutes = createAsyncRouter()

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
})

const uploadSignatureSchema = z.object({
  folder: z.string().min(2).max(80).default('hotel-gallery'),
})

mediaRoutes.post('/signature', requireTenant, authenticate, requireHotelAdmin, validate(uploadSignatureSchema), async (req, res) => {
  const timestamp = Math.round(Date.now() / 1000)
  const folder = `rs-exclusive/${req.hotel.slug}/${req.body.folder}`
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, env.cloudinary.apiSecret || 'dev')
  res.json({
    cloudName: env.cloudinary.cloudName,
    apiKey: env.cloudinary.apiKey,
    timestamp,
    folder,
    signature,
  })
})

mediaRoutes.post('/record', requireTenant, authenticate, requireHotelAdmin, validate(z.object({
  entityType: z.string().min(2),
  entityId: z.string().uuid().optional(),
  cloudinaryPublicId: z.string().min(2),
  secureUrl: z.string().url(),
  altText: z.string().optional(),
  metadata: z.record(z.any()).default({}),
})), async (req, res) => {
  const body = req.body
  const { rows } = await query(
    `INSERT INTO media_assets (hotel_id, entity_type, entity_id, cloudinary_public_id, secure_url, alt_text, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [req.hotel.id, body.entityType, body.entityId || null, body.cloudinaryPublicId, body.secureUrl, body.altText || null, body.metadata],
  )
  res.status(201).json({ asset: rows[0] })
})
