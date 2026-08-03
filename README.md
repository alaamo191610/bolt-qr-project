# Bolt QR Restaurant Platform

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`, then set `DATABASE_URL` and a private `JWT_SECRET`.

3. Synchronize the local database schema:

   ```bash
   npx prisma db push --schema server/prisma/schema.prisma
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

The API runs at `http://localhost:3000/api`. For local development, `.env` should include:

```dotenv
VITE_API_URL=http://localhost:3000/api
CORS_ORIGINS=http://localhost:5173,http://localhost:5175
PORT=3000
```
