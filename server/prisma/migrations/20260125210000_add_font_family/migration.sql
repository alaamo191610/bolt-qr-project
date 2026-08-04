-- Add the admin font preference to the canonical Prisma migration chain.
-- The legacy root-level SQL targeted a pre-Prisma table name (`admin`) and
-- was never part of Prisma's migration history.
ALTER TABLE "admins"
ADD COLUMN IF NOT EXISTS "font_family" TEXT DEFAULT 'Inter';
