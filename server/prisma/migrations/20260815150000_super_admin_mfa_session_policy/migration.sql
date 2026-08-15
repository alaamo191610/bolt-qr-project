-- Existing SuperAdmins must enroll TOTP on their next password login. No
-- password-only session remains valid after the application rollout because
-- new sessions require MFA/session-version claims.
ALTER TABLE "super_admins"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "mfa_secret_encrypted" TEXT,
  ADD COLUMN "mfa_enabled_at" TIMESTAMPTZ,
  ADD COLUMN "mfa_last_used_step" BIGINT,
  ADD COLUMN "mfa_recovery_code_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "mfa_failed_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mfa_locked_until" TIMESTAMPTZ;

ALTER TABLE "super_admins"
  ADD CONSTRAINT "super_admins_session_version_positive" CHECK ("session_version" > 0),
  ADD CONSTRAINT "super_admins_mfa_failed_attempts_range" CHECK (
    "mfa_failed_attempts" >= 0 AND "mfa_failed_attempts" < 5
  ),
  ADD CONSTRAINT "super_admins_mfa_enrollment_consistent" CHECK (
    "mfa_enabled_at" IS NULL OR "mfa_secret_encrypted" IS NOT NULL
  );

CREATE INDEX "super_admins_active_idx" ON "super_admins"("active");
