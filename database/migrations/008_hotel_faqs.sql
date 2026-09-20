CREATE TABLE IF NOT EXISTS hotel_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_faqs_hotel_active
  ON hotel_faqs(hotel_id, active, sort_order, created_at DESC);

DROP TRIGGER IF EXISTS hotel_faqs_updated_at ON hotel_faqs;
CREATE TRIGGER hotel_faqs_updated_at BEFORE UPDATE ON hotel_faqs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
