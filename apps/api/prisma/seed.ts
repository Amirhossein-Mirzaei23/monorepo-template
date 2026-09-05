import { AccountRole, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

/** Same cost as UsersService — seeded passwords must verify through bcryptjs compare. */
const BCRYPT_ROUNDS = 10;

async function main(): Promise<void> {
  // AUTH-005: identity is phone-keyed. Every account upserts by phone, so the
  // seed is idempotent — re-running never duplicates rows and never touches
  // data outside these fixture accounts. Sample users carry the User row only;
  // profile fields land with ONB-001 (extend here then).
  const admin = {
    phone: '09120000000',
    email: 'admin@monorepo.local',
    name: 'Template Admin',
    password: 'admin-password-123',
  };
  const buyerPhone = '09120000001';
  const sellerPhone = '09120000002';

  // Admin keeps the (only) password path — email + password login is ADMIN-only.
  await prisma.user.upsert({
    where: { phone: admin.phone },
    update: {},
    create: {
      phone: admin.phone,
      email: admin.email,
      name: admin.name,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: await hash(admin.password, BCRYPT_ROUNDS),
    },
  });

  // Sample buyer — logs in by phone OTP like every non-admin user.
  await prisma.user.upsert({
    where: { phone: buyerPhone },
    // Normalizes databases seeded before AUTH-005, where this row carried the
    // password/email of the old email/password seed — phone users have neither.
    update: { email: null, passwordHash: null },
    create: {
      phone: buyerPhone,
      name: 'Sample Buyer',
      accountRoles: [AccountRole.BUYER],
    },
  });

  // Sample seller.
  await prisma.user.upsert({
    where: { phone: sellerPhone },
    update: {},
    create: {
      phone: sellerPhone,
      name: 'Sample Seller',
      accountRoles: [AccountRole.SELLER],
    },
  });

  console.info(`Seeded (upsert by phone — safe to re-run):
- ${admin.phone} — ADMIN, password login ${admin.email} / ${admin.password}
- ${buyerPhone} — BUYER, phone OTP login
- ${sellerPhone} — SELLER, phone OTP login`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
