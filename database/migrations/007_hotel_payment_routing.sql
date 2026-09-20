ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS payment_config jsonb NOT NULL DEFAULT '{}'::jsonb;
