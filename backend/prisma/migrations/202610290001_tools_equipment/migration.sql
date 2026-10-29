-- A category for tools and equipment: wheelbarrows and carts, ladders, hand tools, scales, survey and measuring
-- instruments, which fitted none of the others (a wheelbarrow was filed under Vehicles).
-- Adding an enum value keeps every existing row; running this twice does no harm.
ALTER TYPE "AssetCategory" ADD VALUE IF NOT EXISTS 'TOOLS_EQUIPMENT';
