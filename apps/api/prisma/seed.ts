import { AccountRole, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

/** Same cost as UsersService — seeded passwords must verify through bcryptjs compare. */
const BCRYPT_ROUNDS = 10;

/**
 * CAT-001: initial two-level taxonomy — the task card is authoritative.
 * Children get parent-prefixed kebab-case slugs; `sortOrder` is sequential
 * among siblings (1-based), matching the (parentId, sortOrder) index.
 */
interface SeedCategory {
  nameFa: string;
  slug: string;
  children?: { nameFa: string; slug: string }[];
}

const CATEGORY_TAXONOMY: SeedCategory[] = [
  {
    nameFa: 'پوشاک',
    slug: 'apparel',
    children: [
      { nameFa: 'مردانه', slug: 'apparel-men' },
      { nameFa: 'زنانه', slug: 'apparel-women' },
      { nameFa: 'بچگانه', slug: 'apparel-kids' },
      { nameFa: 'لباس زیر', slug: 'apparel-underwear' },
      { nameFa: 'اسپرت', slug: 'apparel-sports' },
    ],
  },
  {
    nameFa: 'کفش',
    slug: 'shoes',
    children: [
      { nameFa: 'مردانه', slug: 'shoes-men' },
      { nameFa: 'زنانه', slug: 'shoes-women' },
      { nameFa: 'بچگانه', slug: 'shoes-kids' },
      { nameFa: 'ورزشی', slug: 'shoes-sports' },
    ],
  },
  {
    nameFa: 'کیف و اکسسوری',
    slug: 'bags-accessories',
    children: [
      { nameFa: 'کیف', slug: 'bags-accessories-bag' },
      { nameFa: 'کمربند', slug: 'bags-accessories-belt' },
      { nameFa: 'کلاه', slug: 'bags-accessories-hat' },
      { nameFa: 'عینک', slug: 'bags-accessories-glasses' },
      { nameFa: 'اکسسوری', slug: 'bags-accessories-accessory' },
    ],
  },
  {
    nameFa: 'خانه و لوازم خانگی',
    slug: 'home-kitchen',
    children: [
      { nameFa: 'آشپزخانه', slug: 'home-kitchen-kitchenware' },
      { nameFa: 'دکوراتیو', slug: 'home-kitchen-decor' },
      { nameFa: 'اتاق خواب', slug: 'home-kitchen-bedroom' },
      { nameFa: 'ملزومات خانگی', slug: 'home-kitchen-household' },
    ],
  },
  // Deliberately childless (CAT-001 taxonomy).
  { nameFa: 'زیبایی و بهداشتی', slug: 'beauty-health' },
  {
    nameFa: 'کالا مصرفی FMCG',
    slug: 'fmcg',
    children: [
      { nameFa: 'مواد غذایی بسته‌بندی', slug: 'fmcg-packaged-food' },
      { nameFa: 'شوینده', slug: 'fmcg-detergents' },
      { nameFa: 'اقلام مصرفی', slug: 'fmcg-consumables' },
    ],
  },
];

/**
 * Upserts every category by slug — idempotent. The `update` arm re-asserts
 * nameFa/parentId/sortOrder/isActive so a re-run converges drifted dev data
 * back to the canonical taxonomy without touching admin-created rows.
 */
async function seedCategories(): Promise<{ roots: number; children: number }> {
  let children = 0;
  for (const [parentIndex, parent] of CATEGORY_TAXONOMY.entries()) {
    const parentRow = await prisma.category.upsert({
      where: { slug: parent.slug },
      update: {
        nameFa: parent.nameFa,
        nameEn: null,
        parentId: null,
        sortOrder: parentIndex + 1,
        isActive: true,
      },
      create: { nameFa: parent.nameFa, slug: parent.slug, sortOrder: parentIndex + 1 },
    });
    for (const [childIndex, child] of (parent.children ?? []).entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: {
          nameFa: child.nameFa,
          nameEn: null,
          parentId: parentRow.id,
          sortOrder: childIndex + 1,
          isActive: true,
        },
        create: {
          nameFa: child.nameFa,
          slug: child.slug,
          parentId: parentRow.id,
          sortOrder: childIndex + 1,
        },
      });
      children += 1;
    }
  }
  return { roots: CATEGORY_TAXONOMY.length, children };
}

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

  const taxonomy = await seedCategories();

  console.info(`Seeded (upsert by phone/slug — safe to re-run):
- ${admin.phone} — ADMIN, password login ${admin.email} / ${admin.password}
- ${buyerPhone} — BUYER, phone OTP login
- ${sellerPhone} — SELLER, phone OTP login
- ${taxonomy.roots} root + ${taxonomy.children} child categories (CAT-001)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
