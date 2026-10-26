import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { organizationKey } from './organizations.service';
import { programKey } from './programs.service';
import { DECISION_PERMISSIONS } from '../security/role-policy';
import { getTodayGcAndEc } from '../utils/eth-date';

/** Marks that the one-time grant of the disposal permission has run, so it never re-adds a removed permission */
export const DISPOSALS_GRANT_MARKER = 'upgrade.disposalsPermission';
/** Marks that the old rejected receipts below were reopened, so it never runs again */
export const REOPEN_REJECTED_MARKER = 'upgrade.reopenRejectedReceipts';

/**
 * Receipts rejected for good before a rejection went back to its requester (v2.49.0), which the store asked to correct
 * instead of receiving again (checked on production on 22 Oct 2026): Model 19 No. 0000152 (price entered in USD, 37
 * lines), 0001350 and 0001351 (wrong buyer name). The other old rejections were received again or were test entries.
 */
export const RECEIPTS_TO_REOPEN = ['0000152', '0001350', '0001351'];

/**
 * Data changes that come with a release and must run before the API serves requests.
 * Each step can run on every start without changing anything twice, and a failure only warns:
 * the API still starts, and the step is retried on the next start.
 */
export async function runStartupUpgrades(): Promise<void> {
  await moveRejectedReceipts();
  await reopenRejectedReceipts();
  await grantDisposalPermission();
  await gatherOrganizations();
  await gatherPrograms();
  await cleanGeneratedSerialNumbers();
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

const DEFAULT_PROGRAMS: { name: string; code?: string; description?: string }[] = [
  { name: 'MoA', code: 'MoA', description: 'Ministry of Agriculture core operations' },
  { name: 'Food and Nutrition Project team', code: 'FNP', description: 'Food and nutrition security project' },
  { name: 'Productive Safety Net Programme (PSNP)', code: 'PSNP', description: 'Productive Safety Net Programme' },
  { name: 'Food System Resilience Program (FSRP)', code: 'FSRP', description: 'Food System Resilience Program' },
  { name: 'Climate Resilient Wheat Value Chain Development (CREW) Project', code: 'CREW', description: 'Climate Resilient Wheat Value Chain' },
  { name: 'Italian Development Cooperation Agriculture value chain project', code: 'IDCA', description: 'Italian Development Cooperation Agriculture value chain' },
  { name: 'National Avocado Program', code: 'NAP', description: 'National avocado production and value chain' },
  { name: 'Climate Resilient Green Economy Projects', code: 'CRGE', description: 'Climate Resilient Green Economy initiative' },
  { name: 'Strengthening Drought Resilience project', code: 'SDRP', description: 'Strengthening drought resilience in pastoral and agro-pastoral areas' },
  { name: 'WE_GO', code: 'WE_GO', description: 'Women Economic Growth and Opportunities' },
  { name: 'Development Response to Displacement Impact Project Phase II', code: 'DRDIP II', description: 'Displacement impact project phase 2' },
  { name: 'Rural Economic Development and Food Security (RED&FS)', code: 'RED&FS', description: 'Rural Economic Development and Food Security Sector Working Group' },
  { name: 'DRIVE and BREFONS', code: 'DRIVE', description: 'De-risking, inclusion and value enhancement of pastoral economies' },
  { name: 'Livestock and Fisheries Sector Development Project (LFSDP)', code: 'LFSDP', description: 'Livestock and Fisheries Sector Development Project' },
  { name: 'Participatory Agriculture and Climate Transformation Program', code: 'PACT', description: 'Participatory Agriculture and Climate Transformation Program' },
  { name: 'Sustainable Land Use Management Project (SLMP)', code: 'SLMP', description: 'Sustainable Land Management Project' },
  { name: 'Climate Action through Landscape Management (CALM)', code: 'CALM', description: 'Climate Action through Landscape Management' },
  { name: 'MoA-DE-RI & Value Enhancement of Pastoral Economies in the Horn of Africa', code: 'DE-RI', description: 'Value Enhancement of Pastoral Economies' },
];

/**
 * Seeds default ministry programs / projects and gathers any custom program names from past item registrations.
 * Names already in the list are preserved.
 */
export async function gatherPrograms(): Promise<void> {
  try {
    const existingRows = await prisma.program.findMany({ select: { name: true } });
    const existing = new Set(existingRows.map((p) => programKey(p.name)));
    const toCreate: { name: string; code: string; description: string }[] = [];

    for (const def of DEFAULT_PROGRAMS) {
      const key = programKey(def.name);
      if (!existing.has(key)) {
        existing.add(key);
        toCreate.push({ name: def.name, code: def.code ?? '', description: def.description ?? '' });
      }
    }

    // Also scan past items for any custom programs
    const items = await prisma.item.findMany({ where: { notes: { not: null } }, select: { notes: true } });
    for (const item of items) {
      try {
        if (!item.notes) continue;
        const d = JSON.parse(item.notes);
        if (typeof d.programName === 'string' && d.programName.trim()) {
          const name = d.programName.trim().replace(/\s+/g, ' ').slice(0, 150);
          const key = programKey(name);
          if (!existing.has(key)) {
            existing.add(key);
            toCreate.push({ name, code: '', description: '' });
          }
        }
      } catch {
        // Notes may contain plain text remarks rather than JSON
      }
    }

    if (toCreate.length === 0) return;

    for (const p of toCreate) {
      await prisma.program.create({
        data: {
          id: `PRG-${randomUUID().slice(0, 8).toUpperCase()}`,
          name: p.name,
          code: p.code,
          description: p.description,
          isActive: true,
        },
      });
    }

    console.log(`Upgrade: ${toCreate.length} program(s) seeded/gathered into the programs list.`);
    await recordUpgrade(
      'SYSTEM_UPGRADE_PROGRAMS',
      `${toCreate.length} program(s) added to the program directory: ${toCreate.map((p) => p.name).join(', ')}.`
    );
  } catch (err: any) {
    console.warn('Upgrade step "programs" did not run; it will be retried on the next start.', err?.message ?? err);
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
 * Puts the receipts above back with their requesters, as a rejection does now: the request shows "Rejected · with
 * requester" with its reason, the requester corrects and resubmits it or cancels it, and the records wait as pending
 * receipts. Only lines still rejected for good are touched, and a receipt whose Model 19 No. was received again
 * meanwhile stays closed (reopening it would count the goods twice). Runs once.
 */
async function reopenRejectedReceipts(): Promise<void> {
  try {
    if (await prisma.systemSetting.findUnique({ where: { key: REOPEN_REJECTED_MARKER } })) return;
    const approvals = await prisma.transactionApproval.findMany({
      where: { transactionType: 'STOCK_IN' as any, status: 'REJECTED' as any, ifmisSlipNumber: { in: RECEIPTS_TO_REOPEN }, item: { status: 'REJECTED' as any } },
      select: { id: true, itemId: true, ifmisSlipNumber: true, reviewedById: true, reviewRemarks: true, reviewedAtGc: true, reviewedAtEc: true, endorsedById: true },
    });
    const today = getTodayGcAndEc();
    const reopened: string[] = [];
    for (const slip of RECEIPTS_TO_REOPEN) {
      const lines = approvals.filter((a) => a.ifmisSlipNumber === slip);
      if (lines.length === 0) continue;
      const receivedAgain = await prisma.item.count({ where: { ifmisSlipNumber: slip, status: { not: 'REJECTED' as any } } });
      if (receivedAgain > 0) {
        console.log(`Upgrade: Model 19 ${slip} was received again, so its rejected receipt stays closed.`);
        continue;
      }
      await prisma.$transaction(async (tx) => {
        for (const a of lines) {
          const reason = a.reviewRemarks?.trim() || 'Rejected';
          const stage = a.endorsedById ? 2 : 1;
          await tx.transactionApproval.update({
            where: { id: a.id },
            data: {
              status: 'REJECTED' as any,
              currentStage: 1,
              returnedById: a.reviewedById,
              returnRemarks: reason,
              returnedAtGc: a.reviewedAtGc ?? today.gc,
              returnedAtEc: a.reviewedAtEc ?? today.ec,
              returnedFromStage: stage,
              returnCount: { increment: 1 },
              rejectionFinal: false,
              // Not decided: endorsed and approved again once corrected
              reviewedById: null,
              reviewRemarks: null,
              reviewedAtGc: null,
              reviewedAtEc: null,
              endorsedById: null,
              endorsementRemarks: null,
              endorsedAtGc: null,
              endorsedAtEc: null,
            },
          });
          await tx.item.update({
            where: { id: a.itemId },
            data: {
              status: 'PENDING_STOCK_IN' as any,
              history: {
                create: {
                  dateGc: today.gc,
                  dateEc: today.ec,
                  action: 'STOCK_IN_REOPENED',
                  fromEntity: 'Rejected (Archived)',
                  toEntity: 'Requester (Correction)',
                  performedBy: 'System upgrade',
                  performedByRole: 'SYSTEM_ADMIN' as any,
                  ifmisSlipNumber: slip,
                  notes: `Reopened for correction: a rejected receipt now goes back to its requester, who corrects and resubmits it, or cancels it. Rejected because: ${reason}`,
                },
              },
            },
          });
        }
      });
      reopened.push(`${slip} (${lines.length} ${lines.length === 1 ? 'item' : 'items'})`);
    }
    await prisma.systemSetting.create({ data: { key: REOPEN_REJECTED_MARKER, value: 'done', updatedById: 'system' } });
    if (reopened.length > 0) {
      console.log(`Upgrade: rejected receipt(s) ${reopened.join(', ')} reopened for their requesters to correct.`);
      await recordUpgrade('SYSTEM_UPGRADE_REOPEN_REJECTED', `Rejected receipt(s) on Model 19 ${reopened.join(', ')} reopened: back with their requesters to correct and resubmit, or cancel.`);
    }
  } catch (err: any) {
    console.warn('Upgrade step "reopen rejected receipts" did not run; it will be retried on the next start.', err?.message ?? err);
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

/**
 * Auto-generated timestamp serials (e.g. SN-1729345678910 or SN-1729345678910-1) were previously
 * generated during batch receipt when no serial was provided. Clear them back to empty string.
 */
export async function cleanGeneratedSerialNumbers(): Promise<number> {
  try {
    const items = await prisma.item.findMany({
      where: {
        serialNumber: {
          startsWith: 'SN-',
        },
      },
      select: { id: true, serialNumber: true },
    });
    const generatedIds = items
      .filter((i) => /^SN-\d{10,}(-\d+)?$/i.test(i.serialNumber.trim()))
      .map((i) => i.id);

    if (generatedIds.length > 0) {
      const { count } = await prisma.item.updateMany({
        where: { id: { in: generatedIds } },
        data: { serialNumber: '' },
      });
      console.log(`Upgrade: ${count} auto-generated placeholder serial number(s) cleared.`);
      await recordUpgrade(
        'SYSTEM_UPGRADE_CLEAR_SERIALS',
        `Cleared ${count} auto-generated timestamp serial number(s) from stock-in items.`
      );
      return count;
    }
    return 0;
  } catch (err: any) {
    console.warn('Upgrade step "clean generated serial numbers" did not run; it will be retried on the next start.', err?.message ?? err);
    return 0;
  }
}

