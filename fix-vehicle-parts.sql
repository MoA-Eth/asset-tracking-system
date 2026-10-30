-- One-time correction, 2026-10-30: Vehicles & Transport held 89 consumables that are not vehicles. Spare parts and
-- accessories (filters, brake pads, batteries, mats, seat covers…) go to the new Vehicle parts & accessories category;
-- the sickle, the spade and the handheld GPS go to Tools & equipment. The vehicles themselves (fixed assets) stay.
-- Item codes stay as they are (they may be on tags and vouchers). Only records still under Vehicles are touched, so
-- running it twice changes nothing the second time. Needs the release that adds the category (commit after 8f51a13).

\pset footer off
BEGIN;

\echo '=== before: Vehicles & Transport by item type'
SELECT "itemType", count(*) FROM items WHERE category = 'VEHICLE' GROUP BY 1 ORDER BY 1;

-- 1. Hand tools and an instrument filed under Vehicles
WITH moved AS (
  UPDATE items SET category = 'TOOLS_EQUIPMENT', "updatedAt" = now()
  WHERE category = 'VEHICLE'
    AND (
      "itemCode" IN ('MOA-VEH-2026-0090', 'MOA-VEH-2026-0087', 'MOA-VEH-2026-0082')
      OR "itemCode" LIKE 'MOA-VEH-2026-0090-%' OR "itemCode" LIKE 'MOA-VEH-2026-0087-%' OR "itemCode" LIKE 'MOA-VEH-2026-0082-%'
    )
  RETURNING id
)
INSERT INTO item_history (id, "itemId", "dateGc", "dateEc", action, "fromEntity", "toEntity", "performedBy", "performedByRole", notes)
SELECT gen_random_uuid()::text, id, '2026-10-30', '2019-02-20', 'CATEGORY_CORRECTED', 'Vehicles', 'Tools & equipment',
       'System (data correction)', 'SYSTEM_ADMIN', 'A hand tool or instrument, not a vehicle: moved from Vehicles to Tools & equipment.'
FROM moved;

-- 2. Every other consumable under Vehicles: spare parts and accessories
WITH moved AS (
  UPDATE items SET category = 'VEHICLE_PARTS', "updatedAt" = now()
  WHERE category = 'VEHICLE' AND "itemType" = 'CONSUMABLE'
  RETURNING id
)
INSERT INTO item_history (id, "itemId", "dateGc", "dateEc", action, "fromEntity", "toEntity", "performedBy", "performedByRole", notes)
SELECT gen_random_uuid()::text, id, '2026-10-30', '2019-02-20', 'CATEGORY_CORRECTED', 'Vehicles', 'Vehicle parts & accessories',
       'System (data correction)', 'SYSTEM_ADMIN', 'A spare part or accessory, not a vehicle: moved from Vehicles to Vehicle parts & accessories.'
FROM moved;

\echo '=== after: Vehicles & Transport should hold fixed assets only'
SELECT category, "itemType", count(*) FROM items WHERE category IN ('VEHICLE', 'VEHICLE_PARTS', 'TOOLS_EQUIPMENT') GROUP BY 1, 2 ORDER BY 1, 2;

COMMIT;
