import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = 'admin@monorepo.local';
  const userEmail = 'user@monorepo.local';

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Template Admin',
      role: UserRole.ADMIN,
      passwordHash: await hash('admin-password-123', 10),
    },
  });

  await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      email: userEmail,
      name: 'Template User',
      role: UserRole.USER,
      passwordHash: await hash('user-password-123', 10),
    },
  });

  console.info(`Seeded ${adminEmail} (admin-password-123) and ${userEmail} (user-password-123)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
