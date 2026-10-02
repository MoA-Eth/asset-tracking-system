import { prisma } from '../lib/prisma';
import { BadRequestError, ForbiddenError } from '../errors/app-error';
import { hasPermission } from '../security/role-policy';
import { getTodayGcAndEc } from '../utils/eth-date';

export type SlipAttachmentPolicy = 'REQUIRED' | 'OPTIONAL';

export interface SystemSettings {
  /** Whether a scanned slip must be attached to Stock-In, Stock-Out and Return requests */
  slipAttachmentPolicy: SlipAttachmentPolicy;
}

const DEFAULTS: SystemSettings = { slipAttachmentPolicy: 'OPTIONAL' };
const SLIP_POLICY_KEY = 'slipAttachmentPolicy';
const isSlipPolicy = (value: unknown): value is SlipAttachmentPolicy => value === 'REQUIRED' || value === 'OPTIONAL';

// Kept in memory so every request can check the rule without a database read
let current: SystemSettings = { ...DEFAULTS };

export const getSystemSettings = (): SystemSettings => ({ ...current });
export const isSlipRequired = (): boolean => current.slipAttachmentPolicy === 'REQUIRED';
export const SLIP_REQUIRED_MESSAGE = 'A scanned copy of the slip is required. Attach it and try again.';

/** For tests and startup only */
export function applySystemSettings(settings: Partial<SystemSettings>): void {
  current = { ...DEFAULTS, ...settings };
}

/** Load the saved settings at startup; if the database isn't ready yet, the built-in defaults apply */
export async function initSystemSettings(): Promise<void> {
  try {
    const rows = await prisma.systemSetting.findMany();
    const saved = rows.find((row) => row.key === SLIP_POLICY_KEY)?.value;
    applySystemSettings(isSlipPolicy(saved) ? { slipAttachmentPolicy: saved } : {});
  } catch (err: any) {
    console.warn('Saved system settings could not be loaded; using the built-in defaults.', err?.message ?? err);
  }
}

export async function updateSystemSettings(input: { slipAttachmentPolicy?: unknown }, actorId: string): Promise<SystemSettings> {
  if (!isSlipPolicy(input?.slipAttachmentPolicy)) throw new BadRequestError('Choose whether the scanned slip is required or optional.');
  const actor = await prisma.employee.findUnique({ where: { id: actorId } });
  if (!actor || !hasPermission(actor.role, 'references.manage')) {
    throw new ForbiddenError('Only System Administrators can change system settings.');
  }

  const previous = getSystemSettings();
  const next: SystemSettings = { ...previous, slipAttachmentPolicy: input.slipAttachmentPolicy };
  // Save first, so the running rule never differs from what is stored
  await prisma.systemSetting.upsert({
    where: { key: SLIP_POLICY_KEY },
    create: { key: SLIP_POLICY_KEY, value: next.slipAttachmentPolicy, updatedById: actor.id },
    update: { value: next.slipAttachmentPolicy, updatedById: actor.id },
  });
  applySystemSettings(next);

  if (previous.slipAttachmentPolicy !== next.slipAttachmentPolicy) {
    try {
      const today = getTodayGcAndEc();
      const time = new Date().toLocaleTimeString('en-US', { hour12: false });
      await prisma.auditLog.create({
        data: {
          timestampGc: today.gc + ' ' + time,
          timestampEc: today.ec + ' ' + time,
          userId: actor.id,
          userName: actor.fullNameEn,
          userRole: actor.role,
          action: 'UPDATE_SYSTEM_SETTINGS',
          entityType: 'USER',
          entityId: actor.id,
          details: 'Scanned slip attachment is now ' + (next.slipAttachmentPolicy === 'REQUIRED' ? 'required' : 'optional') + ' for Stock-In, Stock-Out and Return requests.',
          previousState: { ...previous },
          newState: { ...next },
        },
      });
    } catch (err) {
      console.error('Audit log creation failed for the settings change:', err);
    }
  }
  return getSystemSettings();
}
