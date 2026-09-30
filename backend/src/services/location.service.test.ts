import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { LocationService } from './location.service';
import { UserRole } from '../types/asset-management';

const service = new LocationService();
const input = {
  siteName: 'Field Station',
  building: 'Main',
  roomNumber: 'Room 1',
  isCentralStore: false,
};
const original = { id: 'LOC-1', ...input };
let tx: any;
beforeEach(() => {
  tx = {
    employee: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: 'ADMIN',
          fullNameEn: 'Administrator',
          role: UserRole.SYSTEM_ADMIN,
        }),
    },
    location: {
      findUnique: vi.fn().mockResolvedValue(original),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => data),
      update: vi
        .fn()
        .mockImplementation(async ({ where, data }) => ({
          id: where.id,
          ...data,
        })),
      delete: vi.fn().mockResolvedValue(original),
    },
    item: { count: vi.fn().mockResolvedValue(0) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) =>
    callback(tx)
  );
});
afterEach(() => vi.restoreAllMocks());

describe('Location persistence and validation', () => {
  it('creates normalized location fields with a generated ID and transactional audit', async () => {
    const result = await service.create(
      {
        ...input,
        siteName: ' Field Station ',
        id: 'SPOOFED',
        actorId: 'SPOOFED',
      },
      'ADMIN'
    );
    expect(result.id).toMatch(/^LOC-/);
    expect(result.id).not.toBe('SPOOFED');
    expect(result.siteName).toBe('Field Station');
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_LOCATION',
        entityType: 'LOCATION',
        entityId: result.id,
        userId: 'ADMIN',
        newState: result,
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('updates a location in place and audits both versions without changing any assets', async () => {
    const updated = await service.update(
      'LOC-1',
      { ...input, roomNumber: 'New room', isCentralStore: true },
      'ADMIN'
    );
    expect(updated).toEqual({
      ...original,
      roomNumber: 'New room',
      isCentralStore: true,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE_LOCATION',
        previousState: original,
        newState: updated,
      }),
    });
  });

  it('deletes unused locations and keeps their audit subject and previous state', async () => {
    await service.remove('LOC-1', 'ADMIN');
    expect(tx.location.delete).toHaveBeenCalledWith({ where: { id: 'LOC-1' } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DELETE_LOCATION',
        entityId: 'LOC-1',
        previousState: original,
        newState: undefined,
      }),
    });
  });

  it.each([
    null,
    [],
    {},
    { ...input, siteName: '   ' },
    { ...input, building: '' },
    { ...input, roomNumber: '' },
    { ...input, siteName: 'A'.repeat(151) },
    { ...input, building: 'A'.repeat(101) },
    { ...input, roomNumber: 'A'.repeat(101) },
    { ...input, isCentralStore: 'false' },
  ])('rejects malformed or oversized input (%#)', async (payload) => {
    await expect(async () =>
      service.create(payload, 'ADMIN')
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate site/building/room combinations before writing', async () => {
    tx.location.findFirst.mockResolvedValue(original);
    await expect(service.create(input, 'ADMIN')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(tx.location.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        siteName: { equals: input.siteName, mode: 'insensitive' },
        building: { equals: input.building, mode: 'insensitive' },
        roomNumber: { equals: input.roomNumber, mode: 'insensitive' },
      }),
    });
    expect(tx.location.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('blocks deletion when any asset is linked, including disposed assets', async () => {
    tx.item.count.mockResolvedValue(1);
    await expect(service.remove('LOC-1', 'ADMIN')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(tx.item.count).toHaveBeenCalledWith({
      where: { storeLocationId: 'LOC-1' },
    });
    expect(tx.location.delete).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(['update', 'remove'] as const)(
    'returns not found for a missing location on %s',
    async (method) => {
      tx.location.findUnique.mockResolvedValue(null);
      await expect(
        method === 'update'
          ? service.update('MISSING', input, 'ADMIN')
          : service.remove('MISSING', 'ADMIN')
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(tx.location.update).not.toHaveBeenCalled();
      expect(tx.location.delete).not.toHaveBeenCalled();
    }
  );

  it.each([
    UserRole.DATA_ENCODER,
    UserRole.DEPARTMENT_HEAD,
    UserRole.MANAGER,
    UserRole.TEAM_LEADER,
  ])('rechecks the administrator role before writes (%s)', async (role) => {
    tx.employee.findUnique.mockResolvedValue({ id: 'ACTOR', role });
    await expect(service.create(input, 'ACTOR')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(tx.location.create).not.toHaveBeenCalled();
  });

  it('propagates audit failure so the database transaction rolls back', async () => {
    tx.auditLog.create.mockRejectedValue(new Error('Audit unavailable'));
    await expect(service.create(input, 'ADMIN')).rejects.toThrow(
      'Audit unavailable'
    );
  });

  it.each(['P2003', 'P2034'])(
    'translates concurrent reference/write conflicts to 409 (%s)',
    async (code) => {
      vi.mocked(prisma.$transaction).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Conflict', {
          code,
          clientVersion: '6',
        })
      );
      await expect(service.remove('LOC-1', 'ADMIN')).rejects.toMatchObject({
        statusCode: 409,
      });
    }
  );
});
