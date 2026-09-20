CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('customer', 'hotel_admin', 'super_admin');
CREATE TYPE booking_status AS ENUM ('pending', 'payment_pending', 'confirmed', 'cancelled', 'completed', 'failed');
CREATE TYPE payment_status AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'void');

CREATE TABLE hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text,
  subdomain text NOT NULL UNIQUE,
  custom_domain text UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  description text NOT NULL DEFAULT '',
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  amenities text[] NOT NULL DEFAULT '{}',
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  hero_image_url text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  currency char(3) NOT NULL DEFAULT 'INR',
  tax_rate numeric(5,2) NOT NULL DEFAULT 5.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  role user_role NOT NULL DEFAULT 'customer',
  default_hotel_id uuid REFERENCES hotels(id) ON DELETE SET NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hotel_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, user_id)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, user_id)
);

CREATE TABLE room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL,
  occupancy_adults int NOT NULL CHECK (occupancy_adults > 0),
  occupancy_children int NOT NULL DEFAULT 0 CHECK (occupancy_children >= 0),
  base_price numeric(12,2) NOT NULL CHECK (base_price >= 0),
  rate_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  size_sqft int,
  bed_type text,
  amenities text[] NOT NULL DEFAULT '{}',
  hero_image_url text,
  gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  show_on_homepage boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, slug)
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  floor text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, room_number)
);

CREATE TABLE room_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  stay_date date NOT NULL,
  total_rooms int NOT NULL CHECK (total_rooms >= 0),
  reserved_rooms int NOT NULL DEFAULT 0 CHECK (reserved_rooms >= 0),
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  rate_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_nights int NOT NULL DEFAULT 1 CHECK (min_nights > 0),
  closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, room_type_id, stay_date),
  CHECK (reserved_rooms <= total_rooms)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  booking_reference text NOT NULL UNIQUE,
  status booking_status NOT NULL DEFAULT 'pending',
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights int NOT NULL CHECK (nights > 0),
  rooms_count int NOT NULL DEFAULT 1 CHECK (rooms_count > 0),
  adults int NOT NULL CHECK (adults > 0),
  children int NOT NULL DEFAULT 0 CHECK (children >= 0),
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_phone text,
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  tax_amount numeric(12,2) NOT NULL CHECK (tax_amount >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  razorpay_order_id text UNIQUE,
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);

CREATE TABLE booking_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  age int,
  document_type text,
  document_last4 text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'razorpay',
  provider_order_id text NOT NULL,
  provider_payment_id text,
  provider_signature text,
  status payment_status NOT NULL DEFAULT 'created',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_order_id),
  UNIQUE (provider, provider_payment_id)
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  status invoice_status NOT NULL DEFAULT 'draft',
  pdf_url text,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid REFERENCES hotels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'hotel' CHECK (scope IN ('hotel', 'group')),
  points_balance int NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  tier text NOT NULL DEFAULT 'ember',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, user_id, scope)
);

CREATE TABLE loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loyalty_account_id uuid NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  points int NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  code text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE hotel_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  content_key text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, content_key)
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid REFERENCES hotels(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  cloudinary_public_id text NOT NULL,
  secure_url text NOT NULL,
  alt_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid REFERENCES hotels(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_hotel_admins_user ON hotel_admins(user_id);
CREATE INDEX idx_customers_user ON customers(user_id);
CREATE INDEX idx_room_types_hotel_active ON room_types(hotel_id, active);
CREATE INDEX idx_rooms_hotel_type ON rooms(hotel_id, room_type_id);
CREATE INDEX idx_inventory_lookup ON room_inventory(hotel_id, room_type_id, stay_date);
CREATE INDEX idx_bookings_hotel_dates ON bookings(hotel_id, check_in, check_out);
CREATE INDEX idx_bookings_user ON bookings(user_id, created_at DESC);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_audit_logs_hotel_created ON audit_logs(hotel_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hotels_updated_at BEFORE UPDATE ON hotels FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER room_types_updated_at BEFORE UPDATE ON room_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER room_inventory_updated_at BEFORE UPDATE ON room_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER hotel_content_updated_at BEFORE UPDATE ON hotel_content FOR EACH ROW EXECUTE FUNCTION set_updated_at();
