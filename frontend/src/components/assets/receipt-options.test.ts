import { describe, it, expect } from 'vitest';
import { CATEGORY_FROM_IFMIS, itemTypeFromIfmisCode, provisionFromSlip } from './receipt-options';
import { AssetCategory, ItemType } from '../../types/asset-management';

const categoryOf = (ifmis: string) => CATEGORY_FROM_IFMIS.find(([pattern]) => pattern.test(ifmis))?.[1];

describe('IFMIS item categories', () => {
  it('maps the categories printed on real Model 19 and Model 22 slips', () => {
    expect(categoryOf('Fuel and Lubricant')).toBe(AssetCategory.FUEL_LUBRICANTS);
    expect(categoryOf('Office supplies & Other related Item')).toBe(AssetCategory.OFFICE_SUPPLIES);
    expect(categoryOf('Other materials and supplies')).toBe(AssetCategory.OTHER_SUPPLIES);
  });

  it('keeps the specific categories ahead of the general supplies one', () => {
    expect(categoryOf('Medical Supplies & Related Accessories')).toBe(AssetCategory.LAB_EQUIPMENT);
    expect(categoryOf('Agricultural Supplies')).toBe(AssetCategory.AGRI_MACHINERY);
    expect(categoryOf('Office Furniture')).toBe(AssetCategory.OFFICE_FURNITURE);
    expect(categoryOf('Something unknown')).toBeUndefined();
  });

  it('files vehicle spare parts and accessories apart from the vehicles', () => {
    expect(categoryOf('Vehicle Spare Parts')).toBe(AssetCategory.VEHICLE_PARTS);
    expect(categoryOf('Vehicle accessories')).toBe(AssetCategory.VEHICLE_PARTS);
    expect(categoryOf('Tyres and tubes')).toBe(AssetCategory.VEHICLE_PARTS);
    // The vehicles themselves, and computer accessories, stay where they were
    expect(categoryOf('Vehicles & Transport')).toBe(AssetCategory.VEHICLE);
    expect(categoryOf('Computer accessories')).toBe(AssetCategory.IT_EQUIPMENT);
  });

  it('files tools and workshop equipment under Tools & equipment, not under supplies', () => {
    expect(categoryOf('Hand Tools')).toBe(AssetCategory.TOOLS_EQUIPMENT);
    expect(categoryOf('Workshop equipment and supplies')).toBe(AssetCategory.TOOLS_EQUIPMENT);
    // "Agricultural implements" are still agricultural
    expect(categoryOf('Agricultural implements')).toBe(AssetCategory.AGRI_MACHINERY);
  });
});

describe('item type from the IFMIS item code', () => {
  it('is a fixed asset when the code starts with 3; codes starting with 0 or 1 are consumables', () => {
    expect(itemTypeFromIfmisCode('008101101.0001')).toBe(ItemType.CONSUMABLE);
    expect(itemTypeFromIfmisCode('005101101.0002')).toBe(ItemType.CONSUMABLE);
    expect(itemTypeFromIfmisCode('308101101.0001')).toBe(ItemType.FIXED);
    expect(itemTypeFromIfmisCode('301101101.0052')).toBe(ItemType.FIXED);
    expect(itemTypeFromIfmisCode('108101101.0021')).toBe(ItemType.CONSUMABLE);
    expect(itemTypeFromIfmisCode('101101101.0052')).toBe(ItemType.CONSUMABLE);
    expect(itemTypeFromIfmisCode('203101101.0001')).toBe(ItemType.CONSUMABLE);
    expect(itemTypeFromIfmisCode('MOA-000343')).toBe(ItemType.CONSUMABLE);
  });

  it('makes no guess without a code', () => {
    expect(itemTypeFromIfmisCode(undefined)).toBeUndefined();
    expect(itemTypeFromIfmisCode('')).toBeUndefined();
    expect(itemTypeFromIfmisCode('   ')).toBeUndefined();
  });
});

describe('provision from the Model 19', () => {
  it('is a purchase with a PO number and a donation without one, whatever the transaction type', () => {
    expect(provisionFromSlip('186')).toBe('PURCHASE');
    expect(provisionFromSlip(' 4500012 ')).toBe('PURCHASE');
    expect(provisionFromSlip(undefined)).toBe('DONATION');
    expect(provisionFromSlip('  ')).toBe('DONATION');
  });
});
