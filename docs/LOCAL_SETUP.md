# Local Setup Checklist

## Environment Files

The backend reads private variables from the root `.env`.

The frontend now also reads public `VITE_*` variables from the root `.env`. Only variables beginning with `VITE_` are exposed to React.

## Firebase Admin

Use one of these formats.

Recommended local format:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

Alternative, only if you keep the JSON on a single line:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"..."}
```

If `FIREBASE_SERVICE_ACCOUNT_JSON` is split across multiple lines, the backend cannot parse it.

## Production Bootstrap

The SQL seed intentionally creates no hotels. Run migrations first:

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/seeds/001_initial_hotels.sql
```

To remove only the old demo hotels from an existing Neon database:

```bash
psql "$DATABASE_URL" -f database/maintenance/remove_demo_data.sql
```

To completely empty application data while keeping the schema:

```bash
psql "$DATABASE_URL" -f database/maintenance/empty_app_data.sql
```

## Super Admin Login

Create the first super admin with Firebase Auth and PostgreSQL linked together:

```powershell
$env:SUPER_ADMIN_EMAIL="owner@example.com"
$env:SUPER_ADMIN_PASSWORD="ChangeMe123!"
$env:SUPER_ADMIN_NAME="Platform Owner"
npm run bootstrap:super-admin
```

Then start the app:

```powershell
npm run dev
```

Log in at:

```text
http://localhost:5173/login
```

After login, the app redirects super admins to `/super-admin`. From there, create the first hotel and its hotel admin.

Alternative manual bootstrap: create one Firebase Authentication user in the Firebase console, copy that user's UID, edit `database/bootstrap/create_super_admin_template.sql`, and run the edited SQL once.
