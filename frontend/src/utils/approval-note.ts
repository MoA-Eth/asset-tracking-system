import { Employee, TransactionApproval } from '../types/asset-management';

const ROLE_NAMES: Record<string, string> = {
  TEAM_LEADER: 'Team Leader',
  DEPARTMENT_HEAD: 'Department Head',
  CHIEF_DIRECTOR: 'Chief Director',
  SYSTEM_ADMIN: 'Administrator',
  SUPER_ADMIN: 'Administrator',
};

/** "Getnet Taye (Team Leader)": who decided, with their role, or the stage they decided at when the role is unknown */
const decider = (person?: Employee, stage?: number): string => {
  const role = (person?.role && ROLE_NAMES[person.role]) || (stage === 2 ? 'Department Head' : 'Team Leader');
  return person?.fullNameEn ? `${person.fullNameEn} (${role})` : `the ${role}`;
};

const longDate = (gc?: string) =>
  gc ? new Date(gc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/**
 * Why a voucher isn't approved, printed under its banner: who rejected it (or cancelled it), when, and the reason.
 * Nothing for a request still waiting its turn, or an approved one.
 */
export function approvalNoteOf(a?: TransactionApproval): string | undefined {
  if (!a) return undefined;
  if (a.status === 'REJECTED') {
    const when = longDate(a.returnedAtGc || a.reviewedAtGc);
    const reason = (a.returnRemarks || a.reviewRemarks)?.trim();
    const person = a.returnedBy || a.reviewedBy;
    const stage = a.returnedFromStage || a.currentStage;
    return `Rejected by ${decider(person, stage)}${when ? ` · ${when}` : ''}${reason ? `: ${reason}` : ''}`;
  }
  if (a.status === 'CANCELLED') {
    const when = longDate(a.reviewedAtGc);
    const reason = a.reviewRemarks?.trim();
    return `Cancelled by ${a.reviewedBy?.fullNameEn ?? 'its requester'}${when ? ` · ${when}` : ''}${reason ? `: ${reason}` : ''}`;
  }
  return undefined;
}
