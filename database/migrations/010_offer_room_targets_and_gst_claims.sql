ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS room_type_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS gst_claim jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_offers_room_type_ids
  ON offers USING gin(room_type_ids);
