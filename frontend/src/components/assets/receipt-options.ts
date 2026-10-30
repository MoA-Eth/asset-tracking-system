import { AssetCategory, ItemType, ProvisionType } from '../../types/asset-management';

/** The transaction types the receipt offers */
export const TRANSACTION_TYPES = ['PO Receipt', 'Petty Cash Purchase Receipt', 'Direct Delivery', 'Donation / Grant Receipt', 'Transfer Receipt', 'Internal Production'];

/**
 * Vehicle parts & accessories as a category of their own is off for now: they stay with the vehicles, in Vehicles with
 * Accessories (choosing it in a filter lists the vehicles themselves). Set to true to offer the category again.
 */
export const SHOW_VEHICLE_PARTS = false;

/** Categories that hold machines with their accessories: chosen in a filter, they list the machines themselves */
const MACHINES_ONLY: string[] = [AssetCategory.VEHICLE, AssetCategory.AGRI_MACHINERY];

/** Whether a record is in the category chosen in a filter: for Vehicles or Agricultural Machinery with Accessories, the machines only */
export const inCategory = (item: { category?: string | null; itemType?: string | null }, category: string): boolean =>
  category === 'ALL' || (item.category === category && !(MACHINES_ONLY.includes(category) && item.itemType === ItemType.CONSUMABLE));

/** IFMIS item categories, matched to the categories of this register */
export const CATEGORY_FROM_IFMIS: [RegExp, AssetCategory][] = [
  [/medical|laborator|\blab\b|veterinar|drug/i, AssetCategory.LAB_EQUIPMENT],
  [/agricultur|farm|seed|fertili/i, AssetCategory.AGRI_MACHINERY],
  // Vehicle spare parts and accessories: their own category when it is on, otherwise with the vehicles
  [/spare\s*part|vehicle\s*accessor|\btyres?\b|\btires?\b/i, SHOW_VEHICLE_PARTS ? AssetCategory.VEHICLE_PARTS : AssetCategory.VEHICLE],
  [/vehicle|transport|motor/i, AssetCategory.VEHICLE],
  [/furniture|fixture/i, AssetCategory.OFFICE_FURNITURE],
  [/computer|\bit\b|ict|electronic/i, AssetCategory.IT_EQUIPMENT],
  [/uniform|field|gear|cloth/i, AssetCategory.FIELD_GEAR],
  [/\btools?\b|workshop|implement/i, AssetCategory.TOOLS_EQUIPMENT],
  [/fuel|lubric/i, AssetCategory.FUEL_LUBRICANTS],
  [/office\s*suppl|stationer/i, AssetCategory.OFFICE_SUPPLIES],
  // Last: any other "materials and supplies" not matched above
  [/material|suppl/i, AssetCategory.OTHER_SUPPLIES],
];

/**
 * Fixed asset or consumable from the IFMIS inventory item code on a Model 19:
 * a code starting with 3 is a fixed asset; codes starting with 0 or 1 (and any other) are consumables
 * (confirmed by the property team, 2026-10-20). The badge on the form can still change it.
 */
export function itemTypeFromIfmisCode(code?: string): ItemType | undefined {
  const trimmed = code?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('3') ? ItemType.FIXED : ItemType.CONSUMABLE;
}

/** What a code gives as default item type */
export const ITEM_CODE_RULE = 'Codes starting with 3 are fixed assets; codes starting with 0 or 1 are consumables.';

export const COMMON_UOMS = [
  'EA',
  'PCS',
  'SET',
  'BOX',
  'BAG',
  'PKT',
  'ROLL',
  'KG',
  'QUINTAL',
  'LTR',
  'CAN',
  'BOTTLE',
  'VIAL',
  'PAIR',
  'M',
  'DRUM',
  'DOZEN',
  'PACK',
  'RM',
  'UNIT',
  'CTN',
  'TUBE',
  'SHEET',
];

/** The ministry's programs and projects goods are received for (Program / project on Model 19) */
export const PROGRAMS = [
  'MoA',
  'Food and Nutrition Project team',
  'Productive Safety Net Programme (PSNP)',
  'Food System Resilience Program (FSRP)',
  'Climate Resilient Wheat Value Chain Development (CREW) Project',
  'Italian Development Cooperation Agriculture value chain project',
  'National Avocado Program',
  'Climate Resilient Green Economy Projects',
  'Strengthening Drought Resilience project',
  'WE_GO',
  'Development Response to Displacement Impact Project Phase II',
  'Rural Economic Development and Food Security (RED&FS)',
  'DRIVE and BREFONS',
  'Livestock and Fisheries Sector Development Project (LFSDP)',
  'Participatory Agriculture and Climate Transformation Program',
  'Sustainable Land Use Management Project (SLMP)',
  'Climate Action through Landscape Management (CALM)',
  'MoA-DE-RI & Value Enhancement of Pastoral Economies in the Horn of Africa',
];

export const COMMON_UOM_OPTIONS: { value: string; label: string }[] = COMMON_UOMS.map((u) => ({
  value: u,
  label: u,
}));
export const COMMON_CATEGORIES = [
  { value: AssetCategory.IT_EQUIPMENT, label: 'IT Equipment & Accessories' },
  { value: AssetCategory.AGRI_MACHINERY, label: 'Agricultural Machinery with Accessories' },
  { value: AssetCategory.LAB_EQUIPMENT, label: 'Medical & Lab Supplies' },
  { value: AssetCategory.VEHICLE, label: 'Vehicles with Accessories' },
  ...(SHOW_VEHICLE_PARTS ? [{ value: AssetCategory.VEHICLE_PARTS, label: 'Vehicle Parts & Accessories' }] : []),
  { value: AssetCategory.OFFICE_FURNITURE, label: 'Office Furniture & Fixtures' },
  { value: AssetCategory.FIELD_GEAR, label: 'Field Gear & Uniforms' },
  { value: AssetCategory.TOOLS_EQUIPMENT, label: 'Tools & Equipment' },
  { value: AssetCategory.OFFICE_SUPPLIES, label: 'Office Supplies & Stationery' },
  { value: AssetCategory.FUEL_LUBRICANTS, label: 'Fuel & Lubricants' },
  { value: AssetCategory.OTHER_SUPPLIES, label: 'Other Materials & Supplies' },
];

/** Bought or donated, as a Model 19 shows it: a PO number means a purchase, none a donation */
export function provisionFromSlip(poNumber?: string): ProvisionType {
  return poNumber?.trim() ? 'PURCHASE' : 'DONATION';
}
