import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  organization: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

import { createOrganization, updateOrganization, setOrganizationActive, listOrganizations, requireOrganization, organizationKey } from './organizations.service';

const people: Record<string, { role: string }> = {
  'EMP-ADMIN': { role: 'SYSTEM_ADMIN' },
  'EMP-ENC': { role: 'DATA_ENCODER' },
  'EMP-HEAD': { role: 'DEPARTMENT_HEAD' },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  db.employee.findUnique.mockImplementation(async ({ where }: any) => (people[where.id] ? { id: where.id, fullNameEn: where.id, isActive: true, ...people[where.id] } : null));
  db.organization.findFirst.mockResolvedValue(null);
  db.organization.create.mockImplementation(async ({ data }: any) => data);
  db.organization.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, name: 'Oromia Bureau of Agriculture', shortName: '', contactPerson: '', isActive: true, ...data }));
  db.auditLog.create.mockResolvedValue({});
});

describe('the organization list', () => {
  it('can be added to by whoever issues items, with the name tidied and the change audited', async () => {
    const created = await createOrganization({ name: '  Oromia   Bureau of Agriculture ', shortName: 'Oromia BoA', contactPerson: 'Mantegbosh Mirku' }, 'EMP-ENC');
    expect(created).toMatchObject({ name: 'Oromia Bureau of Agriculture', shortName: 'Oromia BoA', contactPerson: 'Mantegbosh Mirku', isActive: true });
    expect(created.id).toMatch(/^ORG-/);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'CREATE_ORGANIZATION', entityType: 'REFERENCE', userId: 'EMP-ENC' });
  });

  it('keeps one spelling per organization', async () => {
    db.organization.findFirst.mockResolvedValue({ id: 'ORG-1', name: 'Oromia Bureau of Agriculture', isActive: true });
    await expect(createOrganization({ name: 'oromia bureau of agriculture' }, 'EMP-ENC'))
      .rejects.toMatchObject({ statusCode: 409, message: '"Oromia Bureau of Agriculture" is already in the list.' });
    expect(db.organization.create).not.toHaveBeenCalled();
  });

  it('needs a name, and refuses roles that neither issue nor manage the lists', async () => {
    await expect(createOrganization({ name: '  ' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 400, message: 'Organization name is required.' });
    await expect(createOrganization({ name: 'FAO' }, 'EMP-HEAD')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('is edited and deactivated by administrators only', async () => {
    db.organization.findUnique.mockResolvedValue({ id: 'ORG-1', name: 'Oromia Bureau of Agriculture', shortName: '', contactPerson: '', isActive: true });
    await expect(updateOrganization('ORG-1', { name: 'Oromia BoA' }, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 403 });
    await expect(setOrganizationActive('ORG-1', false, 'EMP-ENC')).rejects.toMatchObject({ statusCode: 403 });

    expect(await updateOrganization('ORG-1', { name: 'Oromia Bureau of Agriculture', contactPerson: 'Abebe' }, 'EMP-ADMIN')).toMatchObject({ contactPerson: 'Abebe' });
    expect(await setOrganizationActive('ORG-1', false, 'EMP-ADMIN')).toMatchObject({ isActive: false });
    expect(db.auditLog.create.mock.calls.map((c) => c[0].data.action)).toEqual(['UPDATE_ORGANIZATION', 'DEACTIVATE_ORGANIZATION']);
  });

  it('offers only active organizations on the forms, and all of them in Settings', async () => {
    db.organization.findMany.mockResolvedValue([]);
    await listOrganizations();
    expect(db.organization.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
    await listOrganizations({ includeInactive: true });
    expect(db.organization.findMany.mock.calls[1][0].where).toEqual({});
  });

  it('refuses an issue to an organization that is gone or deactivated', async () => {
    db.organization.findUnique.mockResolvedValueOnce(null);
    await expect(requireOrganization(db, 'ORG-X')).rejects.toMatchObject({ statusCode: 400 });
    db.organization.findUnique.mockResolvedValueOnce({ id: 'ORG-2', name: 'Old Project', isActive: false });
    await expect(requireOrganization(db, 'ORG-2')).rejects.toMatchObject({ message: expect.stringContaining('Old Project is deactivated') });
  });

  it('treats names that differ only in capitals and spacing as one', () => {
    expect(organizationKey('  Oromia   Bureau ')).toBe(organizationKey('oromia bureau'));
  });
});
