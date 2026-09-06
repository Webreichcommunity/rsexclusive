CREATE TABLE IF NOT EXISTS hotel_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  rating int NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'archived')),
  source text NOT NULL DEFAULT 'website',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_feedback_hotel_created
  ON hotel_feedback(hotel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hotel_feedback_user
  ON hotel_feedback(user_id, created_at DESC);

DROP TRIGGER IF EXISTS hotel_feedback_updated_at ON hotel_feedback;
CREATE TRIGGER hotel_feedback_updated_at BEFORE UPDATE ON hotel_feedback FOR EACH ROW EXECUTE FUNCTION set_updated_at();
