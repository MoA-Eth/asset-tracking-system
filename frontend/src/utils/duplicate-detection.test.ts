import { describe, it, expect } from 'vitest';
import {
  tokenizeItemName,
  computeWordSimilarity,
  findDuplicateSuspects,
} from './duplicate-detection';
import { ItemWithRelations, ItemStatus, AssetCategory } from '../types/asset-management';

describe('duplicate-detection', () => {
  describe('tokenizeItemName', () => {
    it('normalizes, strips special characters and stop words', () => {
      const tokens = tokenizeItemName('Sensitive  Scale, Type A (Set of 10)');
      expect(tokens).toEqual(['sensitive', 'scale', '10']);
    });
  });

  describe('computeWordSimilarity', () => {
    it('computes token intersection similarity', () => {
      const sim = computeWordSimilarity(['sensitive', 'scale'], ['sensitive', 'scale', 'electronic']);
      expect(sim).toBe(1); // 2 / min(2, 3) = 1.0
    });

    it('returns 0 for disjoint words', () => {
      const sim = computeWordSimilarity(['apple'], ['orange']);
      expect(sim).toBe(0);
    });
  });

  describe('findDuplicateSuspects', () => {
    const mockStoreLocationId = 'loc-kality-01';

    it('detects high-confidence duplicate when count item matches active item on name and price in same store', () => {
      const existingItem = {
        id: 'item-prev-1',
        itemCode: 'MOA-TOOL-2026-0001',
        name: 'Sensitive scale',
        category: AssetCategory.TOOLS_EQUIPMENT,
        serialNumber: 'SN-001',
        unitCostETB: 149500,
        status: ItemStatus.AVAILABLE,
        condition: 'NEW' as any,
        storeLocationId: mockStoreLocationId,
        ifmisSlipNumber: '0000033',
        ifmisSlipDateGc: '2026-10-20',
        ifmisSlipDateEc: '2019-02-10',
        isHistoricalData: false,
      } as unknown as ItemWithRelations;

      const countItem = {
        id: 'item-count-1',
        itemCode: 'MOA-TOOL-2026-0080',
        name: 'Sensitive  Scale',
        category: AssetCategory.TOOLS_EQUIPMENT,
        serialNumber: '',
        unitCostETB: 149500,
        status: ItemStatus.PENDING_STOCK_IN,
        condition: 'NEW' as any,
        storeLocationId: mockStoreLocationId,
        ifmisSlipNumber: 'COUNT-2018-SARIS-02-TOOLS',
        ifmisSlipDateGc: '2026-11-06',
        ifmisSlipDateEc: '2019-02-27',
        isHistoricalData: true,
      } as unknown as ItemWithRelations;

      const map = findDuplicateSuspects([existingItem, countItem]);
      expect(map.has('item-count-1')).toBe(true);

      const suspect = map.get('item-count-1')!;
      expect(suspect.matchedItemId).toBe('item-prev-1');
      expect(suspect.matchedItemCode).toBe('MOA-TOOL-2026-0001');
      expect(suspect.severity).toBe('HIGH');
      expect(suspect.isSamePrice).toBe(true);
    });

    it('does not flag items in different stores', () => {
      const existingItem = {
        id: 'item-prev-1',
        itemCode: 'MOA-TOOL-2026-0001',
        name: 'Sensitive scale',
        category: AssetCategory.TOOLS_EQUIPMENT,
        serialNumber: 'SN-001',
        unitCostETB: 149500,
        status: ItemStatus.AVAILABLE,
        condition: 'NEW' as any,
        storeLocationId: 'loc-saris',
        ifmisSlipNumber: '0000033',
        ifmisSlipDateGc: '2026-10-20',
        ifmisSlipDateEc: '2019-02-10',
        isHistoricalData: false,
      } as unknown as ItemWithRelations;

      const countItem = {
        id: 'item-count-1',
        itemCode: 'MOA-TOOL-2026-0080',
        name: 'Sensitive scale',
        category: AssetCategory.TOOLS_EQUIPMENT,
        serialNumber: '',
        unitCostETB: 149500,
        status: ItemStatus.PENDING_STOCK_IN,
        condition: 'NEW' as any,
        storeLocationId: 'loc-kality',
        ifmisSlipNumber: 'COUNT-2018-KALITY-TOOLS',
        ifmisSlipDateGc: '2026-11-06',
        ifmisSlipDateEc: '2019-02-27',
        isHistoricalData: true,
      } as unknown as ItemWithRelations;

      const map = findDuplicateSuspects([existingItem, countItem]);
      expect(map.has('item-count-1')).toBe(false);
    });

    it('does not flag split child units as duplicates of their parent batch or siblings', () => {
      const parentBatch = {
        id: 'S1',
        itemCode: 'MOA-S1',
        name: 'Desk',
        category: AssetCategory.OFFICE_EQUIPMENT,
        unitCostETB: 12000,
        status: ItemStatus.AVAILABLE,
        storeLocationId: mockStoreLocationId,
      } as unknown as ItemWithRelations;

      const splitUnit1 = {
        id: 'S1-1',
        parentItemId: 'S1',
        itemCode: 'MOA-S1-1',
        name: 'Desk',
        category: AssetCategory.OFFICE_EQUIPMENT,
        unitCostETB: 12000,
        status: ItemStatus.ISSUED,
        storeLocationId: mockStoreLocationId,
      } as unknown as ItemWithRelations;

      const splitUnit2 = {
        id: 'S1-2',
        parentItemId: 'S1',
        itemCode: 'MOA-S1-2',
        name: 'Desk',
        category: AssetCategory.OFFICE_EQUIPMENT,
        unitCostETB: 12000,
        status: ItemStatus.ISSUED,
        storeLocationId: mockStoreLocationId,
      } as unknown as ItemWithRelations;

      const map = findDuplicateSuspects([parentBatch, splitUnit1, splitUnit2]);
      expect(map.has('S1')).toBe(false);
      expect(map.has('S1-1')).toBe(false);
      expect(map.has('S1-2')).toBe(false);
    });
  });
});
