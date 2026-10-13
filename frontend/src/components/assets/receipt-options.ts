import { AssetCategory } from '../../types/asset-management';

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
];

export const COMMON_UOMS = ['EA', 'PKT', 'SET', 'ROLL', 'PCS', 'BOX', 'BAG', 'KG', 'LTR', 'CAN', 'BOTTLE'];
export const COMMON_CATEGORIES = [
  { value: AssetCategory.IT_EQUIPMENT, label: 'IT Equipment & Accessories' },
  { value: AssetCategory.AGRI_MACHINERY, label: 'Agricultural Machinery & Supplies' },
  { value: AssetCategory.LAB_EQUIPMENT, label: 'Medical & Lab Supplies' },
  { value: AssetCategory.VEHICLE, label: 'Vehicles & Transport' },
  { value: AssetCategory.OFFICE_FURNITURE, label: 'Office Furniture & Fixtures' },
  { value: AssetCategory.FIELD_GEAR, label: 'Field Gear & Uniforms' },
];
