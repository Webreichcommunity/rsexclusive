ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS redemption_limit_per_user int NOT NULL DEFAULT 1
    CHECK (redemption_limit_per_user >= 0);

CREATE INDEX IF NOT EXISTS idx_bookings_offer_usage
  ON bookings(user_id, (metadata->'offer'->>'id'), status, hold_expires_at)
  WHERE metadata ? 'offer';
