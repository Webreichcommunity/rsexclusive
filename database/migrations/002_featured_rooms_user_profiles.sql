ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS show_on_homepage boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_room_types_homepage
  ON room_types(hotel_id, show_on_homepage, created_at DESC);
