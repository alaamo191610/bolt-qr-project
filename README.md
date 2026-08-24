# QR Restaurant Platform

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`, then set the runtime-only `DATABASE_URL`, the separate owner
   `MIGRATION_DATABASE_URL`, a private `JWT_SECRET`, and an independent
   `SUPER_ADMIN_MFA_ENCRYPTION_KEY` (`openssl rand -hex 32`).

3. Synchronize the local database schema:

   ```bash
   npm run migrate:deploy
   ```

4. Start the API in one terminal:

   ```bash
   npm run server
   ```

5. Start the website on port 5175 in another terminal:

   ```bash
   npm run dev:5175
   ```

Open [the super-admin login](http://localhost:5175/super-admin/login?lang=en).

For the Phase 1 VPS topology, deployment, security boundaries, encrypted off-VPS backup, isolated
restore rehearsal, Sentry/uptime validation, and rollback procedure, see the
[single-VPS pilot runbook](docs/operations/single-vps-pilot-runbook.md).

The API runs at `http://localhost:3000/api`. For local development, `.env` should include:

```dotenv
VITE_API_URL=http://localhost:3000/api
CORS_ORIGINS=http://localhost:5173,http://localhost:5175
PORT=3000
```
