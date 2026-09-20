ALTER TABLE room_inventory
  ADD COLUMN IF NOT EXISTS rate_options jsonb NOT NULL DEFAULT '{}'::jsonb;
