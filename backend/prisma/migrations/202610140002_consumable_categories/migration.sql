-- Categories for consumables, matched from the IFMIS item categories on a Model 19:
-- office supplies and stationery, fuel and lubricants, and other materials and supplies.
-- Adding enum values keeps every existing row; running this twice does no harm.
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'OFFICE_SUPPLIES';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'FUEL_LUBRICANTS';
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'OTHER_SUPPLIES';
