/** Display names of the five system roles */
export const ROLE_NAMES: Record<string, string> = {
  SYSTEM_ADMIN: 'System Administrator',
  DATA_ENCODER: 'Data Encoder',
  TEAM_LEADER: 'Team Leader',
  DEPARTMENT_HEAD: 'Department Head',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

export const roleName = (code?: string | null): string => (code ? ROLE_NAMES[code] ?? code.replace(/_/g, ' ') : '');

/**
 * An action code in plain words, using the names on the menu:
 * "APPROVE_STOCK_IN" → "Approve receipt", "STOCK_OUT_REJECTED" → "Issue rejected"
 */
export const actionText = (code: string): string => {
  const text = code.replace(/STOCK_IN/g, 'RECEIPT').replace(/STOCK_OUT/g, 'ISSUE').replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** History and audit text can carry a role as a code, e.g. "(TEAM_LEADER)" or "for role DEPARTMENT_HEAD": show its name */
export const withRoleNames = (text: string): string =>
  text.replace(/\b(SYSTEM_ADMIN|DATA_ENCODER|TEAM_LEADER|DEPARTMENT_HEAD)\b/g, (code) => ROLE_NAMES[code]).replace(/(\(|role )MANAGER\b/g, (_, lead) => lead + ROLE_NAMES.MANAGER);
