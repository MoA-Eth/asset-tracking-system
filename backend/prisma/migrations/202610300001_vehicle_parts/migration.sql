-- A category for vehicle spare parts and accessories (filters, brake pads, batteries, mats, seat covers…), which were
-- filed under Vehicles: they are consumables, and Vehicles is for the vehicles themselves.
-- Adding an enum value keeps every existing row; running this twice does no harm.
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'VEHICLE_PARTS';
