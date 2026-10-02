-- Locations and stores can be deactivated; changes to them are audited. Additive; keeps every row.
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'REFERENCE';
