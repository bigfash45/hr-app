/**
 * Seeds a working NowNow Digital Systems tenant.
 *
 *   npm run db:seed
 *
 * Idempotent — safe to re-run. Everything upserts on a natural key.
 *
 * Passwords come from SEED_PASSWORD, and the script refuses to run against
 * NODE_ENV=production. Seeded accounts with a known password are exactly the
 * kind of thing that quietly survives into a live system.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const COMPANY_CODE = '001122';

/**
 * Nigerian public holidays for 2026.
 *
 * Eid al-Fitr, Eid al-Kabir and Eid al-Mawlid follow the lunar calendar and are
 * confirmed by government proclamation, so the dates below are estimates and
 * must be reviewed each year (PRD §17 Q9 — annual HR confirmation each December).
 */
const HOLIDAYS_2026: { name: string; date: string; isRecurring: boolean }[] = [
  { name: "New Year's Day", date: '2026-01-01', isRecurring: true },
  { name: 'Good Friday', date: '2026-04-03', isRecurring: false },
  { name: 'Easter Monday', date: '2026-04-06', isRecurring: false },
  { name: 'Workers’ Day', date: '2026-05-01', isRecurring: true },
  { name: 'Children’s Day', date: '2026-05-27', isRecurring: true },
  { name: 'Democracy Day', date: '2026-06-12', isRecurring: true },
  { name: 'Eid al-Fitr (estimated)', date: '2026-03-20', isRecurring: false },
  { name: 'Eid al-Fitr holiday (estimated)', date: '2026-03-21', isRecurring: false },
  { name: 'Eid al-Kabir (estimated)', date: '2026-05-27', isRecurring: false },
  { name: 'Eid al-Mawlid (estimated)', date: '2026-08-26', isRecurring: false },
  { name: 'Independence Day', date: '2026-10-01', isRecurring: true },
  { name: 'Christmas Day', date: '2026-12-25', isRecurring: true },
  { name: 'Boxing Day', date: '2026-12-26', isRecurring: true },
];

/**
 * Leave types with the PRD §6.5 defaults.
 *
 * Weeks are expressed in working days so one unit governs every calculation:
 * maternity 12 weeks = 60 working days, paternity 2 weeks = 10.
 * All sit above the Nigerian Labour Act minimums (PRD §12).
 */
const LEAVE_TYPES = [
  { code: 'ANNUAL', name: 'Annual Leave', defaultDays: 21, isPaid: true, allowCarryOver: true, maxCarryOverDays: 5, groupHrThresholdDays: null },
  { code: 'SICK', name: 'Sick Leave', defaultDays: 10, isPaid: true, allowCarryOver: false, maxCarryOverDays: 0, groupHrThresholdDays: null, requiresDocument: true },
  { code: 'CASUAL', name: 'Casual Leave', defaultDays: 5, isPaid: true, allowCarryOver: false, maxCarryOverDays: 0, groupHrThresholdDays: null },
  { code: 'MATERNITY', name: 'Maternity Leave', defaultDays: 60, isPaid: true, allowCarryOver: false, maxCarryOverDays: 0, groupHrThresholdDays: null },
  { code: 'PATERNITY', name: 'Paternity Leave', defaultDays: 10, isPaid: true, allowCarryOver: false, maxCarryOverDays: 0, groupHrThresholdDays: null },
  // Over 5 days requires Group HR approval (PRD §6.5).
  { code: 'UNPAID', name: 'Unpaid Leave', defaultDays: 0, isPaid: false, allowCarryOver: false, maxCarryOverDays: 0, groupHrThresholdDays: 5 },
];

const DEPARTMENTS = ['Engineering', 'People & Culture', 'Finance', 'Operations', 'Product & Design'];

interface SeedPerson {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  role: Role;
  managerNumber?: string;
}

const PEOPLE: SeedPerson[] = [
  { employeeNumber: 'D0001', firstName: 'Judith', lastName: 'Okafor', email: 'judith.okafor@nownow.digital', jobTitle: 'Head of People', department: 'People & Culture', role: 'GROUP_HR_MANAGER' },
  { employeeNumber: 'D0002', firstName: 'Emmanuel', lastName: 'Aforinwo', email: 'emmanuel.aforinwo@nownow.digital', jobTitle: 'HR Manager', department: 'People & Culture', role: 'LOCAL_HR_MANAGER', managerNumber: 'D0001' },
  { employeeNumber: 'D0003', firstName: 'Adedamola', lastName: 'Ademeso', email: 'adedamola.ademeso@nownow.digital', jobTitle: 'Engineering Lead', department: 'Engineering', role: 'LINE_MANAGER', managerNumber: 'D0001' },
  { employeeNumber: 'D0004', firstName: 'Ayodimeji', lastName: 'Fasina', email: 'ayodimeji.fasina@nownow.digital', jobTitle: 'Frontend Engineer', department: 'Engineering', role: 'EMPLOYEE', managerNumber: 'D0003' },
  { employeeNumber: 'D0005', firstName: 'Elvis', lastName: 'Osuji', email: 'elvis.osuji@nownow.digital', jobTitle: 'Backend Engineer', department: 'Engineering', role: 'EMPLOYEE', managerNumber: 'D0003' },
  { employeeNumber: 'D0006', firstName: 'Taiwo', lastName: 'Adefie', email: 'taiwo.adefie@nownow.digital', jobTitle: 'Frontend Engineer', department: 'Engineering', role: 'EMPLOYEE', managerNumber: 'D0003' },
  { employeeNumber: 'D0007', firstName: 'Joan', lastName: 'Onyimadu', email: 'joan.onyimadu@nownow.digital', jobTitle: 'Product Designer', department: 'Product & Design', role: 'EMPLOYEE', managerNumber: 'D0003' },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      'Set SEED_PASSWORD to at least 12 characters before seeding, e.g.\n' +
        '  SEED_PASSWORD="$(openssl rand -base64 18)" npm run db:seed'
    );
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const company = await prisma.company.upsert({
    where: { code: COMPANY_CODE },
    update: {},
    create: {
      code: COMPANY_CODE,
      name: 'NowNow Digital Systems',
      legalName: 'NowNow Digital Systems Limited',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      timezone: 'Africa/Lagos',
      currency: 'NGN',
      workingDays: [1, 2, 3, 4, 5],
      workdayStart: '08:00',
      workdayEnd: '17:00',
      graceMinutes: 15,
    },
  });
  console.log(`✔ Company ${company.name} (${company.code})`);

  for (const name of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: {},
      create: { companyId: company.id, name },
    });
  }
  console.log(`✔ ${DEPARTMENTS.length} departments`);

  for (const type of LEAVE_TYPES) {
    await prisma.leaveType.upsert({
      where: { companyId_code: { companyId: company.id, code: type.code } },
      update: {},
      create: { companyId: company.id, ...type },
    });
  }
  console.log(`✔ ${LEAVE_TYPES.length} leave types`);

  for (const holiday of HOLIDAYS_2026) {
    const date = new Date(`${holiday.date}T00:00:00`);
    await prisma.publicHoliday.upsert({
      where: { companyId_date: { companyId: company.id, date } },
      update: {},
      create: {
        companyId: company.id,
        name: holiday.name,
        date,
        year: date.getFullYear(),
        isRecurring: holiday.isRecurring,
      },
    });
  }
  console.log(`✔ ${HOLIDAYS_2026.length} public holidays for 2026`);

  const departments = await prisma.department.findMany({ where: { companyId: company.id } });
  const departmentByName = new Map(departments.map(d => [d.name, d.id]));

  // Two passes: create everyone first, then link managers — a manager must exist
  // before anyone can point at them.
  for (const person of PEOPLE) {
    const user = await prisma.user.upsert({
      where: { companyId_email: { companyId: company.id, email: person.email } },
      update: { role: person.role },
      create: {
        companyId: company.id,
        email: person.email,
        passwordHash,
        role: person.role,
        mustSetPassword: false,
      },
    });

    await prisma.employee.upsert({
      where: { companyId_employeeNumber: { companyId: company.id, employeeNumber: person.employeeNumber } },
      update: { jobTitle: person.jobTitle, userId: user.id },
      create: {
        companyId: company.id,
        employeeNumber: person.employeeNumber,
        userId: user.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        jobTitle: person.jobTitle,
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
        startDate: new Date('2025-01-06'),
        departmentId: departmentByName.get(person.department) ?? null,
        nationality: 'Nigerian',
      },
    });
  }

  for (const person of PEOPLE.filter(p => p.managerNumber)) {
    const manager = await prisma.employee.findUnique({
      where: { companyId_employeeNumber: { companyId: company.id, employeeNumber: person.managerNumber! } },
      select: { id: true },
    });
    if (!manager) continue;

    await prisma.employee.update({
      where: { companyId_employeeNumber: { companyId: company.id, employeeNumber: person.employeeNumber } },
      data: { managerId: manager.id },
    });
  }
  console.log(`✔ ${PEOPLE.length} employees with reporting lines`);

  // Department heads.
  const lead = await prisma.employee.findUnique({
    where: { companyId_employeeNumber: { companyId: company.id, employeeNumber: 'D0003' } },
    select: { id: true },
  });
  if (lead && departmentByName.has('Engineering')) {
    await prisma.department.update({
      where: { id: departmentByName.get('Engineering')! },
      data: { headId: lead.id },
    });
  }

  // Leave balances for the current year.
  const year = new Date().getFullYear();
  const [employees, leaveTypes] = await Promise.all([
    prisma.employee.findMany({ where: { companyId: company.id }, select: { id: true } }),
    prisma.leaveType.findMany({ where: { companyId: company.id } }),
  ]);

  await prisma.leaveBalance.createMany({
    data: employees.flatMap(employee =>
      leaveTypes.map(type => ({
        companyId: company.id,
        employeeId: employee.id,
        leaveTypeId: type.id,
        year,
        entitledDays: type.defaultDays,
      }))
    ),
    skipDuplicates: true,
  });
  console.log(`✔ Leave balances for ${year}`);

  console.log('\nSeed complete.');
  console.log(`  Company code : ${COMPANY_CODE}`);
  console.log('  Sign in as   : judith.okafor@nownow.digital (Group HR)');
  console.log('                 emmanuel.aforinwo@nownow.digital (HR Manager)');
  console.log('                 adedamola.ademeso@nownow.digital (Line Manager)');
  console.log('                 ayodimeji.fasina@nownow.digital (Employee)');
  console.log('  Password     : the SEED_PASSWORD you supplied');
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
