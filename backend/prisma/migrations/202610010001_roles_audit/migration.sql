-- Existing installations use db push. This additive upgrade preserves all audit rows.
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'USER';
-- Audit targets can be employees as well as assets; entityType identifies the target.
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_entityId_fkey";
CREATE INDEX IF NOT EXISTS "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
ALTER TABLE "employees" ALTER COLUMN "password" DROP DEFAULT;
-- Saved permission matrix; roles without a row use the built-in defaults.
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role" "UserRole" NOT NULL,
  "permissions" TEXT[],
  "updatedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role")
);
