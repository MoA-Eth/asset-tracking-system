import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  employee: { findFirst: vi.fn() },
  item: { updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  transactionApproval: { findMany: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
  organization: { findMany: vi.fn(), create: vi.fn() },
  program: { findMany: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  systemSetting: { findUnique: vi.fn(), create: vi.fn() },
  rolePermissionSet: { findMany: vi.fn(), update: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: db }));

import { DISPOSALS_GRANT_MARKER, REOPEN_REJECTED_MARKER, runStartupUpgrades } from './upgrades.service';

const DEFAULT_PROGRAM_NAMES = [
  'MoA', 'Food and Nutrition Project team', 'Productive Safety Net Programme (PSNP)',
  'Food System Resilience Program (FSRP)', 'Climate Resilient Wheat Value Chain Development (CREW) Project',
  'Italian Development Cooperation Agriculture value chain project', 'National Avocado Program',
  'Climate Resilient Green Economy Projects', 'Strengthening Drought Resilience project', 'WE_GO',
  'Development Response to Displacement Impact Project Phase II', 'Rural Economic Development and Food Security (RED&FS)',
  'DRIVE and BREFONS', 'Livestock and Fisheries Sector Development Project (LFSDP)',
  'Participatory Agriculture and Climate Transformation Program', 'Sustainable Land Use Management Project (SLMP)',
  'Climate Action through Landscape Management (CALM)', 'MoA-DE-RI & Value Enhancement of Pastoral Economies in the Horn of Africa',
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.employee.findFirst.mockResolvedValue({ id: 'EMP-ADMIN-01' });
  db.systemSetting.findUnique.mockResolvedValue(null);
  db.rolePermissionSet.findMany.mockResolvedValue([]);
  db.transactionApproval.findMany.mockResolvedValue([]);
  db.item.findMany.mockResolvedValue([]);
  db.organization.findMany.mockResolvedValue([]);
  db.program.findMany.mockResolvedValue(DEFAULT_PROGRAM_NAMES.map((name) => ({ name })));
  db.program.create.mockImplementation(async ({ data }: any) => data);
  db.item.count.mockResolvedValue(0);
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('startup upgrade: reopen old rejected receipts', () => {
  // Two lines of 0000152 rejected at Stage 2, one of 0001350 at Stage 1
  const rejected = [
    { id: 'A1', itemId: 'I1', ifmisSlipNumber: '0000152', reviewedById: 'EMP-HEAD', reviewRemarks: 'Price is entered as USD.', reviewedAtGc: '2026-10-21', reviewedAtEc: '2019-02-11', endorsedById: 'EMP-TL' },
    { id: 'A2', itemId: 'I2', ifmisSlipNumber: '0000152', reviewedById: 'EMP-HEAD', reviewRemarks: 'Price is entered as USD.', reviewedAtGc: '2026-10-21', reviewedAtEc: '2019-02-11', endorsedById: 'EMP-TL' },
    { id: 'A3', itemId: 'I3', ifmisSlipNumber: '0001350', reviewedById: 'EMP-TL', reviewRemarks: 'Wrong Buyer Name', reviewedAtGc: '2026-10-19', reviewedAtEc: '2019-02-09', endorsedById: null },
  ];
  const isReopen = (call: any[]) => call[0]?.where?.ifmisSlipNumber?.in;

  it('puts them back with their requesters as a rejection does now, keeping who rejected them and why', async () => {
    db.transactionApproval.findMany.mockImplementation(async (args: any) => (isReopen([args]) ? rejected : []));
    await runStartupUpgrades();
    const reopenQuery = db.transactionApproval.findMany.mock.calls.find(isReopen)![0];
    expect(reopenQuery.where).toMatchObject({ transactionType: 'STOCK_IN', status: 'REJECTED', ifmisSlipNumber: { in: ['0000152', '0001350', '0001351'] }, item: { status: 'REJECTED' } });
    expect(db.transactionApproval.update).toHaveBeenCalledTimes(3);
    expect(db.transactionApproval.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'A1' },
      data: { status: 'RETURNED', currentStage: 1, returnedById: 'EMP-HEAD', returnRemarks: 'Price is entered as USD.', returnedAtGc: '2026-10-21', returnedFromStage: 2, reviewedById: null, endorsedById: null },
    });
    expect(db.transactionApproval.update.mock.calls[2][0].data).toMatchObject({ returnedById: 'EMP-TL', returnRemarks: 'Wrong Buyer Name', returnedFromStage: 1 });
    expect(db.item.update.mock.calls[0][0]).toMatchObject({ where: { id: 'I1' }, data: { status: 'PENDING_STOCK_IN', history: { create: { action: 'STOCK_IN_REOPENED' } } } });
    expect(db.systemSetting.create).toHaveBeenCalledWith({ data: { key: REOPEN_REJECTED_MARKER, value: 'done', updatedById: 'system' } });
    expect(db.auditLog.create.mock.calls.map((c: any[]) => c[0].data.action)).toContain('SYSTEM_UPGRADE_REOPEN_REJECTED');
  });

  it('leaves a receipt closed when its Model 19 was received again, so nothing is counted twice', async () => {
    db.transactionApproval.findMany.mockImplementation(async (args: any) => (isReopen([args]) ? rejected : []));
    db.item.count.mockImplementation(async ({ where }: any) => (where.ifmisSlipNumber === '0000152' ? 2 : 0));
    await runStartupUpgrades();
    expect(db.transactionApproval.update.mock.calls.map((c: any[]) => c[0].where.id)).toEqual(['A3']);
  });

  it('runs once: never again after its marker is set', async () => {
    db.systemSetting.findUnique.mockImplementation(async ({ where }: any) => (where.key === REOPEN_REJECTED_MARKER ? { key: where.key, value: 'done' } : null));
    db.transactionApproval.findMany.mockImplementation(async (args: any) => (isReopen([args]) ? rejected : []));
    await runStartupUpgrades();
    expect(db.transactionApproval.update).not.toHaveBeenCalled();
  });

  it('only warns when the database fails, and tries again on the next start', async () => {
    db.transactionApproval.findMany.mockImplementation(async (args: any) => (isReopen([args]) ? rejected : []));
    db.$transaction.mockRejectedValue(new Error('connection lost'));
    await runStartupUpgrades();
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/reopen rejected receipts/), 'connection lost');
    expect(db.systemSetting.create).not.toHaveBeenCalledWith({ data: expect.objectContaining({ key: REOPEN_REJECTED_MARKER }) });
  });
});

describe('startup upgrade: rejected receipts', () => {
  it('moves DISPOSED records that were never disposed of to REJECTED, and logs it once', async () => {
    db.item.updateMany.mockResolvedValue({ count: 2 });
    await runStartupUpgrades();
    expect(db.item.updateMany).toHaveBeenCalledWith({
      where: { status: 'DISPOSED', history: { none: { action: 'DISPOSAL_APPROVED' } } },
      data: { status: 'REJECTED' },
    });
    // Audit entries must belong to an employee: the first System Administrator
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'SYSTEM_UPGRADE_RECEIPT_STATUS', userId: 'EMP-ADMIN-01', userName: 'System upgrade' });
  });

  it('still counts the step as done when the audit entry fails', async () => {
    db.item.updateMany.mockResolvedValue({ count: 1 });
    db.auditLog.create.mockRejectedValue(new Error('Foreign key constraint violated'));
    await runStartupUpgrades();
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/audit entry/), expect.anything());
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringMatching(/did not run/), expect.anything());
  });

  it('writes no audit entry on a database without an administrator', async () => {
    db.item.updateMany.mockResolvedValue({ count: 1 });
    db.employee.findFirst.mockResolvedValue(null);
    await runStartupUpgrades();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('writes no audit entry when there is nothing to move', async () => {
    await runStartupUpgrades();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('startup upgrade: disposal permission', () => {
  it('adds "Request disposals" once to saved roles that can issue items', async () => {
    db.rolePermissionSet.findMany.mockResolvedValue([
      { role: 'DATA_ENCODER', permissions: ['inventory.read', 'stock-out.write'] },
      { role: 'MANAGER', permissions: ['dashboard.read'] },
      // An approver that can also issue would break segregation of duties: left alone
      { role: 'TEAM_LEADER', permissions: ['stock-out.write', 'approvals.endorse'] },
      { role: 'DEPARTMENT_HEAD', permissions: ['stock-out.write', 'disposals.write'] },
    ]);

    await runStartupUpgrades();

    expect(db.rolePermissionSet.update).toHaveBeenCalledTimes(1);
    expect(db.rolePermissionSet.update).toHaveBeenCalledWith({
      where: { role: 'DATA_ENCODER' },
      data: { permissions: ['inventory.read', 'stock-out.write', 'disposals.write'], updatedById: 'system' },
    });
    expect(db.systemSetting.create).toHaveBeenCalledWith({ data: { key: DISPOSALS_GRANT_MARKER, value: 'done', updatedById: 'system' } });
  });

  it("doesn't run again once done, so a permission an administrator removed stays removed", async () => {
    db.systemSetting.findUnique.mockResolvedValue({ key: DISPOSALS_GRANT_MARKER, value: 'done' });
    await runStartupUpgrades();
    expect(db.rolePermissionSet.findMany).not.toHaveBeenCalled();
    expect(db.systemSetting.create).not.toHaveBeenCalled();
  });

  it('only warns when the database fails, so the API still starts', async () => {
    db.item.updateMany.mockRejectedValue(new Error('connection lost'));
    db.systemSetting.findUnique.mockRejectedValue(new Error('connection lost'));
    await expect(runStartupUpgrades()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(3); // rejected receipts, reopening them, disposal permission
  });
});

describe('startup upgrade: organizations from past issues', () => {
  it('lists each organization once, with its contact person, and skips those already in the list', async () => {
    db.transactionApproval.findMany.mockResolvedValue([
      { requestDetails: { recipientType: 'EXTERNAL', organizationName: 'Oromia Bureau of Agriculture', contactPerson: 'Mantegbosh Mirku' } },
      { requestDetails: { recipientType: 'EXTERNAL', organizationName: '  oromia   bureau of agriculture ' } },
      { requestDetails: { recipientType: 'EXTERNAL', organizationName: 'FAO Ethiopia' } },
      { requestDetails: { recipientType: 'INTERNAL', recipientEmployeeId: 'EMP-1' } },
    ]);
    db.item.findMany.mockResolvedValue([{ heldByOrganization: 'Amhara BoA', heldByContact: 'Alemu' }]);
    db.organization.findMany.mockResolvedValue([{ name: 'fao ethiopia' }]);

    await runStartupUpgrades();

    expect(db.organization.create.mock.calls.map((c) => [c[0].data.name, c[0].data.contactPerson])).toEqual([
      ['Oromia Bureau of Agriculture', 'Mantegbosh Mirku'],
      ['Amhara BoA', 'Alemu'],
    ]);
    expect(db.auditLog.create.mock.calls.map((c) => c[0].data.action)).toContain('SYSTEM_UPGRADE_ORGANIZATIONS');
  });

  it('adds nothing when every name is already listed', async () => {
    db.transactionApproval.findMany.mockResolvedValue([{ requestDetails: { recipientType: 'EXTERNAL', organizationName: 'FAO Ethiopia' } }]);
    db.organization.findMany.mockResolvedValue([{ name: 'FAO Ethiopia' }]);
    await runStartupUpgrades();
    expect(db.organization.create).not.toHaveBeenCalled();
  });
});

describe('startup upgrade: programs from default list and past items', () => {
  it('seeds default programs and gathers past item programs', async () => {
    db.program.findMany.mockResolvedValue([{ name: 'MoA' }]);
    db.item.findMany.mockResolvedValue([{ notes: JSON.stringify({ programName: 'Special Ag Project' }) }]);
    await runStartupUpgrades();
    const createdNames = db.program.create.mock.calls.map((c) => c[0].data.name);
    expect(createdNames).toContain('Special Ag Project');
    expect(createdNames).toContain('Food System Resilience Program (FSRP)');
    expect(createdNames).not.toContain('MoA');
    expect(db.auditLog.create.mock.calls.map((c) => c[0].data.action)).toContain('SYSTEM_UPGRADE_PROGRAMS');
  });

  it('adds nothing when all programs are already listed', async () => {
    db.program.findMany.mockResolvedValue([
      { name: 'MoA' },
      { name: 'Food and Nutrition Project team' },
      { name: 'Productive Safety Net Programme (PSNP)' },
      { name: 'Food System Resilience Program (FSRP)' },
      { name: 'Climate Resilient Wheat Value Chain Development (CREW) Project' },
      { name: 'Italian Development Cooperation Agriculture value chain project' },
      { name: 'National Avocado Program' },
      { name: 'Climate Resilient Green Economy Projects' },
      { name: 'Strengthening Drought Resilience project' },
      { name: 'WE_GO' },
      { name: 'Development Response to Displacement Impact Project Phase II' },
      { name: 'Rural Economic Development and Food Security (RED&FS)' },
      { name: 'DRIVE and BREFONS' },
      { name: 'Livestock and Fisheries Sector Development Project (LFSDP)' },
      { name: 'Participatory Agriculture and Climate Transformation Program' },
      { name: 'Sustainable Land Use Management Project (SLMP)' },
      { name: 'Climate Action through Landscape Management (CALM)' },
      { name: 'MoA-DE-RI & Value Enhancement of Pastoral Economies in the Horn of Africa' },
    ]);
    db.item.findMany.mockResolvedValue([]);
    await runStartupUpgrades();
    expect(db.program.create).not.toHaveBeenCalled();
  });
});


describe('startup upgrade: clean generated serial numbers', () => {
  it('identifies and clears timestamp-generated serial numbers, leaving real serials untouched', async () => {
    db.item.findMany.mockResolvedValue([
      { id: 'item-1', serialNumber: 'SN-1729345678910-1' },
      { id: 'item-2', serialNumber: 'SN-1792011873087' },
      { id: 'item-3', serialNumber: 'SN-MF385-2024003' }, // real model serial: keep
      { id: 'item-4', serialNumber: 'SN-77' }, // short serial: keep
    ]);
    db.item.updateMany.mockResolvedValue({ count: 2 });

    await runStartupUpgrades();

    expect(db.item.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['item-1', 'item-2'] } },
      data: { serialNumber: '' },
    });
    expect(db.auditLog.create.mock.calls.map((c) => c[0].data.action)).toContain('SYSTEM_UPGRADE_CLEAR_SERIALS');
  });

  it('does nothing when no items have generated serials', async () => {
    db.item.findMany.mockResolvedValue([
      { id: 'item-3', serialNumber: 'SN-MF385-2024003' },
    ]);

    await runStartupUpgrades();

    expect(db.item.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { serialNumber: '' } })
    );
  });
});

