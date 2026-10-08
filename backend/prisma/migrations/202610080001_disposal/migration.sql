-- Disposal workflow: new statuses and request type
ALTER TYPE "ItemStatus" ADD VALUE IF NOT EXISTS 'PENDING_DISPOSAL';
ALTER TYPE "ItemStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'DISPOSAL';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'DISPOSAL';

-- Moving rejected receipts from DISPOSED to REJECTED, and granting the new "Request disposals"
-- permission to saved role settings, is done by the API when it starts (src/services/upgrades.service.ts):
-- PostgreSQL can't use a new enum value in the same transaction that adds it.
