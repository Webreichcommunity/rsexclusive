CREATE TABLE IF NOT EXISTS hotel_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  icon text NOT NULL DEFAULT 'sparkles',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, name)
);

ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS offer_price numeric(12,2) CHECK (offer_price IS NULL OR offer_price >= 0),
  ADD COLUMN IF NOT EXISTS amenity_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'general'
    CHECK (audience_type IN ('general', 'repeat_guest')),
  ADD COLUMN IF NOT EXISTS min_completed_bookings int NOT NULL DEFAULT 0 CHECK (min_completed_bookings >= 0),
  ADD COLUMN IF NOT EXISTS badge text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS highlight_color text NOT NULL DEFAULT '#f59e0b',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_hotel_amenities_hotel_active
  ON hotel_amenities(hotel_id, active, name);

CREATE INDEX IF NOT EXISTS idx_offers_hotel_audience_active
  ON offers(hotel_id, audience_type, active, starts_at, ends_at);

DROP TRIGGER IF EXISTS hotel_amenities_updated_at ON hotel_amenities;
CREATE TRIGGER hotel_amenities_updated_at BEFORE UPDATE ON hotel_amenities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS offers_updated_at ON offers;
CREATE TRIGGER offers_updated_at BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
