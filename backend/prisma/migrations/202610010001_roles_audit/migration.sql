-- Existing installations use db push. This additive upgrade preserves all audit rows.
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'USER';
-- Audit targets can be employees as well as assets; entityType identifies the target.
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_entityId_fkey";
CREATE INDEX IF NOT EXISTS "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
ALTER TABLE "employees" ALTER COLUMN "password" DROP DEFAULT;
