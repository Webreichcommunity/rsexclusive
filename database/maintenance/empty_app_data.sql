-- Destructive: clears all application data but keeps the schema, enums, indexes,
-- and triggers. Use this for a clean Neon database before real onboarding.

BEGIN;

TRUNCATE TABLE
  webhook_events,
  audit_logs,
  media_assets,
  hotel_content,
  offers,
  loyalty_transactions,
  loyalty_accounts,
  invoices,
  payments,
  booking_guests,
  bookings,
  room_inventory,
  rooms,
  room_types,
  customers,
  hotel_admins,
  users,
  hotels
RESTART IDENTITY CASCADE;

COMMIT;
