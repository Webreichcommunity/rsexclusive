import { query } from '../db/pool.js'
import { createOrUpdateFirebaseUser } from '../services/firebaseAdminService.js'

const email = process.env.SUPER_ADMIN_EMAIL
const password = process.env.SUPER_ADMIN_PASSWORD
const fullName = process.env.SUPER_ADMIN_NAME || 'Platform Owner'
const phone = process.env.SUPER_ADMIN_PHONE || undefined

if (!email || !password) {
  console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD before running this script.')
  console.error('Example: $env:SUPER_ADMIN_EMAIL="owner@example.com"; $env:SUPER_ADMIN_PASSWORD="ChangeMe123!"')
  process.exit(1)
}

try {
  const firebaseUser = await createOrUpdateFirebaseUser({
    email,
    password,
    fullName,
    phone,
  })

  const { rows } = await query(
    `INSERT INTO users (firebase_uid, email, full_name, phone, role)
     VALUES ($1, $2, $3, $4, 'super_admin')
     ON CONFLICT (firebase_uid) DO UPDATE SET
       email = EXCLUDED.email,
       full_name = EXCLUDED.full_name,
       phone = EXCLUDED.phone,
       role = 'super_admin',
       disabled_at = null,
       updated_at = now()
     RETURNING id, email, full_name, role`,
    [firebaseUser.uid, email, fullName, phone || null],
  )

  console.log(`Super admin ready: ${rows[0].email} (${rows[0].role})`)
  process.exit(0)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
