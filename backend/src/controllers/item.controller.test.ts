import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ItemController } from './item.controller';
import { StoreService } from '../services/store.service';
import { UserRole, AssetCategory, ItemCondition } from '../types/asset-management';
import { BadRequestError, ForbiddenError } from '../errors/app-error';

describe('ItemController - Authenticated User Activity Claiming', () => {
  let controller: ItemController;
  let mockStore: any;

  beforeEach(() => {
    controller = new ItemController();
    mockStore = (controller as any).store;
  });

  describe('POST /api/items/stock-in (registerStockIn)', () => {
    it('unconditionally sets registeredById to req.user.id even if payload contains another registeredById', async () => {
      const registerSpy = vi.spyOn(mockStore, 'registerStockIn').mockResolvedValue({
        item: { id: 'item-1', itemCode: 'MOA-IT-2024-0001' },
      } as any);

      const req: any = {
        user: { id: 'EMP-REAL-ENCODER', role: UserRole.DATA_ENCODER },
        body: {
          name: 'Dell Server',
          category: AssetCategory.IT_EQUIPMENT,
          ifmisSlipNumber: 'M19-999',
          registeredById: 'SPOOFED_ID',
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.registerStockIn(req, res, () => {});

      expect(registerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          registeredById: 'EMP-REAL-ENCODER',
        })
      );
    });

    it('blocks SYSTEM_ADMIN from registering stock-in under Segregation of Duties', async () => {
      const req: any = {
        user: { id: 'EMP-ADMIN-01', role: UserRole.SYSTEM_ADMIN },
        body: {
          name: 'Server',
          category: AssetCategory.IT_EQUIPMENT,
          ifmisSlipNumber: 'M19-999',
        },
      };
      const res: any = {};
      const next = vi.fn();

      await controller.registerStockIn(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('POST /api/items/stock-out (registerStockOut)', () => {
    it('unconditionally sets registeredById to req.user.id for stock-out requisition', async () => {
      const registerSpy = vi.spyOn(mockStore, 'registerStockOut').mockResolvedValue({
        id: 'appr-1',
      } as any);

      const req: any = {
        user: { id: 'EMP-ACTIVE-USER', role: UserRole.DATA_ENCODER },
        body: {
          itemId: 'item-1',
          recipientEmployeeId: 'emp-staff-1',
          ifmisSlipNumber: 'M20-111',
          purpose: 'Official agronomy fieldwork',
          registeredById: 'OLD_DEFAULT_ID',
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.registerStockOut(req, res, () => {});

      expect(registerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          registeredById: 'EMP-ACTIVE-USER',
        })
      );
    });
  });

  describe('POST /api/items/disposal (registerDisposal)', () => {
    const body = { itemId: 'item-1', disposalNo: 'DSP-1', reason: 'Damaged beyond repair', registeredById: 'SPOOFED_ID' };
    const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() } as any);

    it('records the signed-in user as the requester', async () => {
      const registerSpy = vi.spyOn(mockStore, 'registerDisposal').mockResolvedValue({ id: 'appr-1' } as any);
      await controller.registerDisposal({ user: { id: 'EMP-ENC', role: UserRole.DATA_ENCODER }, body: { ...body } } as any, res(), () => {});
      expect(registerSpy).toHaveBeenCalledWith(expect.objectContaining({ registeredById: 'EMP-ENC' }));
    });

    it('is refused for roles without "Request disposals"', async () => {
      const next = vi.fn();
      await controller.registerDisposal({ user: { id: 'EMP-TL', role: UserRole.TEAM_LEADER }, body: { ...body } } as any, res(), next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('asks for the item, reference number and reason', async () => {
      const next = vi.fn();
      await controller.registerDisposal({ user: { id: 'EMP-ENC', role: UserRole.DATA_ENCODER }, body: { itemId: 'item-1' } } as any, res(), next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('POST /api/items/return-to-store (registerReturn)', () => {
    it('unconditionally sets registeredById to req.user.id for Model 22 return', async () => {
      const returnSpy = vi.spyOn(mockStore, 'registerReturn').mockResolvedValue({
        id: 'appr-2',
      } as any);

      const req: any = {
        user: { id: 'EMP-RETURN-ENCODER', role: UserRole.DATA_ENCODER },
        body: {
          itemId: 'item-1',
          ifmisSlipNumber: 'M22-333',
          condition: ItemCondition.GOOD,
          registeredById: 'WRONG_ID',
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.registerReturn(req, res, () => {});

      expect(returnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          registeredById: 'EMP-RETURN-ENCODER',
        })
      );
    });
  });

  describe('POST /api/items/transfer (transferItem)', () => {
    it('unconditionally sets performedById to req.user.id for asset transfer', async () => {
      const transferSpy = vi.spyOn(mockStore, 'transferItem').mockResolvedValue({
        id: 'item-1',
      } as any);

      const req: any = {
        user: { id: 'EMP-TRANSFER-PERFORMER', role: UserRole.DATA_ENCODER },
        body: {
          itemId: 'item-1',
          reason: 'Transferred to research station',
          performedById: 'UNAUTHORIZED_ID',
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.transferItem(req, res, () => {});

      expect(transferSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          performedById: 'EMP-TRANSFER-PERFORMER',
        })
      );
    });
  });

  describe('POST /api/items/approvals/action (handleApproval)', () => {
    it('unconditionally claims reviewedById by authenticated Team Leader for Stage 1 endorsement', async () => {
      const approvalSpy = vi.spyOn(mockStore, 'handleApproval').mockResolvedValue({
        id: 'appr-1',
        status: 'PENDING',
      } as any);

      const req: any = {
        user: { id: 'EMP-TL-ACTIVE', role: UserRole.TEAM_LEADER },
        body: {
          approvalId: 'appr-1',
          action: 'ENDORSE',
          reviewedById: 'SPOOFED_OFFICER_ID',
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.handleApproval(req, res, () => {});

      expect(approvalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewedById: 'EMP-TL-ACTIVE',
          action: 'ENDORSE',
        })
      );
    });

    it('unconditionally claims reviewedById by authenticated Department Head for Stage 2 approval', async () => {
      const approvalSpy = vi.spyOn(mockStore, 'handleApproval').mockResolvedValue({
        id: 'appr-1',
        status: 'APPROVED',
      } as any);

      const req: any = {
        user: { id: 'EMP-HEAD-ACTIVE', role: UserRole.DEPARTMENT_HEAD },
        body: {
          approvalId: 'appr-1',
          action: 'APPROVE',
          reviewedById: 'SOME_OTHER_HEAD',
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.handleApproval(req, res, () => {});

      expect(approvalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewedById: 'EMP-HEAD-ACTIVE',
          action: 'APPROVE',
        })
      );
    });

    it('blocks DATA_ENCODER from signing off on approval action', async () => {
      const req: any = {
        user: { id: 'EMP-ENC-01', role: UserRole.DATA_ENCODER },
        body: {
          approvalId: 'appr-1',
          action: 'ENDORSE',
        },
      };
      const res: any = {};
      const next = vi.fn();

      await controller.handleApproval(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('Pre-flight checkSerial and checkSlip', () => {
    it('calls store.checkSerialNumber with query params', async () => {
      const checkSerialSpy = vi.spyOn(mockStore, 'checkSerialNumber').mockResolvedValue({ available: true });
      const req: any = {
        user: { id: 'EMP-ENC-01', role: UserRole.DATA_ENCODER },
        query: { serial: 'SN-12345', exceptItemId: 'item-1' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.checkSerial(req, res, () => {});
      expect(checkSerialSpy).toHaveBeenCalledWith('SN-12345', 'item-1');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { available: true } }));
    });

    it('calls store.checkSlipNumber with query params', async () => {
      const checkSlipSpy = vi.spyOn(mockStore, 'checkSlipNumber').mockResolvedValue({ exists: false, count: 0, items: [] });
      const req: any = {
        user: { id: 'EMP-ENC-01', role: UserRole.DATA_ENCODER },
        query: { slip: 'M19-0099' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.checkSlip(req, res, () => {});
      expect(checkSlipSpy).toHaveBeenCalledWith('M19-0099');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { exists: false, count: 0, items: [] } }));
    });

    it('calls store.checkTagNumber with query params', async () => {
      const checkTagSpy = vi.spyOn(mockStore, 'checkTagNumber').mockResolvedValue({ available: true });
      const req: any = {
        user: { id: 'EMP-ENC-01', role: UserRole.DATA_ENCODER },
        query: { tag: 'MOA-016341', exceptItemId: 'item-2' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.checkTag(req, res, () => {});
      expect(checkTagSpy).toHaveBeenCalledWith('MOA-016341', 'item-2');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { available: true } }));
    });

    it('calls store.checkPoNumber with query params', async () => {
      const checkPoSpy = vi.spyOn(mockStore, 'checkPoNumber').mockResolvedValue({ exists: false, count: 0, slips: [] });
      const req: any = {
        user: { id: 'EMP-ENC-01', role: UserRole.DATA_ENCODER },
        query: { po: 'PO-2024-001' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.checkPo(req, res, () => {});
      expect(checkPoSpy).toHaveBeenCalledWith('PO-2024-001');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { exists: false, count: 0, slips: [] } }));
    });

    it('calls store.checkDescription with query params', async () => {
      const checkDescSpy = vi.spyOn(mockStore, 'checkDescription').mockResolvedValue({ matches: [], count: 0 });
      const req: any = {
        user: { id: 'EMP-ENC-01', role: UserRole.DATA_ENCODER },
        query: { name: 'Dell Latitude 5440', storeLocationId: 'loc-1' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await controller.checkDescription(req, res, () => {});
      expect(checkDescSpy).toHaveBeenCalledWith('Dell Latitude 5440', 'loc-1');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { matches: [], count: 0 } }));
    });
  });
});
