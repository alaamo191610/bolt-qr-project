CREATE TABLE "restaurant_invitations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_by_super_admin_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "restaurant_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "restaurant_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "restaurant_invitations_created_by_super_admin_id_fkey" FOREIGN KEY ("created_by_super_admin_id") REFERENCES "super_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "restaurant_invitations_token_hash_key" ON "restaurant_invitations"("token_hash");
CREATE INDEX "restaurant_invitations_organization_id_created_at_idx" ON "restaurant_invitations"("organization_id", "created_at");
CREATE INDEX "restaurant_invitations_user_id_created_at_idx" ON "restaurant_invitations"("user_id", "created_at");
CREATE INDEX "restaurant_invitations_expires_at_idx" ON "restaurant_invitations"("expires_at");

CREATE TABLE "platform_audit_events" (
  "id" BIGSERIAL NOT NULL,
  "actor_super_admin_id" UUID,
  "organization_id" UUID,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_audit_events_actor_super_admin_id_fkey" FOREIGN KEY ("actor_super_admin_id") REFERENCES "super_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "platform_audit_events_actor_super_admin_id_created_at_idx" ON "platform_audit_events"("actor_super_admin_id", "created_at");
CREATE INDEX "platform_audit_events_organization_id_created_at_idx" ON "platform_audit_events"("organization_id", "created_at");
CREATE INDEX "platform_audit_events_entity_type_entity_id_created_at_idx" ON "platform_audit_events"("entity_type", "entity_id", "created_at");
