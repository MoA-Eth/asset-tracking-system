import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the Prisma client used by StoreService
const db = vi.hoisted(() => {
  const client: any = {
    employee: { findUnique: vi.fn() },
    department: { findUnique: vi.fn() },
    item: { findUnique: vi.fn(), update: vi.fn() },
    transactionApproval: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  client.$transaction = vi.fn(async (fn: any) => fn(client));
  return client;
});

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { StoreService } from './store.service';

const employees: Record<string, any> = {
  'EMP-ENC': { id: 'EMP-ENC', fullNameEn: 'Store Encoder', role: 'DATA_ENCODER' },
  'EMP-A': { id: 'EMP-A', fullNameEn: 'Abebe Kebede', role: 'STAFF' },
  'EMP-B': { id: 'EMP-B', fullNameEn: 'Sara Tesfaye', role: 'STAFF' },
};
const departments: Record<string, any> = {
  'DEP-1': { id: 'DEP-1', nameEn: 'Plant Protection' },
  'DEP-2': { id: 'DEP-2', nameEn: 'Extension Services' },
};

const stage1Request = {
  id: 'appr-1',
  transactionType: 'STOCK_OUT',
  itemId: 'item-1',
  itemCode: 'MOA-IT-2024-0001',
  itemName: 'Dell Latitude Laptop',
  ifmisSlipNumber: 'M22-001',
  ifmisSlipDateGc: '2026-10-01',
  ifmisSlipAttachmentUrl: '/api/uploads/slips/m22.pdf',
  recipientEmployeeId: 'EMP-A',
  targetDepartmentId: 'DEP-1',
  purposeOrRemarks: 'Field survey work',
  status: 'PENDING',
  currentStage: 1,
};

const edit = {
  recipientEmployeeId: 'EMP-B',
  targetDepartmentId: 'DEP-2',
  ifmisSlipNumber: 'M22-001',
  ifmisSlipDateGc: '2026-10-01',
  purpose: 'Field survey work',
  remark: 'Recipient corrected',
};

const store = () => StoreService.getInstance();

describe('Stock-Out correction before Stage 1 endorsement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.transactionApproval.findUnique.mockResolvedValue({ ...stage1Request });
    db.employee.findUnique.mockImplementation(async ({ where }: any) => employees[where.id] ?? null);
    db.department.findUnique.mockImplementation(async ({ where }: any) => departments[where.id] ?? null);
    db.transactionApproval.update.mockImplementation(async ({ data }: any) => ({ ...stage1Request, ...data }));
    db.item.update.mockResolvedValue({});
    // A batch of 10 laptops in store, of which the request issues all 10
    db.item.findUnique.mockResolvedValue({ id: 'item-1', itemCode: 'MOA-IT-2024-0001', notes: JSON.stringify({ quantity: 10, uom: 'EA' }) });
    db.auditLog.create.mockResolvedValue({});
  });

  it('updates the request, item history and audit log together', async () => {
    const approval = await store().updateStockOut('appr-1', edit, 'EMP-ENC');

    expect(approval.recipientEmployeeId).toBe('EMP-B');
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    const data = db.transactionApproval.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      recipientEmployeeId: 'EMP-B',
      targetDepartmentId: 'DEP-2',
      purposeOrRemarks: 'Field survey work (Remark: Recipient corrected)',
      ifmisSlipAttachmentUrl: '/api/uploads/slips/m22.pdf', // kept when no new upload
    });

    const history = db.item.update.mock.calls[0][0].data.history.create;
    expect(history.action).toBe('STOCK_OUT_EDITED');
    expect(history.notes).toMatch(/recipient Abebe Kebede → Sara Tesfaye/);
    expect(history.notes).toMatch(/directorate Plant Protection → Extension Services/);

    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'EDIT_STOCK_OUT', entityId: 'item-1' });
  });

  it('does nothing when no field changed', async () => {
    await store().updateStockOut('appr-1', { ...edit, recipientEmployeeId: 'EMP-A', targetDepartmentId: 'DEP-1', remark: '' }, 'EMP-ENC');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('can change how many units are issued, within what is in store', async () => {
    await store().updateStockOut('appr-1', { ...edit, quantity: 4 }, 'EMP-ENC');
    expect(db.transactionApproval.update.mock.calls[0][0].data.requestDetails).toMatchObject({ quantity: 4, uom: 'EA' });
    expect(db.item.update.mock.calls[0][0].data.history.create.notes).toMatch(/quantity 10 → 4/);

    await expect(store().updateStockOut('appr-1', { ...edit, quantity: 11 }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateStockOut('appr-1', { ...edit, quantity: 0 }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('is refused once the Team Leader has endorsed (Stage 2)', async () => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...stage1Request, currentStage: 2 });
    await expect(store().updateStockOut('appr-1', edit, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 409 });
    expect(db.transactionApproval.update).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED'])('is refused when the request is %s', async (status) => {
    db.transactionApproval.findUnique.mockResolvedValue({ ...stage1Request, status });
    await expect(store().updateStockOut('appr-1', edit, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns 404 for an unknown request or a request of another type', async () => {
    db.transactionApproval.findUnique.mockResolvedValue(null);
    await expect(store().updateStockOut('missing', edit, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 404 });
    db.transactionApproval.findUnique.mockResolvedValue({ ...stage1Request, transactionType: 'STOCK_IN' });
    await expect(store().updateStockOut('appr-1', edit, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects missing or unknown values with a 400', async () => {
    await expect(store().updateStockOut('appr-1', { ...edit, ifmisSlipNumber: ' ' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateStockOut('appr-1', { ...edit, purpose: '' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateStockOut('appr-1', { ...edit, recipientEmployeeId: 'EMP-GONE' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
    await expect(store().updateStockOut('appr-1', { ...edit, targetDepartmentId: 'DEP-GONE' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400 });
  });
});
