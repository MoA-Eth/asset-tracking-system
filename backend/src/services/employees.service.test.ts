import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmployee, importEmployees, listEmployees, setEmployeeActive, updateEmployee } from './employees.service';
import { AuthService } from './auth.service';
import { createSessionToken } from '../security/credentials';
import { resetAllRolePermissions, segregationViolations } from '../security/role-policy';
import { UserRole } from '../types/asset-management';

const db = vi.hoisted(() => ({
  employee: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  department: { findUnique: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
  transactionApproval: { count: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

const ADMIN = { id: 'admin', fullNameEn: 'Admin', role: 'SYSTEM_ADMIN', isActive: true, password: 'scrypt$x' };
const ENCODER = { id: 'encoder', fullNameEn: 'Encoder', role: 'DATA_ENCODER', isActive: true, password: 'scrypt$x' };
const STAFF = {
  id: 'staff', payrollId: 'MOA/100', fullNameEn: 'Abebe Kebede', fullNameAm: 'አበበ ከበደ', departmentId: 'DEP-01',
  jobTitle: 'Agronomist', email: null, phone: null, role: null, isActive: true, password: null,
  _count: { custodiedItems: 0 },
};
const people: Record<string, any> = { admin: ADMIN, encoder: ENCODER, staff: STAFF };

const form = (extra: Record<string, unknown> = {}) => ({
  payrollId: 'MOA/200', fullNameEn: 'Hana Tesfaye', fullNameAm: 'ሐና ተስፋዬ', departmentId: 'DEP-01', ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  resetAllRolePermissions();
  db.$transaction.mockImplementation((fn) => fn(db));
  db.employee.findUnique.mockImplementation(({ where }) => Promise.resolve(people[where.id] ? { ...people[where.id] } : null));
  db.employee.create.mockImplementation(({ data }) => Promise.resolve({ ...data }));
  db.employee.update.mockImplementation(({ where, data }) => Promise.resolve({ ...people[where.id], ...data, _count: { custodiedItems: 0 } }));
  db.employee.count.mockResolvedValue(2);
  db.department.findUnique.mockResolvedValue({ id: 'DEP-01' });
  db.transactionApproval.count.mockResolvedValue(0);
});

describe('Employee registry: listing', () => {
  it('gives pickers active staff without contact details', async () => {
    db.employee.findMany.mockResolvedValue([{ ...STAFF, email: 'a@moa.gov.et', phone: '+251911000000' }]);
    const [row] = await listEmployees(UserRole.DATA_ENCODER, { includeInactive: true });
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(row).not.toHaveProperty('email');
    expect(row).not.toHaveProperty('phone');
    expect(row).toMatchObject({ fullNameEn: 'Abebe Kebede', role: null, isActive: true });
  });

  it('gives administrators contact details, items held and, on request, deactivated staff', async () => {
    db.employee.findMany.mockResolvedValue([{ ...STAFF, email: 'a@moa.gov.et', _count: { custodiedItems: 3 } }]);
    const [row] = await listEmployees(UserRole.SYSTEM_ADMIN, { includeInactive: true });
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(row).toMatchObject({ email: 'a@moa.gov.et', heldItemCount: 3 });
  });
});

describe('Employee registry: adding and editing', () => {
  it('adds staff who do not sign in, and records it in the audit log', async () => {
    const created = await createEmployee(form({ jobTitle: 'Driver' }), 'admin');
    expect(created).toMatchObject({ fullNameEn: 'Hana Tesfaye', role: null, isActive: true, jobTitle: 'Driver' });
    expect(db.employee.create).toHaveBeenCalledWith({ data: expect.objectContaining({ password: null, role: null }) });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CREATE_EMPLOYEE', entityType: 'USER' }) });
  });

  it('only lets people who manage employees make changes', async () => {
    await expect(createEmployee(form(), 'encoder')).rejects.toMatchObject({ statusCode: 403 });
    expect(db.employee.create).not.toHaveBeenCalled();
  });

  it('checks required fields, email, phone and department', async () => {
    await expect(createEmployee(form({ fullNameEn: ' ' }), 'admin')).rejects.toThrow('Full name (English) is required.');
    await expect(createEmployee(form({ email: 'not-an-email' }), 'admin')).rejects.toThrow('valid email');
    await expect(createEmployee(form({ phone: 'abc' }), 'admin')).rejects.toThrow('valid phone');
    db.department.findUnique.mockResolvedValue(null);
    await expect(createEmployee(form(), 'admin')).rejects.toThrow('department no longer exists');
  });

  it('needs an email and an initial password to give someone sign-in, and stores only a hash', async () => {
    await expect(createEmployee(form({ role: 'MANAGER' }), 'admin')).rejects.toThrow('initial password');
    await expect(createEmployee(form({ role: 'MANAGER', password: 'longenough' }), 'admin')).rejects.toThrow('email address');
    await expect(createEmployee(form({ role: 'MANAGER', email: 'h@moa.gov.et', password: 'short' }), 'admin')).rejects.toThrow('at least 8');
    await createEmployee(form({ role: 'MANAGER', email: 'H@MOA.gov.et', password: 'longenough' }), 'admin');
    const saved = db.employee.create.mock.calls[0][0].data;
    expect(saved.email).toBe('h@moa.gov.et');
    expect(saved.password).toMatch(/^scrypt\$/);
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain('longenough');
  });

  it('reports a duplicate payroll ID clearly', async () => {
    db.employee.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['payrollId'] } }));
    await expect(createEmployee(form(), 'admin')).rejects.toMatchObject({ statusCode: 409, message: 'Another employee already has this employee ID.' });
  });

  it('refuses an employee ID that differs from an existing one only by letter case', async () => {
    db.employee.findFirst.mockResolvedValueOnce({ id: 'other', payrollId: 'ab-100' });
    await expect(createEmployee(form({ payrollId: 'AB-100' }), 'admin')).rejects.toMatchObject({ statusCode: 409, message: 'Another employee already has this employee ID.' });
    expect(db.employee.findFirst.mock.calls.at(-1)[0].where).toMatchObject({ payrollId: { equals: 'AB-100', mode: 'insensitive' } });
    expect(db.employee.create).not.toHaveBeenCalled();
  });

  it('editing staff details without a role field keeps their sign-in', async () => {
    await updateEmployee('encoder', form({ email: 'e@moa.gov.et' }), 'admin');
    const data = db.employee.update.mock.calls[0][0].data;
    expect(data.role).toBe('DATA_ENCODER');
    expect(data).not.toHaveProperty('password');
  });

  it('removing sign-in clears the password; administrators cannot change their own role', async () => {
    await updateEmployee('encoder', form({ role: '' }), 'admin');
    expect(db.employee.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: null, password: null }) }));
    await expect(updateEmployee('admin', form({ role: 'MANAGER', email: 'a@moa.gov.et' }), 'admin')).rejects.toThrow("can't change your own role");
  });
});

describe('Employee registry: deactivating', () => {
  it('refuses while the employee still holds items or is named on a pending request', async () => {
    people.staff = { ...STAFF, _count: { custodiedItems: 2 } };
    await expect(setEmployeeActive('staff', false, 'admin')).rejects.toThrow('still holds 2 items');
    people.staff = STAFF;
    db.transactionApproval.count.mockResolvedValue(1);
    await expect(setEmployeeActive('staff', false, 'admin')).rejects.toThrow('pending request');
    expect(db.employee.update).not.toHaveBeenCalled();
  });

  it('deactivates and reactivates with an audit entry; never your own account', async () => {
    const off = await setEmployeeActive('staff', false, 'admin');
    expect(off.isActive).toBe(false);
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'DEACTIVATE_EMPLOYEE' }) });
    await expect(setEmployeeActive('admin', false, 'admin')).rejects.toThrow("can't deactivate your own account");
  });

  it('keeps at least one active System Administrator', async () => {
    people.admin2 = { ...ADMIN, id: 'admin2', _count: { custodiedItems: 0 } };
    db.employee.count.mockResolvedValue(1);
    await expect(setEmployeeActive('admin2', false, 'admin')).rejects.toThrow('last active System Administrator');
    delete people.admin2;
  });
});

describe('Sign-in for deactivated staff and staff without a role', () => {
  const auth = AuthService.getInstance();

  it('refuses sign-in after a correct password', async () => {
    db.employee.findFirst.mockResolvedValue({ ...ENCODER, password: 'pw', isActive: false });
    await expect(auth.login({ usernameOrEmail: 'encoder', password: 'pw' })).rejects.toThrow('deactivated');
    db.employee.findFirst.mockResolvedValue({ ...STAFF, password: null });
    await expect(auth.login({ usernameOrEmail: 'MOA/100', password: 'pw' })).rejects.toThrow('is not correct');
  });

  it('ends existing sessions', async () => {
    people.encoder = { ...ENCODER, isActive: false };
    await expect(auth.verifyToken(createSessionToken('encoder'))).rejects.toThrow('no longer has system access');
    people.encoder = ENCODER;
  });
});

describe('Segregation of duties', () => {
  it("doesn't let a role both manage employees and issue items to them", () => {
    expect(segregationViolations(UserRole.DATA_ENCODER, ['stock-out.write', 'employees.manage'])).toHaveLength(1);
    expect(segregationViolations(UserRole.SYSTEM_ADMIN, ['employees.manage', 'roles.assign'])).toEqual([]);
  });
});

describe('Saved permission sets', () => {
  it('always give the System Administrator employee management', async () => {
    const { loadSavedRolePermissions, getEffectiveRolePermissions } = await import('../security/role-policy');
    loadSavedRolePermissions([{ role: 'SYSTEM_ADMIN', permissions: ['roles.assign', 'roles.read', 'references.read'] }]);
    expect(getEffectiveRolePermissions(UserRole.SYSTEM_ADMIN)).toContain('employees.manage');
  });
});

describe('Employee registry: importing an HR spreadsheet', () => {
  const saved = [
    { id: 'e1', payrollId: 'MOA/1', fullNameEn: 'Abebe Kebede', fullNameAm: 'አበበ', departmentId: 'DEP-01', jobTitle: 'Driver', email: null, phone: '+251911000001', isActive: true },
    { id: 'e2', payrollId: 'MOA/2', fullNameEn: 'Sara Ali', fullNameAm: 'ሳራ', departmentId: 'DEP-01', jobTitle: null, email: 'sara@moa.gov.et', phone: null, isActive: false },
  ];
  const sheet = [
    { row: 2, payrollId: 'MOA/1', fullNameEn: 'Abebe Kebede', fullNameAm: 'አበበ', department: 'prop', jobTitle: 'Senior Driver' },
    { row: 3, payrollId: 'MOA/2', fullNameEn: 'Sara Ali', fullNameAm: 'ሳራ', department: 'Procurement & Property', phone: '' },
    { row: 4, payrollId: 'MOA/3', fullNameEn: 'Hana Tesfaye', fullNameAm: 'ሐና', department: 'ICT', phone: 251922000000 },
    { row: 5, payrollId: 'MOA/3', fullNameEn: 'Hana Again', fullNameAm: 'ሐና', department: 'ICT' },
    { row: 6, payrollId: 'MOA/4', fullNameEn: 'Lost Dept', fullNameAm: 'ሀ', department: 'Finance' },
    { row: 7, payrollId: 'MOA/5', fullNameEn: 'Taken Email', fullNameAm: 'ሀ', department: 'ICT', email: 'SARA@moa.gov.et' },
    { row: 8, payrollId: 'MOA/6', fullNameEn: '', fullNameAm: 'ሀ', department: 'ICT' },
  ];

  beforeEach(() => {
    db.department.findMany.mockResolvedValue([
      { id: 'DEP-01', code: 'PROP', nameEn: 'Procurement & Property', nameAm: 'ግዥ' },
      { id: 'DEP-02', code: 'ICT', nameEn: 'Digital Agriculture & ICT', nameAm: 'አይሲቲ' },
    ]);
    db.employee.findMany.mockResolvedValue(saved);
  });

  it('checks every row without saving anything', async () => {
    const result = await importEmployees(sheet, false, 'admin');
    expect(result.applied).toBe(false);
    expect(result.counts).toEqual({ create: 2, update: 1, unchanged: 1, error: 3 });
    expect(result.newDepartments).toEqual(['Finance']);
    const byRow = Object.fromEntries(result.rows.map((r) => [r.row, r]));
    expect(byRow[2]).toMatchObject({ action: 'update', changes: ['job title'], department: 'Procurement & Property' });
    expect(byRow[3]).toMatchObject({ action: 'unchanged', inactive: true });
    expect(byRow[4]).toMatchObject({ action: 'create' });
    expect(byRow[5].message).toContain('also on row 4');
    expect(byRow[6]).toMatchObject({ action: 'create', department: 'Finance' });
    expect(byRow[7].message).toContain('already belongs to Sara Ali');
    expect(byRow[8].message).toContain('Full name (English) is required');
    expect(db.employee.createMany).not.toHaveBeenCalled();
    expect(db.department.createMany).not.toHaveBeenCalled();
    expect(db.employee.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('saves new staff without sign-in and updates known payroll IDs, in one transaction', async () => {
    const result = await importEmployees(sheet, true, 'admin');
    expect(result.applied).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const added = db.employee.createMany.mock.calls[0][0].data;
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ payrollId: 'MOA/3', departmentId: 'DEP-02', phone: '251922000000', role: null, password: null, isActive: true });
    // The department the file names but the system lacks is created, and its staff are attached to it
    const [newDept] = db.department.createMany.mock.calls[0][0].data;
    expect(newDept).toMatchObject({ code: 'U001', nameEn: 'Finance', nameAm: 'Finance' });
    expect(added[1]).toMatchObject({ payrollId: 'MOA/4', departmentId: newDept.id });
    expect(db.employee.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { jobTitle: 'Senior Driver' } });
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'IMPORT_EMPLOYEES' }) });
  });

  it('only for people who manage employees, and within the size limit', async () => {
    await expect(importEmployees(sheet, false, 'encoder')).rejects.toMatchObject({ statusCode: 403 });
    await expect(importEmployees([], false, 'admin')).rejects.toThrow('no employee rows');
    await expect(importEmployees(new Array(5001).fill({}), false, 'admin')).rejects.toThrow('at most 5,000');
  });
});

describe('Amharic name', () => {
  it('is optional on the form and in an import', async () => {
    const created = await createEmployee(form({ fullNameAm: '' }), 'admin');
    expect(created.fullNameAm).toBe('');
    db.department.findMany.mockResolvedValue([{ id: 'DEP-01', code: 'PROP', nameEn: 'Procurement & Property', nameAm: 'ግዥ' }]);
    db.employee.findMany.mockResolvedValue([{ id: 'e1', payrollId: 'MOA/1', fullNameEn: 'Abebe Kebede', fullNameAm: 'አበበ', departmentId: 'DEP-01', isActive: true }]);
    const result = await importEmployees(
      [
        { row: 2, payrollId: 'MOA/9', fullNameEn: 'No Amharic', department: 'PROP' },
        { row: 3, payrollId: 'MOA/1', fullNameEn: 'Abebe Kebede', department: 'PROP' },
      ],
      true,
      'admin',
    );
    expect(result.counts).toMatchObject({ create: 1, unchanged: 1, error: 0 });
    expect(db.employee.createMany.mock.calls[0][0].data[0]).toMatchObject({ payrollId: 'MOA/9', fullNameAm: '' });
  });

  it('rejects Latin characters and requires Ethiopic script', async () => {
    await expect(createEmployee(form({ fullNameAm: 'Abebe Kebede' }), 'admin')).rejects.toThrow(
      'Full name (Amharic) must be written in the Ethiopic script and cannot contain Latin characters.',
    );
    await expect(createEmployee(form({ fullNameAm: '---' }), 'admin')).rejects.toThrow(
      'Full name (Amharic) must contain Ethiopic script characters.',
    );
  });
});

describe("HR's sheet", () => {
  beforeEach(() => {
    db.department.findMany.mockResolvedValue([{ id: 'DEP-09', code: 'U001', nameEn: 'የፋይናንስ ሥራ አስፈጻሚ', nameAm: 'የፋይናንስ ሥራ አስፈጻሚ' }]);
    db.employee.findMany.mockResolvedValue([]);
  });

  it('imports unit and gender, and creates each new main work unit once', async () => {
    const result = await importEmployees(
      [
        { row: 2, payrollId: '00275823', fullNameEn: 'Getahun Bahiru', fullNameAm: 'ጌታሁን ባህሩ', department: 'የኢፒዲሞሎጂ ዴስክ', unit: 'የኢፒዲሞሎጂ ዴስክ መደቦች', gender: 'ወንድ', jobTitle: 'የእንስሳት ሐኪም' },
        { row: 3, payrollId: '00274174', fullNameEn: 'Abebech Dejene', fullNameAm: 'አበበች ደጀኔ', department: 'የኢፒዲሞሎጂ  ዴስክ', gender: 'ሴት' },
        { row: 4, payrollId: '00280001', fullNameEn: 'Finance Person', department: 'የፋይናንስ  ሥራ አስፈጻሚ', gender: 'F' },
        { row: 5, payrollId: '00280002', fullNameEn: 'Bad Gender', department: 'የማይታወቅ ክፍል', gender: 'other' },
      ],
      true,
      'admin',
    );
    expect(result.counts).toEqual({ create: 3, update: 0, unchanged: 0, error: 1 });
    // One new department for both spellings of the same unit; none for the row that was skipped
    expect(result.newDepartments).toEqual(['የኢፒዲሞሎጂ ዴስክ']);
    const depts = db.department.createMany.mock.calls[0][0].data;
    expect(depts).toHaveLength(1);
    expect(depts[0].code).toBe('U002');
    const added = db.employee.createMany.mock.calls[0][0].data;
    expect(added[0]).toMatchObject({ payrollId: '00275823', unit: 'የኢፒዲሞሎጂ ዴስክ መደቦች', gender: 'MALE', departmentId: depts[0].id });
    expect(added[1]).toMatchObject({ gender: 'FEMALE', departmentId: depts[0].id });
    expect(added[2]).toMatchObject({ gender: 'FEMALE', departmentId: 'DEP-09' });
    expect(result.rows.find((r) => r.row === 5)?.message).toContain('Gender must be');
  });

  it('shows gender only to people who manage employees', async () => {
    db.employee.findMany.mockResolvedValue([{ ...STAFF, unit: 'Transport', gender: 'MALE' }]);
    const [forPicker] = await listEmployees(UserRole.DATA_ENCODER);
    expect(forPicker).toMatchObject({ unit: 'Transport' });
    expect(forPicker).not.toHaveProperty('gender');
    const [forAdmin] = await listEmployees(UserRole.SYSTEM_ADMIN);
    expect(forAdmin).toMatchObject({ unit: 'Transport', gender: 'MALE' });
  });
});

describe('Department on the employee form', () => {
  beforeEach(() => {
    db.department.findMany.mockResolvedValue([{ id: 'DEP-01', code: 'U001', nameEn: 'የፋይናንስ ሥራ አስፈጻሚ', nameAm: 'የፋይናንስ ሥራ አስፈጻሚ' }]);
    (db.department as any).create = vi.fn(({ data }: any) => Promise.resolve(data));
  });

  it('uses an existing department when its name is typed, whatever the spacing or case', async () => {
    await createEmployee({ payrollId: 'MOA/300', fullNameEn: 'Hana', departmentName: ' የፋይናንስ   ሥራ አስፈጻሚ ' }, 'admin');
    expect((db.department as any).create).not.toHaveBeenCalled();
    expect(db.employee.create.mock.calls[0][0].data.departmentId).toBe('DEP-01');
  });

  it('creates the department when the name is new, and says so in the audit log', async () => {
    await createEmployee({ payrollId: 'MOA/301', fullNameEn: 'Sara', departmentName: 'የግዥ ሥራ አስፈጻሚ' }, 'admin');
    const dept = (db.department as any).create.mock.calls[0][0].data;
    expect(dept).toMatchObject({ code: 'U002', nameEn: 'የግዥ ሥራ አስፈጻሚ', nameAm: 'የግዥ ሥራ አስፈጻሚ' });
    expect(db.employee.create.mock.calls[0][0].data.departmentId).toBe(dept.id);
    expect(db.auditLog.create.mock.calls[0][0].data.details).toContain('New department: የግዥ ሥራ አስፈጻሚ.');
  });

  it('needs a department either way', async () => {
    await expect(createEmployee({ payrollId: 'MOA/302', fullNameEn: 'No Dept' }, 'admin')).rejects.toThrow('Department is required.');
  });
});
