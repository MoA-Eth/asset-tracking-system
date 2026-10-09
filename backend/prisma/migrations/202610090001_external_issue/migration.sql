-- Issue to an outside organization: who holds an issued record when it isn't an employee
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "heldByOrganization" TEXT;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "heldByContact" TEXT;
