import { AssetCategory, ItemType } from '../../types/asset-management';

/** The transaction types the receipt offers */
export const TRANSACTION_TYPES = ['PO Receipt', 'Petty Cash Purchase Receipt', 'Direct Delivery', 'Donation / Grant Receipt', 'Transfer Receipt', 'Internal Production'];

/** IFMIS item categories, matched to the categories of this register */
export const CATEGORY_FROM_IFMIS: [RegExp, AssetCategory][] = [
  [/medical|laborator|\blab\b|veterinar|drug/i, AssetCategory.LAB_EQUIPMENT],
  [/agricultur|farm|seed|fertili/i, AssetCategory.AGRI_MACHINERY],
  [/vehicle|transport|motor/i, AssetCategory.VEHICLE],
  [/furniture|fixture/i, AssetCategory.OFFICE_FURNITURE],
  [/computer|\bit\b|ict|electronic/i, AssetCategory.IT_EQUIPMENT],
  [/uniform|field|gear|cloth/i, AssetCategory.FIELD_GEAR],
  [/fuel|lubric/i, AssetCategory.FUEL_LUBRICANTS],
  [/office\s*suppl|stationer/i, AssetCategory.OFFICE_SUPPLIES],
  // Last: any other "materials and supplies" not matched above
  [/material|suppl/i, AssetCategory.OTHER_SUPPLIES],
];

/**
 * Fixed asset or consumable from the IFMIS inventory item code on a Model 19, as the property office reads it:
 * a code starting with 1 is a consumable (e.g. 108101101.0021, fuel cards), one starting with 0 a fixed asset.
 * Any other code gives no type, so nothing is registered with a guessed one.
 */
export function itemTypeFromIfmisCode(code?: string): ItemType | undefined {
  const first = code?.trim()[0];
  return first === '1' ? ItemType.CONSUMABLE : first === '0' ? ItemType.FIXED : undefined;
}

/** What a code that gives no item type should say */
export const ITEM_CODE_RULE = 'An IFMIS item code starts with 1 (consumable) or 0 (fixed asset).';

export const COMMON_UOMS = ['EA', 'PKT', 'SET', 'ROLL', 'PCS', 'BOX', 'BAG', 'KG', 'LTR', 'CAN', 'BOTTLE'];
export const COMMON_CATEGORIES = [
  { value: AssetCategory.IT_EQUIPMENT, label: 'IT Equipment & Accessories' },
  { value: AssetCategory.AGRI_MACHINERY, label: 'Agricultural Machinery & Supplies' },
  { value: AssetCategory.LAB_EQUIPMENT, label: 'Medical & Lab Supplies' },
  { value: AssetCategory.VEHICLE, label: 'Vehicles & Transport' },
  { value: AssetCategory.OFFICE_FURNITURE, label: 'Office Furniture & Fixtures' },
  { value: AssetCategory.FIELD_GEAR, label: 'Field Gear & Uniforms' },
  { value: AssetCategory.OFFICE_SUPPLIES, label: 'Office Supplies & Stationery' },
  { value: AssetCategory.FUEL_LUBRICANTS, label: 'Fuel & Lubricants' },
  { value: AssetCategory.OTHER_SUPPLIES, label: 'Other Materials & Supplies' },
];
