import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  program: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

import {
  createProgram,
  updateProgram,
  setProgramActive,
  deleteProgram,
  listPrograms,
  programKey,
} from './programs.service';

const people: Record<string, { role: string }> = {
  'EMP-ADMIN': { role: 'SYSTEM_ADMIN' },
  'EMP-ENC': { role: 'DATA_ENCODER' },
  'EMP-HEAD': { role: 'DEPARTMENT_HEAD' },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.employee.findUnique.mockImplementation(async ({ where }: any) =>
    people[where.id] ? { id: where.id, fullNameEn: where.id, isActive: true, ...people[where.id] } : null
  );
  db.program.findFirst.mockResolvedValue(null);
  db.program.create.mockImplementation(async ({ data }: any) => data);
  db.program.update.mockImplementation(async ({ where, data }: any) => ({
    id: where.id,
    name: 'Food System Resilience Program (FSRP)',
    code: 'FSRP',
    description: '',
    isActive: true,
    ...data,
  }));
  db.program.delete.mockResolvedValue({});
  db.auditLog.create.mockResolvedValue({});
});

describe('the program / project list', () => {
  it('can be added to by encoders recording receipts or by admins, with input tidied and audited', async () => {
    const created = await createProgram(
      { name: '  Food System Resilience Program (FSRP)  ', code: '  FSRP ', description: 'World Bank project' },
      'EMP-ENC'
    );
    expect(created).toMatchObject({
      name: 'Food System Resilience Program (FSRP)',
      code: 'FSRP',
      description: 'World Bank project',
      isActive: true,
    });
    expect(created.id).toMatch(/^PRG-/);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'CREATE_PROGRAM',
      entityType: 'REFERENCE',
      userId: 'EMP-ENC',
    });
  });

  it('keeps one spelling per program name ignoring case and extra spacing', async () => {
    db.program.findFirst.mockResolvedValue({
      id: 'PRG-1',
      name: 'Food System Resilience Program (FSRP)',
      isActive: true,
    });
    await expect(
      createProgram({ name: 'food system resilience program (fsrp)' }, 'EMP-ENC')
    ).rejects.toMatchObject({
      statusCode: 409,
      message: '"Food System Resilience Program (FSRP)" is already in the list.',
    });
    expect(db.program.create).not.toHaveBeenCalled();
  });

  it('requires a program name and rejects unauthorized roles', async () => {
    await expect(createProgram({ name: '  ' }, 'EMP-ENC')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Program name is required.',
    });
    await expect(createProgram({ name: 'New Initiative' }, 'EMP-HEAD')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('is edited and deactivated by administrators only', async () => {
    db.program.findUnique.mockResolvedValue({
      id: 'PRG-1',
      name: 'Food System Resilience Program (FSRP)',
      code: 'FSRP',
      description: '',
      isActive: true,
    });
    await expect(updateProgram('PRG-1', { name: 'FSRP Phase II' }, 'EMP-ENC')).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(setProgramActive('PRG-1', false, 'EMP-ENC')).rejects.toMatchObject({
      statusCode: 403,
    });

    const updated = await updateProgram(
      'PRG-1',
      { name: 'Food System Resilience Program (FSRP)', code: 'FSRP-2', description: 'Phase 2' },
      'EMP-ADMIN'
    );
    expect(updated).toMatchObject({ code: 'FSRP-2', description: 'Phase 2' });

    const deactivated = await setProgramActive('PRG-1', false, 'EMP-ADMIN');
    expect(deactivated).toMatchObject({ isActive: false });

    expect(db.auditLog.create.mock.calls.map((c) => c[0].data.action)).toEqual([
      'UPDATE_PROGRAM',
      'DEACTIVATE_PROGRAM',
    ]);
  });

  it('can be deleted by administrators', async () => {
    db.program.findUnique.mockResolvedValue({
      id: 'PRG-1',
      name: 'Temporary Project',
      code: 'TMP',
      description: '',
      isActive: true,
    });
    await deleteProgram('PRG-1', 'EMP-ADMIN');
    expect(db.program.delete).toHaveBeenCalledWith({ where: { id: 'PRG-1' } });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'DELETE_PROGRAM',
      entityId: 'PRG-1',
    });
  });

  it('offers only active programs for selection, and all programs in Settings', async () => {
    db.program.findMany.mockResolvedValue([]);
    await listPrograms();
    expect(db.program.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
    await listPrograms({ includeInactive: true });
    expect(db.program.findMany.mock.calls[1][0].where).toEqual({});
  });

  it('treats names that differ only in casing and whitespace as identical keys', () => {
    expect(programKey('  Food System  Resilience ')).toBe(programKey('food system resilience'));
  });
});
