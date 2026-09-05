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
  // data outside these fixture accounts. Categories land first so ONB-001
  // profiles can reference their ids for interests.
  const taxonomy = await seedCategories();

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
  const buyer = await prisma.user.upsert({
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
  const seller = await prisma.user.upsert({
    where: { phone: sellerPhone },
    update: {},
    create: {
      phone: sellerPhone,
      name: 'Sample Seller',
      accountRoles: [AccountRole.SELLER],
    },
  });

  const buyerProfile = await seedProfile(buyer.id, {
    displayName: 'آرمان تهرانی',
    province: 'tehran',
    city: 'tehran',
    bio: 'خریدار عمده پوشاک و کالای مصرفی',
    instagram: 'arman.tehrani',
    isBuyer: true,
    interestSlugs: ['apparel', 'apparel-men', 'fmcg'],
  });
  const sellerProfile = await seedProfile(seller.id, {
    displayName: 'مینا رضایی',
    businessName: 'تولیدی پوشاک مینا',
    province: 'isfahan',
    city: 'isfahan',
    bio: 'تولید و عرضه عمده پوشاک زنانه',
    instagram: 'mina.apparel',
    website: 'https://mina-apparel.ir',
    isSeller: true,
    sellerYearsActive: 6,
    sellerBusinessType: 'MANUFACTURER',
    sellerDescription: 'تولیدکننده پوشاک زنانه با ۶ سال سابقه صادرات به منطقه',
    interestSlugs: ['apparel', 'apparel-women', 'bags-accessories'],
  });

  console.info(`Seeded (upsert by phone/slug — safe to re-run):
- ${admin.phone} — ADMIN, password login ${admin.email} / ${admin.password}
- ${buyerPhone} — BUYER, onboarded: ${buyerProfile.displayName}
- ${sellerPhone} — SELLER, onboarded: ${sellerProfile.businessName}
- ${taxonomy.roots} root + ${taxonomy.children} child categories (CAT-001)`);
}

/**
 * ONB-001: completed fixture profiles + interests for the sample users.
 * Idempotent — the profile upserts by unique userId, the interest set is
 * replaced wholesale, and onboardingCompletedAt is stamped only while null
 * (the first-completion date survives re-runs, mirroring the API rule).
 */
async function seedProfile(
  userId: string,
  profile: {
    displayName: string;
    businessName?: string;
    province?: string;
    city?: string;
    bio?: string;
    instagram?: string;
    website?: string;
    isBuyer?: boolean;
    isSeller?: boolean;
    sellerYearsActive?: number;
    sellerBusinessType?: string;
    sellerDescription?: string;
    interestSlugs: string[];
  },
): Promise<{ displayName: string; businessName: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error(`Seed: user ${userId} missing — seed users before profiles`);
  }

  const roles: AccountRole[] = [
    ...(profile.isBuyer ? [AccountRole.BUYER] : []),
    ...(profile.isSeller ? [AccountRole.SELLER] : []),
  ];
  if (user.onboardingCompletedAt == null) {
    await prisma.user.update({
      where: { id: userId },
      data: { accountRoles: roles, onboardingCompletedAt: new Date() },
    });
  } else {
    await prisma.user.update({ where: { id: userId }, data: { accountRoles: roles } });
  }

  const row = await prisma.profile.upsert({
    where: { userId },
    update: {
      displayName: profile.displayName,
      businessName: profile.businessName ?? null,
      province: profile.province ?? null,
      city: profile.city ?? null,
      bio: profile.bio ?? null,
      instagram: profile.instagram ?? null,
      website: profile.website ?? null,
      isBuyer: profile.isBuyer ?? false,
      isSeller: profile.isSeller ?? false,
      sellerYearsActive: profile.sellerYearsActive ?? null,
      sellerBusinessType: profile.sellerBusinessType ?? null,
      sellerDescription: profile.sellerDescription ?? null,
    },
    create: {
      userId,
      displayName: profile.displayName,
      businessName: profile.businessName,
      province: profile.province,
      city: profile.city,
      bio: profile.bio,
      instagram: profile.instagram,
      website: profile.website,
      isBuyer: profile.isBuyer ?? false,
      isSeller: profile.isSeller ?? false,
      sellerYearsActive: profile.sellerYearsActive,
      sellerBusinessType: profile.sellerBusinessType,
      sellerDescription: profile.sellerDescription,
    },
  });

  const categoryIds = (
    await Promise.all(
      profile.interestSlugs.map((slug) => prisma.category.findUnique({ where: { slug } })),
    )
  )
    .filter((category): category is NonNullable<typeof category> => category !== null)
    .map((category) => category.id);
  if (categoryIds.length !== profile.interestSlugs.length) {
    throw new Error('Seed: unknown interest slug — run seedCategories first');
  }

  await prisma.profileInterest.deleteMany({ where: { profileId: row.id } });
  await prisma.profileInterest.createMany({
    data: categoryIds.map((categoryId) => ({ profileId: row.id, categoryId })),
  });

  return { displayName: row.displayName, businessName: row.businessName };
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
