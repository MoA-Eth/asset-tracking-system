-- A password set by an administrator is temporary until the person changes it. Additive; keeps every row.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
