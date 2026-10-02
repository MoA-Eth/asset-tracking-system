-- Employee registry: staff who don't sign in, job titles, and deactivation. Additive; keeps every row.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "employees" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "role" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "password" DROP NOT NULL;
