ALTER TABLE hotels
  ALTER COLUMN tax_rate SET DEFAULT 5.00;

UPDATE hotels
SET tax_rate = 5.00;

ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS rate_options jsonb NOT NULL DEFAULT '{}'::jsonb;
