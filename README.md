# R.S. Exclusive Stay & Fine Dine

Production-oriented multi-tenant hotel booking SaaS in one codebase, one Express backend, and one PostgreSQL database.

## Structure

- `client/` - Vite, React, Tailwind CSS, React Router.
- `server/` - Node.js, Express REST API, Firebase Admin auth, Razorpay, Cloudinary, Resend, PDF receipts.
- `database/` - Neon PostgreSQL migrations, clean production seed, and bootstrap templates.
- `docs/` - architecture and deployment notes.

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

The backend reads `.env` from the project root. The Vite frontend reads public `VITE_*` variables from `client/.env.local` when you need Firebase web config in the browser.

Local tenant switching after creating a hotel:

```text
http://localhost:5173/?hotel=your-hotel-subdomain
```

The backend requires `DATABASE_URL` for real database operations. Apply the schema and clean seed:

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/seeds/001_initial_hotels.sql
```

Bootstrap the first super admin:

```powershell
$env:SUPER_ADMIN_EMAIL="owner@example.com"
$env:SUPER_ADMIN_PASSWORD="ChangeMe123!"
$env:SUPER_ADMIN_NAME="Platform Owner"
npm run bootstrap:super-admin
```

That user can log in at `/login`, then open `/super-admin` and create real hotels, hotel admins, rooms, and inventory. To fully empty a Neon database while keeping schema, run `database/maintenance/empty_app_data.sql`.

## Verification

```bash
npm run lint
npm run test --workspace server
npm run build --workspace client
```

## Security Model

- Firebase Authentication handles identity only.
- PostgreSQL `users.role` and `hotel_admins` enforce application authorization.
- Hotel admin APIs derive tenant access from authenticated user mappings, never from frontend-provided `hotel_id`.
- Booking holds lock PostgreSQL inventory rows and revalidate server-side pricing before creating Razorpay orders.
- Booking confirmation occurs only after verified payment signature or verified idempotent webhook.
- Server-only secrets stay in backend environment variables.
