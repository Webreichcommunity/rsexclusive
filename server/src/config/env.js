import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootEnvPath = path.resolve(__dirname, '..', '..', '..', '.env')
const serverEnvPath = path.resolve(__dirname, '..', '..', '.env')

dotenv.config({ path: rootEnvPath })
dotenv.config({ path: serverEnvPath, override: true })

const requiredInProduction = ['DATABASE_URL', 'CLIENT_ORIGINS', 'PRIMARY_DOMAIN']

for (const key of requiredInProduction) {
  if (process.env.NODE_ENV === 'production' && !process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  clientOrigins: (process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  primaryDomain: process.env.PRIMARY_DOMAIN || 'localhost',
  localTenantQueryParam: process.env.LOCAL_TENANT_QUERY_PARAM || 'hotel',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || 'R.S. Exclusive <bookings@example.com>',
  },
  receipts: {
    publicBaseUrl: process.env.PUBLIC_RECEIPT_BASE_URL || 'http://localhost:4000/receipts',
  },
}

export const isTest = env.nodeEnv === 'test'
