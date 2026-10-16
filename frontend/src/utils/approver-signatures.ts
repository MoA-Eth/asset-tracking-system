import { TransactionApproval, Employee } from '../types/asset-management';

export interface ApproverProfile {
  role: 'TEAM_LEADER' | 'DEPARTMENT_HEAD' | 'CHIEF_DIRECTOR';
  roleTitle: string;
  nameEn: string;
  nameAm: string;
  jobTitleEn: string;
  jobTitleAm: string;
  signatureUrl: string;
  stampEnUrl: string;
  stampAmUrl: string;
  stampUrl: string;
}

export const APPROVER_PROFILES: Record<'TEAM_LEADER' | 'DEPARTMENT_HEAD' | 'CHIEF_DIRECTOR', ApproverProfile> = {
  TEAM_LEADER: {
    role: 'TEAM_LEADER',
    roleTitle: 'Endorsed By (Team Leader)',
    nameEn: 'Getnet Taye',
    nameAm: 'ጌትነት ታየ',
    jobTitleEn: 'Property Team Leader',
    jobTitleAm: 'የንብረት አስተዳደር ቡድን መሪ',
    signatureUrl: '/signatures/team-leader-signature.jpg',
    stampEnUrl: '/signatures/team-leader-stamp-en.jpg',
    stampAmUrl: '/signatures/team-leader-stamp-am.jpg',
    stampUrl: '/signatures/team-leader-stamp.jpg',
  },
  DEPARTMENT_HEAD: {
    role: 'DEPARTMENT_HEAD',
    roleTitle: 'Approved By (Department Head)',
    nameEn: 'Getaneh G/mariam',
    nameAm: 'ጌታነህ ገ/ማርያም',
    jobTitleEn: 'Executive For Basic Service',
    jobTitleAm: 'ለመሰረታዊ አገልግሎት ዘርፍ ስራ አስፈፃሚ',
    signatureUrl: '/signatures/department-head-signature.jpg',
    stampEnUrl: '/signatures/department-head-stamp-en.jpg',
    stampAmUrl: '/signatures/department-head-stamp-am.jpg',
    stampUrl: '/signatures/department-head-stamp.jpg',
  },
  CHIEF_DIRECTOR: {
    role: 'CHIEF_DIRECTOR',
    roleTitle: 'Approved By (Chief Executive Officer)',
    nameEn: 'Kedir Lubango Jabir',
    nameAm: 'ከድር ሉባንሳ ጀቢር',
    jobTitleEn: 'Acting Chief Executive Officer',
    jobTitleAm: 'ተጠባባቂ የስራ አመራር ዋና ስራ አስፈፃሚ',
    signatureUrl: '/signatures/chief-director-signature.jpg',
    stampEnUrl: '/signatures/chief-director-stamp-en.jpg',
    stampAmUrl: '/signatures/chief-director-stamp-am.jpg',
    stampUrl: '/signatures/chief-director-stamp.jpg',
  },
};

export const CHIEF_DIRECTOR_THRESHOLD_ETB = 10_000_000;

export interface SignatoryItem {
  label: string;
  name?: string;
  title?: string;
  date?: string;
  signatureUrl?: string;
  stampUrl?: string;
  stampAmharicUrl?: string;
}

export function isChiefDirectorApproval(totalAmount?: number, approval?: TransactionApproval): boolean {
  if (approval?.requiredRole === 'CHIEF_DIRECTOR') return true;
  if (approval?.reviewedBy?.role === 'CHIEF_DIRECTOR') return true;
  const amount = Number(totalAmount ?? approval?.totalAmount ?? 0);
  return amount > CHIEF_DIRECTOR_THRESHOLD_ETB;
}

export function getEndorserSignatory(
  approval?: TransactionApproval,
  options?: { isEndorsed?: boolean; endorsedDate?: string; endorsedByName?: string }
): SignatoryItem {
  const profile = APPROVER_PROFILES.TEAM_LEADER;
  const isEndorsed = options?.isEndorsed ?? (approval ? approval.currentStage >= 2 || approval.status === 'APPROVED' : false);
  const name = options?.endorsedByName || approval?.endorsedBy?.fullNameEn || (isEndorsed ? profile.nameEn : undefined);
  const date = options?.endorsedDate || approval?.endorsedAtGc || (isEndorsed ? (approval?.createdAtGc ? approval.createdAtGc.split('T')[0] : new Date().toISOString().split('T')[0]) : undefined);

  return {
    label: 'Endorsed By (Team Leader)',
    name: name,
    title: profile.jobTitleEn,
    date: date,
    signatureUrl: isEndorsed ? profile.signatureUrl : undefined,
    stampUrl: isEndorsed ? profile.stampUrl : undefined,
    stampAmharicUrl: isEndorsed ? profile.stampAmUrl : undefined,
  };
}

export function getAuthorizerSignatory(
  approval?: TransactionApproval,
  options?: { isApproved?: boolean; approvedDate?: string; approvedByName?: string; totalAmount?: number }
): SignatoryItem {
  const amount = options?.totalAmount ?? approval?.totalAmount ?? 0;
  const isChief = isChiefDirectorApproval(amount, approval);
  const profile = isChief ? APPROVER_PROFILES.CHIEF_DIRECTOR : APPROVER_PROFILES.DEPARTMENT_HEAD;
  const isApproved = options?.isApproved ?? (approval ? approval.status === 'APPROVED' : false);
  const name = options?.approvedByName || approval?.reviewedBy?.fullNameEn || (isApproved ? profile.nameEn : undefined);
  const date = options?.approvedDate || approval?.reviewedAtGc || (isApproved ? (approval?.createdAtGc ? approval.createdAtGc.split('T')[0] : new Date().toISOString().split('T')[0]) : undefined);

  return {
    label: isChief ? 'Approved By (Chief Executive Officer)' : 'Approved By (Department Head)',
    name: name,
    title: profile.jobTitleEn,
    date: date,
    signatureUrl: isApproved ? profile.signatureUrl : undefined,
    stampUrl: isApproved ? profile.stampUrl : undefined,
    stampAmharicUrl: isApproved ? profile.stampAmUrl : undefined,
  };
}
