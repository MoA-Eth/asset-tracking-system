-- Store men: the employees who keep each store (named on its vouchers, offered in its forms)
CREATE TABLE IF NOT EXISTS "store_keepers" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_keepers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_keepers_storeId_employeeId_key" ON "store_keepers"("storeId", "employeeId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_keepers_storeId_fkey') THEN
    ALTER TABLE "store_keepers" ADD CONSTRAINT "store_keepers_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_keepers_employeeId_fkey') THEN
    ALTER TABLE "store_keepers" ADD CONSTRAINT "store_keepers_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
