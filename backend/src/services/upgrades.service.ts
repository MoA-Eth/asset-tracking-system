import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { organizationKey } from './organizations.service';
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
  await gatherOrganizations();
}

/**
 * Organizations used to be typed on each issue. They are now a list, so the names already used (on issue requests,
 * and on items held by an organization) become its first entries, one per name: the same name in other capitals or
 * spacing is one organization. Names already in the list are left alone, so this adds nothing on later starts.
 */
async function gatherOrganizations(): Promise<void> {
  try {
    const requests = await prisma.transactionApproval.findMany({ where: { transactionType: 'STOCK_OUT' as any }, select: { requestDetails: true } });
    const held = await prisma.item.findMany({ where: { heldByOrganization: { not: null } }, select: { heldByOrganization: true, heldByContact: true } });
    const found = new Map<string, { name: string; contactPerson: string }>();
    const note = (raw: unknown, contact: unknown) => {
      if (typeof raw !== 'string' || !raw.trim()) return;
      const name = raw.trim().replace(/\s+/g, ' ').slice(0, 150);
      const key = organizationKey(name);
      if (!found.has(key)) found.set(key, { name, contactPerson: typeof contact === 'string' ? contact.trim().slice(0, 100) : '' });
    };
    for (const r of requests) {
      const d = (r.requestDetails ?? {}) as Record<string, unknown>;
      if (d.recipientType === 'EXTERNAL') note(d.organizationName, d.contactPerson);
    }
    for (const i of held) note(i.heldByOrganization, i.heldByContact);
    if (found.size === 0) return;

    const existing = new Set((await prisma.organization.findMany({ select: { name: true } })).map((o) => organizationKey(o.name)));
    const missing = [...found.entries()].filter(([key]) => !existing.has(key)).map(([, o]) => o);
    for (const o of missing) {
      await prisma.organization.create({ data: { id: `ORG-${randomUUID().slice(0, 8).toUpperCase()}`, name: o.name, contactPerson: o.contactPerson, isActive: true } });
    }
    if (missing.length > 0) {
      console.log(`Upgrade: ${missing.length} organization(s) gathered from past issues into the organization list.`);
      await recordUpgrade('SYSTEM_UPGRADE_ORGANIZATIONS', `${missing.length} organization(s) taken from past issues into the organization list: ${missing.map((o) => o.name).join(', ')}.`);
    }
  } catch (err: any) {
    console.warn('Upgrade step "organizations" did not run; it will be retried on the next start.', err?.message ?? err);
  }
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
