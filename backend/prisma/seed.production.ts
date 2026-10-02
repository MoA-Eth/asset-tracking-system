import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '../src/security/credentials';
import { checkNewPassword } from '../src/services/access.service';

/**
 * First-time setup for a real installation: one System Administrator and nothing else.
 * No demo items, staff or shared passwords. Everything else is added in the app:
 * stores under Settings → Stores, staff under Settings → Employees (or the HR import),
 * and sign-in for other users under Settings → Users.
 *
 *   ADMIN_EMAIL=...  ADMIN_PASSWORD=...  [ADMIN_NAME=...]  [ADMIN_EMPLOYEE_ID=...]  npm run db:seed:production
 */
const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = (process.env.ADMIN_NAME || 'System Administrator').trim();
  const employeeId = (process.env.ADMIN_EMPLOYEE_ID || 'ADMIN-001').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set ADMIN_EMAIL to the administrator\'s email address.');
  checkNewPassword(password, 'ADMIN_PASSWORD');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');

  const admins = await prisma.employee.count({ where: { role: UserRole.SYSTEM_ADMIN, isActive: true } });
  if (admins > 0) {
    console.log(`This database already has ${admins} active System Administrator(s). Nothing was changed.`);
    return;
  }

  // The administrator needs a department; it is created only if no department exists yet
  const department =
    (await prisma.department.findFirst({ orderBy: { code: 'asc' } })) ??
    (await prisma.department.create({ data: { id: 'DEP-ADMIN', code: 'ADMIN', nameEn: 'System Administration', nameAm: 'የሲስተም አስተዳደር' } }));

  await prisma.employee.create({
    data: {
      id: 'EMP-ADMIN-01',
      payrollId: employeeId,
      fullNameEn: name,
      fullNameAm: '',
      departmentId: department.id,
      email,
      role: UserRole.SYSTEM_ADMIN,
      password: await hashPassword(password),
      // The password came from the person installing the system, so it is replaced at the first sign-in
      mustChangePassword: true,
      isActive: true,
    },
  });
  console.log(`System Administrator created: ${email}. They will be asked to choose a new password at first sign-in.`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
