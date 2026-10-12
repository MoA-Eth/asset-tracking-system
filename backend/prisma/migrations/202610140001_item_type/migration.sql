-- Item type: fixed asset (FIXED) or consumable item (CONSUMABLE), chosen when an item is received.
-- Every item that exists already was registered as a fixed asset, so the column defaults to FIXED.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ItemType') THEN
    CREATE TYPE "ItemType" AS ENUM ('FIXED', 'CONSUMABLE');
  END IF;
END $$;

ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "itemType" "ItemType" NOT NULL DEFAULT 'FIXED';
