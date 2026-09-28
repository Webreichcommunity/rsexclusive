ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS offer_kind text NOT NULL DEFAULT 'applied'
    CHECK (offer_kind IN ('applied', 'showcase'));

CREATE INDEX IF NOT EXISTS idx_offers_hotel_kind_active
  ON offers(hotel_id, offer_kind, active, starts_at, ends_at);
