import { Department } from '../types/asset-management';

/** Codes the system generated for departments that came from employee data (HR's sheet has no codes) */
const GENERATED_CODE = /^U\d{3,}$/;

/** How a department is shown in dropdowns and on slips: its name, plus its code when it has a real one */
export const departmentLabel = (d: Pick<Department, 'nameEn' | 'code'>): string =>
  !d.code || GENERATED_CODE.test(d.code) ? d.nameEn : `${d.nameEn} (${d.code})`;
