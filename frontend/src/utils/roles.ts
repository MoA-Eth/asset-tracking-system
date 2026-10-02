/** Display names of the five system roles */
export const ROLE_NAMES: Record<string, string> = {
  SYSTEM_ADMIN: 'System Administrator',
  DATA_ENCODER: 'Data Encoder',
  TEAM_LEADER: 'Team Leader',
  DEPARTMENT_HEAD: 'Department Head',
  MANAGER: 'Manager',
};

export const roleName = (code?: string | null): string => (code ? ROLE_NAMES[code] ?? code.replace(/_/g, ' ') : '');

/** History and audit text can carry a role as a code, e.g. "(TEAM_LEADER)" or "for role DEPARTMENT_HEAD": show its name */
export const withRoleNames = (text: string): string =>
  text.replace(/\b(SYSTEM_ADMIN|DATA_ENCODER|TEAM_LEADER|DEPARTMENT_HEAD)\b/g, (code) => ROLE_NAMES[code]).replace(/(\(|role )MANAGER\b/g, (_, lead) => lead + ROLE_NAMES.MANAGER);
