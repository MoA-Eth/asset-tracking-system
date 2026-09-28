import { PrismaClient, UserRole, AssetCategory, ItemStatus, TransactionType, ApprovalStatus, AuditEntityType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding MoA-AMS database...');

  // ── Departments ───────────────────────────────────────────────────────────
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { id: 'DEP-01' },
      update: {},
      create: { id: 'DEP-01', code: 'EXT', nameEn: 'Agricultural Extension Directorate', nameAm: 'የግብርና ኤክስቴንሽን ዳይሬክቶሬት', headEmployeeId: 'EMP-HEAD-01' },
    }),
    prisma.department.upsert({
      where: { id: 'DEP-02' },
      update: {},
      create: { id: 'DEP-02', code: 'HORT', nameEn: 'Horticulture Development Directorate', nameAm: 'የሆርቲካልቸር ልማት ዳይሬክቶሬት', headEmployeeId: 'EMP-HEAD-02' },
    }),
    prisma.department.upsert({
      where: { id: 'DEP-03' },
      update: {},
      create: { id: 'DEP-03', code: 'PROP', nameEn: 'Procurement & Property Administration', nameAm: 'የግዥና ንብረት አስተዳደር ዳይሬክቶሬት', headEmployeeId: 'EMP-HEAD-03' },
    }),
    prisma.department.upsert({
      where: { id: 'DEP-04' },
      update: {},
      create: { id: 'DEP-04', code: 'ICT', nameEn: 'Digital Agriculture & ICT Directorate', nameAm: 'የኢንፎርሜሽን ቴክኖሎጂ ዳይሬክቶሬት', headEmployeeId: 'EMP-HEAD-04' },
    }),
    prisma.department.upsert({
      where: { id: 'DEP-05' },
      update: {},
      create: { id: 'DEP-05', code: 'NRM', nameEn: 'Natural Resource Management', nameAm: 'የተፈጥሮ ሀብት አስተዳደር', headEmployeeId: 'EMP-HEAD-05' },
    }),
  ]);
  console.log(`  ✅ ${departments.length} departments seeded`);

  // ── Locations ─────────────────────────────────────────────────────────────
  const locations = await Promise.all([
    prisma.location.upsert({
      where: { id: 'LOC-01' },
      update: {},
      create: { id: 'LOC-01', siteName: 'MoA Headquarters (Addis Ababa)', building: 'Block B', roomNumber: 'Central Store-01', isCentralStore: true },
    }),
    prisma.location.upsert({
      where: { id: 'LOC-02' },
      update: {},
      create: { id: 'LOC-02', siteName: 'MoA Headquarters (Addis Ababa)', building: 'Block A', roomNumber: 'Office 304', isCentralStore: false },
    }),
    prisma.location.upsert({
      where: { id: 'LOC-03' },
      update: {},
      create: { id: 'LOC-03', siteName: 'Melkassa Agricultural Research Center', building: 'Machinery Depot', roomNumber: 'Hangar A', isCentralStore: true },
    }),
    prisma.location.upsert({
      where: { id: 'LOC-04' },
      update: {},
      create: { id: 'LOC-04', siteName: 'Kulumsa Agricultural Research Center', building: 'Agronomy Building', roomNumber: 'Store 02', isCentralStore: true },
    }),
  ]);
  console.log(`  ✅ ${locations.length} locations seeded`);

  // ── Employees ─────────────────────────────────────────────────────────────
  const employees = await Promise.all([
    // Minister
    prisma.employee.upsert({
      where: { id: 'EMP-MIN-01' },
      update: { password: 'moaams2024' },
      create: { id: 'EMP-MIN-01', payrollId: 'MOA/EXEC-001', fullNameEn: 'H.E. Mr. Addisu Arega (Minister)', fullNameAm: 'ክቡር አቶ አዲሱ አረጋ (ሚኒስትር)', departmentId: 'DEP-03', email: 'minister@moa.gov.et', phone: '+251911000001', role: UserRole.TOP_MANAGEMENT, password: 'moaams2024' },
    }),
    // Department Heads
    prisma.employee.upsert({
      where: { id: 'EMP-HEAD-01' },
      update: { password: 'moaams2024' },
      create: { id: 'EMP-HEAD-01', payrollId: 'MOA/DIR-012', fullNameEn: 'Tigist Haile (Extension Director)', fullNameAm: 'ትዕግስት ኃይሌ (ዳይሬክተር)', departmentId: 'DEP-01', email: 'tigist.h@moa.gov.et', phone: '+251922334455', role: UserRole.DEPARTMENT_HEAD, password: 'moaams2024' },
    }),
    prisma.employee.upsert({
      where: { id: 'EMP-HEAD-03' },
      update: { password: 'moaams2024' },
      create: { id: 'EMP-HEAD-03', payrollId: 'MOA/DIR-008', fullNameEn: 'Dawit Tadesse (Property Director)', fullNameAm: 'ዳዊት ታደሰ (የንብረት ዳይሬክተር)', departmentId: 'DEP-03', email: 'dawit.t@moa.gov.et', phone: '+251933445566', role: UserRole.DEPARTMENT_HEAD, password: 'moaams2024' },
    }),
    prisma.employee.upsert({
      where: { id: 'EMP-HEAD-04' },
      update: { password: 'moaams2024' },
      create: { id: 'EMP-HEAD-04', payrollId: 'MOA/DIR-019', fullNameEn: 'Selamawit Bekele (ICT Director)', fullNameAm: 'ሰላማዊት በቀለ (ICT ዳይሬክተር)', departmentId: 'DEP-04', email: 'selamawit.b@moa.gov.et', phone: '+251944556677', role: UserRole.DEPARTMENT_HEAD, password: 'moaams2024' },
    }),
    // Data Encoders / Store Custodians
    prisma.employee.upsert({
      where: { id: 'EMP-ENC-01' },
      update: { password: 'moaams2024' },
      create: { id: 'EMP-ENC-01', payrollId: 'MOA/STR-045', fullNameEn: 'Abebe Kebede (Store Custodian)', fullNameAm: 'አበበ ከበደ (የመጋዘን ሃላፊ)', departmentId: 'DEP-03', email: 'abebe.k@moa.gov.et', phone: '+251955667788', role: UserRole.DATA_ENCODER, password: 'moaams2024' },
    }),
    prisma.employee.upsert({
      where: { id: 'EMP-ENC-02' },
      update: { password: 'moaams2024' },
      create: { id: 'EMP-ENC-02', payrollId: 'MOA/STR-046', fullNameEn: 'Meron Alemu (Store Officer)', fullNameAm: 'ሜሮን አለሙ (የመጋዘን ሹም)', departmentId: 'DEP-03', email: 'meron.a@moa.gov.et', phone: '+251966778899', role: UserRole.DATA_ENCODER, password: 'moaams2024' },
    }),
    // Regular staff (recipients)
    prisma.employee.upsert({
      where: { id: 'EMP-STAFF-01' },
      update: { password: 'moaams2024' },
      create: { id: 'EMP-STAFF-01', payrollId: 'MOA/EXT-078', fullNameEn: 'Kebede Alemu (Field Officer)', fullNameAm: 'ከበደ አለሙ (የሜዳ ሹም)', departmentId: 'DEP-01', email: 'kebede.a@moa.gov.et', phone: '+251977889900', role: UserRole.DATA_ENCODER, password: 'moaams2024' },
    }),
    prisma.employee.upsert({
      where: { id: 'EMP-STAFF-02' },
      update: { password: 'moaams2024' },
      create: { id: 'EMP-STAFF-02', payrollId: 'MOA/ICT-023', fullNameEn: 'Hiwot Tesfaye (Systems Analyst)', fullNameAm: 'ህይወት ተስፋዬ (የስርዓት ተንታኝ)', departmentId: 'DEP-04', email: 'hiwot.t@moa.gov.et', phone: '+251988990011', role: UserRole.DATA_ENCODER, password: 'moaams2024' },
    }),
  ]);
  console.log(`  ✅ ${employees.length} employees seeded`);

  // ── Sample Items ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  const item1 = await prisma.item.upsert({
    where: { itemCode: 'MOA-IT-2024-0001' },
    update: {},
    create: {
      id: 'ITEM-SEED-001',
      itemCode: 'MOA-IT-2024-0001',
      name: 'Dell Latitude 5540 Laptop (Core i7)',
      category: AssetCategory.IT_EQUIPMENT,
      serialNumber: 'SN-DELL-5540-2024001',
      unitCostETB: 85000,
      status: ItemStatus.AVAILABLE,
      storeLocationId: 'LOC-01',
      ifmisSlipNumber: 'IFMIS-GRN-2024-0881',
      ifmisSlipDateGc: '2024-03-15',
      ifmisSlipDateEc: '2016-07-06',
      isHistoricalData: false,
      registeredById: 'EMP-ENC-01',
      approvedById: 'EMP-HEAD-03',
      createdAtGc: today,
      createdAtEc: '2017-01-17',
      notes: 'Procured under World Bank Digital Agriculture Project',
    },
  });

  const item2 = await prisma.item.upsert({
    where: { itemCode: 'MOA-VEH-2024-0001' },
    update: {},
    create: {
      id: 'ITEM-SEED-002',
      itemCode: 'MOA-VEH-2024-0001',
      name: 'Toyota Land Cruiser V8 (GX) 4WD',
      category: AssetCategory.VEHICLE,
      serialNumber: 'SN-TLC-GX-2024002',
      unitCostETB: 2450000,
      status: ItemStatus.ISSUED,
      storeLocationId: 'LOC-01',
      currentCustodianId: 'EMP-STAFF-01',
      assignedDepartmentId: 'DEP-01',
      ifmisSlipNumber: 'IFMIS-GRN-2024-0334',
      ifmisSlipDateGc: '2024-01-20',
      ifmisSlipDateEc: '2016-05-11',
      isHistoricalData: false,
      registeredById: 'EMP-ENC-01',
      approvedById: 'EMP-HEAD-01',
      createdAtGc: today,
      createdAtEc: '2017-01-17',
      notes: 'Field operations vehicle for Agricultural Extension',
    },
  });

  const item3 = await prisma.item.upsert({
    where: { itemCode: 'MOA-AGR-2024-0001' },
    update: {},
    create: {
      id: 'ITEM-SEED-003',
      itemCode: 'MOA-AGR-2024-0001',
      name: 'Massey Ferguson MF-385 4WD Tractor 85HP',
      category: AssetCategory.AGRI_MACHINERY,
      serialNumber: 'SN-MF385-2024003',
      unitCostETB: 1850000,
      status: ItemStatus.PENDING_STOCK_IN,
      storeLocationId: 'LOC-03',
      ifmisSlipNumber: 'IFMIS-GRN-2024-0994',
      ifmisSlipDateGc: '2024-06-10',
      ifmisSlipDateEc: '2016-10-01',
      isHistoricalData: false,
      registeredById: 'EMP-ENC-02',
      createdAtGc: today,
      createdAtEc: '2017-01-17',
      notes: 'Procured under FSRP — awaiting Department Head approval',
    },
  });

  // ── Item History ──────────────────────────────────────────────────────────
  await prisma.itemHistory.createMany({
    skipDuplicates: true,
    data: [
      { id: 'HIST-SEED-001', itemId: 'ITEM-SEED-001', dateGc: today, dateEc: '2017-01-17', action: 'STOCK_IN_APPROVED', fromEntity: 'Pending Approval', toEntity: 'Central Store (AVAILABLE)', performedBy: 'Dawit Tadesse (Property Director)', performedByRole: UserRole.DEPARTMENT_HEAD, ifmisSlipNumber: 'IFMIS-GRN-2024-0881', notes: 'Approved and available in central store' },
      { id: 'HIST-SEED-002', itemId: 'ITEM-SEED-002', dateGc: today, dateEc: '2017-01-17', action: 'STOCK_OUT_APPROVED', fromEntity: 'Central Store', toEntity: 'Kebede Alemu (Field Officer)', performedBy: 'Tigist Haile (Extension Director)', performedByRole: UserRole.DEPARTMENT_HEAD, ifmisSlipNumber: 'IFMIS-SIV-2024-0112', notes: 'Issued for field operations' },
      { id: 'HIST-SEED-003', itemId: 'ITEM-SEED-003', dateGc: today, dateEc: '2017-01-17', action: 'STOCK_IN_REGISTERED', fromEntity: 'IFMIS Slip IFMIS-GRN-2024-0994', toEntity: 'Store (Pending Approval)', performedBy: 'Meron Alemu (Store Officer)', performedByRole: UserRole.DATA_ENCODER, ifmisSlipNumber: 'IFMIS-GRN-2024-0994', notes: 'Awaiting Department Head sign-off' },
    ],
  });

  // ── Sample Approval (pending for item3) ───────────────────────────────────
  await prisma.transactionApproval.upsert({
    where: { id: 'APPR-SEED-001' },
    update: {},
    create: {
      id: 'APPR-SEED-001',
      transactionType: TransactionType.STOCK_IN,
      itemId: 'ITEM-SEED-003',
      itemCode: 'MOA-AGR-2024-0001',
      itemName: 'Massey Ferguson MF-385 4WD Tractor 85HP',
      ifmisSlipNumber: 'IFMIS-GRN-2024-0994',
      ifmisSlipDateGc: '2024-06-10',
      ifmisSlipDateEc: '2016-10-01',
      requestedById: 'EMP-ENC-02',
      purposeOrRemarks: 'New stock inbound registration waiting for sign-off',
      status: ApprovalStatus.PENDING,
      createdAtGc: today,
      createdAtEc: '2017-01-17',
    },
  });

  // ── Audit Logs ────────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    skipDuplicates: true,
    data: [
      { id: 'AUD-SEED-001', timestampGc: `${today} 09:00:00`, timestampEc: '2017-01-17 09:00:00', userId: 'EMP-ENC-01', userName: 'Abebe Kebede (Store Custodian)', userRole: UserRole.DATA_ENCODER, action: 'REGISTER_STOCK_IN', entityType: AuditEntityType.STOCK_IN, entityId: 'ITEM-SEED-001', ifmisSlipNumber: 'IFMIS-GRN-2024-0881', details: 'Item MOA-IT-2024-0001 (Dell Latitude 5540 Laptop) registered via IFMIS slip IFMIS-GRN-2024-0881' },
      { id: 'AUD-SEED-002', timestampGc: `${today} 10:30:00`, timestampEc: '2017-01-17 10:30:00', userId: 'EMP-HEAD-03', userName: 'Dawit Tadesse (Property Director)', userRole: UserRole.DEPARTMENT_HEAD, action: 'APPROVE_STOCK_IN', entityType: AuditEntityType.APPROVAL, entityId: 'ITEM-SEED-001', ifmisSlipNumber: 'IFMIS-GRN-2024-0881', details: 'STOCK_IN APPROVED by Dawit Tadesse for item MOA-IT-2024-0001. Remarks: Approved' },
      { id: 'AUD-SEED-003', timestampGc: `${today} 14:00:00`, timestampEc: '2017-01-17 14:00:00', userId: 'EMP-ENC-02', userName: 'Meron Alemu (Store Officer)', userRole: UserRole.DATA_ENCODER, action: 'REGISTER_STOCK_IN', entityType: AuditEntityType.STOCK_IN, entityId: 'ITEM-SEED-003', ifmisSlipNumber: 'IFMIS-GRN-2024-0994', details: 'Item MOA-AGR-2024-0001 (Massey Ferguson MF-385) registered — awaiting approval' },
    ],
  });

  console.log('  ✅ Sample items, history, approvals & audit logs seeded');
  console.log('\n🎉 Database seeding complete!\n');
  console.log('  Uniform Password for All Accounts: moaams2024');
  console.log('  Minister     → minister@moa.gov.et');
  console.log('  Dept Head    → dawit.t@moa.gov.et');
  console.log('  Store Cust.  → abebe.k@moa.gov.et\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
