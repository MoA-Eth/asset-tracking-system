import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors/app-error';
import { Location, LocationInput, UserRole } from '../types/asset-management';
import { getTodayGcAndEc } from '../utils/eth-date';

function validateInput(payload: unknown): LocationInput {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestError('Location details are required.');
  }
  const input = payload as Record<string, unknown>;
  const field = (key: string, label: string, max: number): string => {
    const value =
      typeof input[key] === 'string' ? (input[key] as string).trim() : '';
    if (!value || value.length > max)
      throw new BadRequestError(
        `${label} is required and must be ${max} characters or fewer.`
      );
    return value;
  };
  if (typeof input.isCentralStore !== 'boolean')
    throw new BadRequestError('Central store must be true or false.');
  return {
    siteName: field('siteName', 'Site name', 150),
    building: field('building', 'Building', 100),
    roomNumber: field('roomNumber', 'Room / store', 100),
    isCentralStore: input.isCentralStore,
  };
}

export class LocationService {
  create(payload: unknown, actorId: string): Promise<Location> {
    return this.mutate('CREATE', undefined, validateInput(payload), actorId);
  }

  update(id: string, payload: unknown, actorId: string): Promise<Location> {
    return this.mutate('UPDATE', id, validateInput(payload), actorId);
  }

  remove(id: string, actorId: string): Promise<Location> {
    return this.mutate('DELETE', id, undefined, actorId);
  }

  private async mutate(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    id: string | undefined,
    input: LocationInput | undefined,
    actorId: string
  ): Promise<Location> {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const actor = actorId
            ? await tx.employee.findUnique({
                where: { id: actorId },
                select: { id: true, fullNameEn: true, role: true },
              })
            : null;
          if (actor?.role !== UserRole.SYSTEM_ADMIN)
            throw new ForbiddenError(
              'Only System Administrators can manage locations.'
            );

          const previous =
            action === 'CREATE'
              ? null
              : await tx.location.findUnique({ where: { id } });
          if (action !== 'CREATE' && !previous)
            throw new NotFoundError(
              'Location not found. Refresh the registry and try again.'
            );

          if (input) {
            const duplicate = await tx.location.findFirst({
              where: {
                ...(id ? { id: { not: id } } : {}),
                siteName: { equals: input.siteName, mode: 'insensitive' },
                building: { equals: input.building, mode: 'insensitive' },
                roomNumber: { equals: input.roomNumber, mode: 'insensitive' },
              },
            });
            if (duplicate)
              throw new ConflictError(
                'This site, building, and room already exist in the location registry.'
              );
          }

          // Include disposed assets: deleting their reference would damage historical records.
          if (
            action === 'DELETE' &&
            (await tx.item.count({ where: { storeLocationId: id } })) > 0
          ) {
            throw new ConflictError(
              'This location is linked to asset records and cannot be deleted.'
            );
          }

          const location =
            action === 'CREATE'
              ? await tx.location.create({
                  data: { id: `LOC-${randomUUID()}`, ...input! },
                })
              : action === 'UPDATE'
                ? await tx.location.update({ where: { id }, data: input! })
                : await tx.location.delete({ where: { id } });

          const today = getTodayGcAndEc();
          const time = new Date().toLocaleTimeString('en-US', {
            hour12: false,
          });
          await tx.auditLog.create({
            data: {
              timestampGc: `${today.gc} ${time}`,
              timestampEc: `${today.ec} ${time}`,
              userId: actor.id,
              userName: actor.fullNameEn,
              userRole: actor.role,
              action: `${action}_LOCATION`,
              entityType: 'LOCATION',
              entityId: location.id,
              details: `${action === 'CREATE' ? 'Created' : action === 'UPDATE' ? 'Updated' : 'Deleted'} location: ${location.siteName} / ${location.building} / ${location.roomNumber}`,
              previousState: previous ? { ...previous } : undefined,
              newState: action === 'DELETE' ? undefined : { ...location },
            },
          });
          return location;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003')
          throw new ConflictError(
            'This location is linked to asset records and cannot be deleted.'
          );
        if (error.code === 'P2034')
          throw new ConflictError(
            'The location registry changed while saving. Refresh and try again.'
          );
      }
      throw error;
    }
  }
}
