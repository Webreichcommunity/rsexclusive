# R.S. Exclusive Multi-Tenant SaaS Architecture

This platform is one codebase, one Express API, and one PostgreSQL database serving many independent hotel tenants.

## Tenancy

- `hotels.id` is the tenant key for hotel-specific data.
- Public tenant resolution uses subdomain first, custom domain second, and `?hotel=hotel-subdomain` only as a compatibility fallback.
- React may send a tenant hint, but authorization never trusts a frontend `hotel_id`.
- Hotel admin authorization is derived from `hotel_admins` joined to the authenticated PostgreSQL `users` row.
- Super admins operate across tenants through separate protected routes and backend role checks.

## Runtime Shape

- `client/`: Vite React app with tenant-aware public hotel pages, customer account, hotel admin, and super admin.
- `server/`: Node.js Express REST API, Firebase token verification, PostgreSQL transactions, Razorpay, Cloudinary, Resend, and PDF generation.
- `database/`: SQL migrations and seed data for Neon PostgreSQL.
- `docs/`: deployment, environment, security, and data design notes.

## Booking Reliability

Availability and pricing are calculated on the server. Creating a checkout hold runs in a PostgreSQL transaction:

1. Resolve hotel from host/query.
2. Lock matching `room_inventory` rows with `FOR UPDATE`.
3. Reject closed, missing, or insufficient rows.
4. Compute subtotal and tax from locked inventory prices.
5. Increment `reserved_rooms` for each stayed night.
6. Create a `payment_pending` booking and Razorpay order.
7. Store a payment record linked to the Razorpay order.

Booking confirmation only happens after Razorpay signature/webhook verification. Webhooks are stored in `webhook_events` with a unique provider event id for idempotency.

## Auth

Firebase Authentication is the identity provider. The backend verifies ID tokens using Firebase Admin SDK and then loads the application role from `users`. PostgreSQL stores Firebase UID, roles, hotel admin mappings, customers, bookings, and operational data. Firebase passwords are never stored.

## Design System

The UI uses ivory backgrounds, charcoal text, soft neutral borders, and orange as a controlled booking/action accent. Public hotel pages emphasize immersive photography and simple booking. Admin panels use dense, quiet SaaS layouts with hospitality-specific metrics and workflows.

## Deployment

- Frontend: Vercel, with `VITE_API_BASE_URL` and Firebase public config only.
- Backend: Render, with all server-only secrets.
- Database: Neon PostgreSQL using `DATABASE_URL`.
- Images: Cloudinary URLs and metadata stored in PostgreSQL.
- Payments: Razorpay order creation, signature verification, and webhook handling only on the backend.
- Email: Resend transactional confirmation after booking confirmation.
