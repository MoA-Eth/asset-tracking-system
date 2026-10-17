import { prisma } from '../lib/prisma';
import { BadRequestError, ForbiddenError } from '../errors/app-error';
import { hasPermission } from '../security/role-policy';
import { getTodayGcAndEc } from '../utils/eth-date';

export type SlipAttachmentPolicy = 'REQUIRED' | 'OPTIONAL';

export interface SystemSettings {
  /** Whether a scanned slip must be attached to Stock-In, Stock-Out and Return requests */
  slipAttachmentPolicy: SlipAttachmentPolicy;
  /** Whether the separate scanned slip field is shown on forms (true) or merged into a single uploader (false) */
  showScannedSlipField: boolean;
}

const DEFAULTS: SystemSettings = {
  slipAttachmentPolicy: 'OPTIONAL',
  showScannedSlipField: false,
};
const SLIP_POLICY_KEY = 'slipAttachmentPolicy';
const SHOW_SCANNED_SLIP_KEY = 'showScannedSlipField';
const isSlipPolicy = (value: unknown): value is SlipAttachmentPolicy => value === 'REQUIRED' || value === 'OPTIONAL';

// Kept in memory so every request can check the rule without a database read
let current: SystemSettings = { ...DEFAULTS };

export const getSystemSettings = (): SystemSettings => ({ ...current });
export const isSlipRequired = (): boolean => current.slipAttachmentPolicy === 'REQUIRED';
export const isScannedSlipFieldVisible = (): boolean => current.showScannedSlipField;
export const SLIP_REQUIRED_MESSAGE = 'A scanned copy of the slip is required. Attach it and try again.';

/** For tests and startup only */
export function applySystemSettings(settings: Partial<SystemSettings>): void {
  current = { ...DEFAULTS, ...settings };
}

/** Load the saved settings at startup; if the database isn't ready yet, the built-in defaults apply */
export async function initSystemSettings(): Promise<void> {
  try {
    const rows = await prisma.systemSetting.findMany();
    // A store-man rule saved by an earlier version is ignored: a store with no store man always carries on
    const slip = rows.find((row) => row.key === SLIP_POLICY_KEY)?.value;
    const showSlip = rows.find((row) => row.key === SHOW_SCANNED_SLIP_KEY)?.value;
    applySystemSettings({
      ...(isSlipPolicy(slip) ? { slipAttachmentPolicy: slip } : {}),
      ...(showSlip !== undefined ? { showScannedSlipField: showSlip === 'true' } : {}),
    });
  } catch (err: any) {
    console.warn('Saved system settings could not be loaded; using the built-in defaults.', err?.message ?? err);
  }
}

export async function updateSystemSettings(
  input: { slipAttachmentPolicy?: unknown; showScannedSlipField?: unknown },
  actorId: string
): Promise<SystemSettings> {
  const actor = await prisma.employee.findUnique({ where: { id: actorId } });
  if (!actor || !hasPermission(actor.role, 'references.manage')) {
    throw new ForbiddenError('Only System Administrators can change system settings.');
  }

  if (input?.slipAttachmentPolicy === undefined && input?.showScannedSlipField === undefined) {
    throw new BadRequestError('Choose a setting to update.');
  }

  const previous = getSystemSettings();
  const next: SystemSettings = { ...previous };

  if (input.slipAttachmentPolicy !== undefined) {
    if (!isSlipPolicy(input.slipAttachmentPolicy)) {
      throw new BadRequestError('Choose whether the scanned slip is required or optional.');
    }
    next.slipAttachmentPolicy = input.slipAttachmentPolicy;
    await prisma.systemSetting.upsert({
      where: { key: SLIP_POLICY_KEY },
      create: { key: SLIP_POLICY_KEY, value: next.slipAttachmentPolicy, updatedById: actor.id },
      update: { value: next.slipAttachmentPolicy, updatedById: actor.id },
    });
  }

  if (input.showScannedSlipField !== undefined) {
    if (typeof input.showScannedSlipField !== 'boolean') {
      throw new BadRequestError('Choose whether the scanned slip field is enabled or disabled.');
    }
    next.showScannedSlipField = input.showScannedSlipField;
    await prisma.systemSetting.upsert({
      where: { key: SHOW_SCANNED_SLIP_KEY },
      create: { key: SHOW_SCANNED_SLIP_KEY, value: String(next.showScannedSlipField), updatedById: actor.id },
      update: { value: String(next.showScannedSlipField), updatedById: actor.id },
    });
  }

  applySystemSettings(next);

  const changes: string[] = [];
  if (previous.slipAttachmentPolicy !== next.slipAttachmentPolicy) {
    changes.push('Scanned slip attachment is now ' + (next.slipAttachmentPolicy === 'REQUIRED' ? 'required' : 'optional') + ' for receipts, issues and returns.');
  }
  if (previous.showScannedSlipField !== next.showScannedSlipField) {
    changes.push('Scanned slip field is now ' + (next.showScannedSlipField ? 'shown (two uploaders)' : 'hidden (single uploader)'));
  }

  if (changes.length > 0) {
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
          details: changes.join('; '),
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
