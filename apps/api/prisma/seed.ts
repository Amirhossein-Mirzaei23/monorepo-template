import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Phone-keyed since AUTH-001; the migration backfills the same numbers for
  // databases seeded before the switch, so the upserts stay idempotent.
  // (Full Rakdsho seed — sample buyer/seller — arrives with AUTH-005.)
  const adminPhone = '09120000000';
  const adminEmail = 'admin@monorepo.local';
  const userPhone = '09120000001';
  const userEmail = 'user@monorepo.local';

  await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      phone: adminPhone,
      email: adminEmail,
      name: 'Template Admin',
      role: UserRole.ADMIN,
      passwordHash: await hash('admin-password-123', 10),
    },
  });

  await prisma.user.upsert({
    where: { phone: userPhone },
    update: {},
    create: {
      phone: userPhone,
      email: userEmail,
      name: 'Template User',
      role: UserRole.USER,
      passwordHash: await hash('user-password-123', 10),
    },
  });

  console.info(
    `Seeded ${adminPhone} (${adminEmail}, admin-password-123) and ${userPhone} (${userEmail}, user-password-123)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
