import { prisma } from '../lib/prisma';
import { BadRequestError, ForbiddenError } from '../errors/app-error';
import { hasPermission } from '../security/role-policy';
import { getTodayGcAndEc } from '../utils/eth-date';

export type SlipAttachmentPolicy = 'REQUIRED' | 'OPTIONAL';
export type StoreManPolicy = 'REQUIRED' | 'OPTIONAL';

export interface SystemSettings {
  /** Whether a scanned slip must be attached to Stock-In, Stock-Out and Return requests */
  slipAttachmentPolicy: SlipAttachmentPolicy;
  /**
   * Whether a store with no store man refuses receiving, issuing, disposing and returns.
   * OPTIONAL (the default): a store that has store men must name one; a store with none carries on as before.
   * REQUIRED: a store with none refuses. Switch it on once every store has a store man.
   */
  storeManPolicy: StoreManPolicy;
}

const DEFAULTS: SystemSettings = { slipAttachmentPolicy: 'OPTIONAL', storeManPolicy: 'OPTIONAL' };
const SLIP_POLICY_KEY = 'slipAttachmentPolicy';
const STORE_MAN_POLICY_KEY = 'storeManPolicy';
const isSlipPolicy = (value: unknown): value is SlipAttachmentPolicy => value === 'REQUIRED' || value === 'OPTIONAL';
const isStoreManPolicy = (value: unknown): value is StoreManPolicy => value === 'REQUIRED' || value === 'OPTIONAL';

// Kept in memory so every request can check the rule without a database read
let current: SystemSettings = { ...DEFAULTS };

export const getSystemSettings = (): SystemSettings => ({ ...current });
export const isSlipRequired = (): boolean => current.slipAttachmentPolicy === 'REQUIRED';
export const isStoreManRequired = (): boolean => current.storeManPolicy === 'REQUIRED';
export const SLIP_REQUIRED_MESSAGE = 'A scanned copy of the slip is required. Attach it and try again.';

/** For tests and startup only */
export function applySystemSettings(settings: Partial<SystemSettings>): void {
  current = { ...DEFAULTS, ...settings };
}

/** Load the saved settings at startup; if the database isn't ready yet, the built-in defaults apply */
export async function initSystemSettings(): Promise<void> {
  try {
    const rows = await prisma.systemSetting.findMany();
    const slip = rows.find((row) => row.key === SLIP_POLICY_KEY)?.value;
    const storeMan = rows.find((row) => row.key === STORE_MAN_POLICY_KEY)?.value;
    applySystemSettings({
      ...(isSlipPolicy(slip) ? { slipAttachmentPolicy: slip } : {}),
      ...(isStoreManPolicy(storeMan) ? { storeManPolicy: storeMan } : {}),
    });
  } catch (err: any) {
    console.warn('Saved system settings could not be loaded; using the built-in defaults.', err?.message ?? err);
  }
}

export async function updateSystemSettings(
  input: { slipAttachmentPolicy?: unknown; storeManPolicy?: unknown },
  actorId: string,
): Promise<SystemSettings> {
  const given = (key: string) => !!input && Object.prototype.hasOwnProperty.call(input, key) && (input as any)[key] !== undefined;
  if (given('slipAttachmentPolicy') && !isSlipPolicy(input.slipAttachmentPolicy)) {
    throw new BadRequestError('Choose whether the scanned slip is required or optional.');
  }
  if (given('storeManPolicy') && !isStoreManPolicy(input.storeManPolicy)) {
    throw new BadRequestError('Choose whether a store man is required or optional.');
  }
  if (!given('slipAttachmentPolicy') && !given('storeManPolicy')) {
    throw new BadRequestError('Choose whether the scanned slip is required or optional.');
  }
  const actor = await prisma.employee.findUnique({ where: { id: actorId } });
  if (!actor || !hasPermission(actor.role, 'references.manage')) {
    throw new ForbiddenError('Only System Administrators can change system settings.');
  }

  const previous = getSystemSettings();
  const next: SystemSettings = {
    ...previous,
    ...(given('slipAttachmentPolicy') ? { slipAttachmentPolicy: input.slipAttachmentPolicy as SlipAttachmentPolicy } : {}),
    ...(given('storeManPolicy') ? { storeManPolicy: input.storeManPolicy as StoreManPolicy } : {}),
  };

  // Save first, so the running rule never differs from what is stored
  const save = (key: string, value: string) =>
    prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, updatedById: actor.id },
      update: { value, updatedById: actor.id },
    });
  if (given('slipAttachmentPolicy')) await save(SLIP_POLICY_KEY, next.slipAttachmentPolicy);
  if (given('storeManPolicy')) await save(STORE_MAN_POLICY_KEY, next.storeManPolicy);
  applySystemSettings(next);

  const changes: string[] = [];
  if (previous.slipAttachmentPolicy !== next.slipAttachmentPolicy) {
    changes.push('Scanned slip attachment is now ' + (next.slipAttachmentPolicy === 'REQUIRED' ? 'required' : 'optional') + ' for receipts, issues and returns.');
  }
  if (previous.storeManPolicy !== next.storeManPolicy) {
    changes.push(
      next.storeManPolicy === 'REQUIRED'
        ? 'A store man is now required: a store with none assigned refuses receipts, issues, disposals and returns.'
        : 'A store man is now optional: a store with none assigned carries on without naming one.',
    );
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
          details: changes.join(' '),
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
