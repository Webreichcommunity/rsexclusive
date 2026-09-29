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
- Set `PRIMARY_DOMAIN=www.ranjeetgroupofhotels.in`.
- Set `CLIENT_ORIGINS=https://www.ranjeetgroupofhotels.in,https://ranjeetgroupofhotels.in`.
- If you test from the default Vercel URL before the custom domain is live, add that exact `https://your-project.vercel.app` URL to `CLIENT_ORIGINS` too.

## Vercel Frontend

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Set only `VITE_*` public variables.
- Set `VITE_API_BASE_URL=https://rsexclusive.onrender.com/api`.
- Set `VITE_PRIMARY_DOMAIN=www.ranjeetgroupofhotels.in`.
- Add the deployed Vercel/custom domains in Firebase Authentication > Settings > Authorized domains, otherwise Firebase sign-in can succeed locally but fail or loop after deployment.

## DNS

- Main brand: `www.ranjeetgroupofhotels.in`
- Hotel pages: `/rsexclusive`, `/rgexclusive`, and `/ranjeethotel` on the primary app.
- Super admin: `/super-admin` on the primary app.

Set `VITE_PRIMARY_DOMAIN` for the frontend and `PRIMARY_DOMAIN` for the backend to `www.ranjeetgroupofhotels.in`. The public sitemap and canonical URLs target `https://www.ranjeetgroupofhotels.in/`.

Local switching works with localhost subdomains, for example `http://hotel-ranjeet.localhost:5173/`.
