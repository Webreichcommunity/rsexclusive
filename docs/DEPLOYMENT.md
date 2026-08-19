# Deployment Notes

## Environment

Copy `.env.example` into environment-specific secret stores. Do not put secrets in React variables unless they are explicitly public Firebase web config values.

## Neon

Run migrations in order:

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/seeds/001_initial_hotels.sql
```

The seed is clean and does not create demo hotels. Bootstrap the first super admin with `database/bootstrap/create_super_admin_template.sql`, then create real tenants from the Super Admin console.

## Render Backend

- Build command: `npm install`
- Start command: `npm run start --workspace server`
- Health check: `/health`
- Set `DATABASE_URL`, Firebase Admin, Razorpay, Cloudinary, and Resend variables.

## Vercel Frontend

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Set only `VITE_*` public variables.

## DNS

- Main brand: `www.domain.com`
- Hotel tenants: `hotel-subdomain.domain.com`
- Super admin: `admin.domain.com` or `/super-admin` on the primary app.

Local switching works with `http://localhost:5173/?hotel=hotel-subdomain`.
