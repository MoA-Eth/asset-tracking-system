-- Stores and locations are normalised: a store contains locations. Existing rows are kept:
-- each old location's site becomes a store, and the old row becomes a location inside it,
-- so items keep pointing at the same place. Safe to run more than once.
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'REFERENCE';

CREATE TABLE IF NOT EXISTS "stores" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL DEFAULT '',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "stores_name_key" ON "stores"("name");

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "storeId" TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "name" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'siteName') THEN
    -- One store per site; its address is the first building recorded for that site
    INSERT INTO "stores" ("id", "name", "address", "isActive")
    SELECT 'STR-' || upper(substr(md5("siteName"), 1, 8)), "siteName", COALESCE(min(NULLIF("building", '')), ''), bool_or("isActive")
    FROM "locations"
    GROUP BY "siteName"
    ON CONFLICT DO NOTHING;

    -- The old row becomes a location in that store, named after its room (or building)
    UPDATE "locations" l
    SET "storeId" = 'STR-' || upper(substr(md5(l."siteName"), 1, 8)),
        "name" = COALESCE(NULLIF(l."roomNumber", ''), NULLIF(l."building", ''), 'Main store');

    -- Two rooms with the same name at one site: keep both, numbered
    UPDATE "locations" l
    SET "name" = l."name" || ' (' || d.n || ')'
    FROM (SELECT "id", row_number() OVER (PARTITION BY "storeId", "name" ORDER BY "id") AS n FROM "locations") d
    WHERE d."id" = l."id" AND d.n > 1;

    ALTER TABLE "locations" DROP COLUMN "siteName", DROP COLUMN "building", DROP COLUMN "roomNumber", DROP COLUMN "isCentralStore";
  END IF;
END $$;

ALTER TABLE "locations" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "locations" ALTER COLUMN "name" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "locations_storeId_name_key" ON "locations"("storeId", "name");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_storeId_fkey') THEN
    ALTER TABLE "locations" ADD CONSTRAINT "locations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
