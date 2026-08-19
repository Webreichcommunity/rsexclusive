-- Replace these values with the Firebase Authentication user you create first.
-- Run this once after migrations so that user can log in to /super-admin.

INSERT INTO users (firebase_uid, email, full_name, phone, role)
VALUES (
  'PASTE_FIREBASE_UID_HERE',
  'owner@example.com',
  'Platform Owner',
  '+910000000000',
  'super_admin'
)
ON CONFLICT (firebase_uid) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  phone = EXCLUDED.phone,
  role = 'super_admin',
  disabled_at = null,
  updated_at = now();
