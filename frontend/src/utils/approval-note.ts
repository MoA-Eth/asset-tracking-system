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
 * Why a voucher isn't approved, printed under its banner: who returned it for correction or rejected it, when, and
 * the reason. Nothing for a request still waiting its turn, or an approved one.
 */
export function approvalNoteOf(a?: TransactionApproval): string | undefined {
  if (!a) return undefined;
  if (a.status === 'RETURNED') {
    const when = longDate(a.returnedAtGc);
    const reason = a.returnRemarks?.trim();
    return `Returned for correction by ${decider(a.returnedBy, a.returnedFromStage)}${when ? ` · ${when}` : ''}${reason ? `: ${reason}` : ''}`;
  }
  if (a.status === 'REJECTED') {
    const when = longDate(a.reviewedAtGc);
    const reason = a.reviewRemarks?.trim();
    return `Rejected by ${decider(a.reviewedBy, a.currentStage)}${when ? ` · ${when}` : ''}${reason ? `: ${reason}` : ''}`;
  }
  return undefined;
}
