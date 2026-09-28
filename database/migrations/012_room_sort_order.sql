ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 1000;

CREATE INDEX IF NOT EXISTS idx_room_types_hotel_sort_order
  ON room_types(hotel_id, active, sort_order, created_at DESC);
