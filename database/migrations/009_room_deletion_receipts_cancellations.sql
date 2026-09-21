ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS room_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE bookings
  ALTER COLUMN room_type_id DROP NOT NULL;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_room_type_id_fkey;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_room_type_id_fkey
  FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS booking_cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason_option text NOT NULL,
  reason_text text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected')),
  refund_amount numeric(12,2) CHECK (refund_amount IS NULL OR refund_amount >= 0),
  admin_message text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_hotel_status
  ON booking_cancellation_requests(hotel_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_user
  ON booking_cancellation_requests(user_id, requested_at DESC);
