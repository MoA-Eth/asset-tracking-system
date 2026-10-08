import { prisma } from '../lib/prisma';
import { DECISION_PERMISSIONS } from '../security/role-policy';
import { getTodayGcAndEc } from '../utils/eth-date';

/** Marks that the one-time grant of the disposal permission has run, so it never re-adds a removed permission */
export const DISPOSALS_GRANT_MARKER = 'upgrade.disposalsPermission';

/**
 * Data changes that come with a release and must run before the API serves requests.
 * Each step can run on every start without changing anything twice, and a failure only warns:
 * the API still starts, and the step is retried on the next start.
 */
export async function runStartupUpgrades(): Promise<void> {
  await moveRejectedReceipts();
  await grantDisposalPermission();
}

/**
 * Rejected receipts used to be marked DISPOSED. They now have their own status, REJECTED, and DISPOSED
 * means an approved disposal. Every approved disposal leaves a DISPOSAL_APPROVED history entry,
 * so only records without one are moved.
 */
async function moveRejectedReceipts(): Promise<void> {
  try {
    const { count } = await prisma.item.updateMany({
      where: { status: 'DISPOSED' as any, history: { none: { action: 'DISPOSAL_APPROVED' } } },
      data: { status: 'REJECTED' as any },
    });
    if (count > 0) {
      console.log(`Upgrade: ${count} rejected receipt record(s) now have status REJECTED.`);
      await recordUpgrade('SYSTEM_UPGRADE_RECEIPT_STATUS', `${count} rejected receipt record(s) moved from status DISPOSED to REJECTED.`);
    }
  } catch (err: any) {
    console.warn('Upgrade step "rejected receipts" did not run; it will be retried on the next start.', err?.message ?? err);
  }
}

/**
 * Notes a data upgrade in the audit log. Entries must belong to an employee, so it is recorded under the
 * first System Administrator; without one (a fresh database) there is nothing to note.
 */
async function recordUpgrade(action: string, details: string): Promise<void> {
  try {
    const admin = await prisma.employee.findFirst({ where: { role: 'SYSTEM_ADMIN' as any }, orderBy: { id: 'asc' } });
    if (!admin) return;
    const today = getTodayGcAndEc();
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    await prisma.auditLog.create({
      data: {
        timestampGc: `${today.gc} ${time}`,
        timestampEc: `${today.ec} ${time}`,
        userId: admin.id,
        userName: 'System upgrade',
        userRole: 'SYSTEM_ADMIN' as any,
        action,
        entityType: 'ITEM' as any,
        entityId: 'items',
        details,
      },
    });
  } catch (err: any) {
    console.warn(`The audit entry for upgrade ${action} could not be written.`, err?.message ?? err);
  }
}

/**
 * Roles with saved permission settings don't pick up new defaults. Give "Request disposals" once to the
 * saved roles that can already issue items, unless that role also approves (segregation of duties).
 */
async function grantDisposalPermission(): Promise<void> {
  try {
    if (await prisma.systemSetting.findUnique({ where: { key: DISPOSALS_GRANT_MARKER } })) return;
    const rows = await prisma.rolePermissionSet.findMany();
    for (const row of rows) {
      const perms = row.permissions;
      const approves = DECISION_PERMISSIONS.some((p) => perms.includes(p));
      if (perms.includes('stock-out.write') && !perms.includes('disposals.write') && !approves) {
        await prisma.rolePermissionSet.update({
          where: { role: row.role },
          data: { permissions: [...perms, 'disposals.write'], updatedById: 'system' },
        });
        console.log(`Upgrade: role ${row.role} can now request disposals.`);
      }
    }
    await prisma.systemSetting.create({ data: { key: DISPOSALS_GRANT_MARKER, value: 'done', updatedById: 'system' } });
  } catch (err: any) {
    console.warn('Upgrade step "disposal permission" did not run; it will be retried on the next start.', err?.message ?? err);
  }
}
