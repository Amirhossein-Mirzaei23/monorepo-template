import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { CategoriesRepository } from '../../categories/categories.repository';
import { UsersRepository } from '../../users/users.repository';
import type { SaveOnboardingDto } from '../dto/save-onboarding.dto';
import type { UpdateProfileDto } from '../dto/update-profile.dto';
import { ProfilesRepository } from '../profiles.repository';
import { ProfilesService } from '../profiles.service';

/** Minimal valid buyer payload — tests override what they need. */
function buyerDto(overrides: Partial<SaveOnboardingDto> = {}): SaveOnboardingDto {
  return {
    isBuyer: true,
    isSeller: false,
    displayName: 'آرمان تهرانی',
    ...overrides,
  };
}

/** Minimal valid seller payload (businessName is seller-required). */
function sellerDto(overrides: Partial<SaveOnboardingDto> = {}): SaveOnboardingDto {
  return {
    isBuyer: false,
    isSeller: true,
    displayName: 'مینا رضایی',
    businessName: 'تولیدی پوشاک مینا',
    ...overrides,
  };
}

describe('ProfilesService', () => {
  let service: ProfilesService;
  let fake: FakePrisma;
  let userId: string;
  let apparel: { id: string };
  let shoes: { id: string };
  let fmcg: { id: string };

  beforeEach(async () => {
    fake = new FakePrisma();
    const users = new UsersRepository(fake as unknown as PrismaService);
    const profiles = new ProfilesRepository(fake as unknown as PrismaService);
    const categories = new CategoriesRepository(fake as unknown as PrismaService);
    service = new ProfilesService(profiles, users, categories, fake as unknown as PrismaService);

    userId = fake.seedUser({ phone: '09123334444', name: 'Ali' }).id;
    apparel = fake.seedCategory({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
    shoes = fake.seedCategory({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });
    fmcg = fake.seedCategory({ nameFa: 'کالا مصرفی', slug: 'fmcg', sortOrder: 3 });
  });

  const storedUser = () => fake.user.findUnique({ where: { id: userId } });

  describe('submitOnboarding (transaction semantics)', () => {
    it('creates the profile, stamps onboardingCompletedAt and syncs accountRoles', async () => {
      const result = await service.submitOnboarding(
        userId,
        buyerDto({ province: 'tehran', city: 'tehran', interests: [apparel.id, fmcg.id] }),
      );

      expect(result.displayName).toBe('آرمان تهرانی');
      expect(result.isBuyer).toBe(true);
      expect(result.isSeller).toBe(false);
      expect(result.province).toBe('tehran');
      expect(result.city).toBe('tehran');
      expect(result.interests.map((interest) => interest.slug)).toEqual(['apparel', 'fmcg']);
      expect(result.onboardingCompleted).toBe(true);
      expect(result.verificationBadges).toEqual([]);

      const user = await storedUser();
      expect(user?.accountRoles).toEqual([AccountRole.BUYER]);
      expect(user?.onboardingCompletedAt).not.toBeNull();
    });

    it('supports both hats on one account (BUYER + SELLER)', async () => {
      await service.submitOnboarding(userId, sellerDto({ isBuyer: true }));

      expect((await storedUser())?.accountRoles).toEqual([AccountRole.BUYER, AccountRole.SELLER]);
    });

    it('re-onboarding updates the same row (no duplicate profile, never 409)', async () => {
      const first = await service.submitOnboarding(userId, buyerDto());
      const updated = await service.submitOnboarding(
        userId,
        buyerDto({ displayName: 'آرمان دوم' }),
      );

      expect(updated.displayName).toBe('آرمان دوم');
      // Same physical row — the upsert keyed on unique userId, not a second profile.
      expect(updated.id).toBe(first.id);
      const profile = await fake.profile.findUnique({ where: { userId } });
      expect(profile?.displayName).toBe('آرمان دوم');
    });

    it('keeps the ORIGINAL onboardingCompletedAt on re-submit (first completion wins)', async () => {
      await service.submitOnboarding(userId, buyerDto());
      const original = new Date('2026-01-01T00:00:00.000Z');
      await fake.user.update({ where: { id: userId }, data: { onboardingCompletedAt: original } });

      const result = await service.submitOnboarding(userId, buyerDto({ displayName: 'بعدی' }));

      const user = await storedUser();
      expect(user?.onboardingCompletedAt?.getTime()).toBe(original.getTime());
      expect(result.onboardingCompleted).toBe(true);
    });

    it('syncs accountRoles in both directions across re-submits', async () => {
      await service.submitOnboarding(userId, buyerDto());
      expect((await storedUser())?.accountRoles).toEqual([AccountRole.BUYER]);

      await service.submitOnboarding(userId, sellerDto({ isBuyer: true }));
      expect((await storedUser())?.accountRoles).toEqual([AccountRole.BUYER, AccountRole.SELLER]);

      await service.submitOnboarding(userId, sellerDto());
      expect((await storedUser())?.accountRoles).toEqual([AccountRole.SELLER]);
    });

    it('replaces the interest set wholesale (PUT semantics)', async () => {
      await service.submitOnboarding(userId, buyerDto({ interests: [apparel.id, shoes.id] }));
      await service.submitOnboarding(userId, buyerDto({ interests: [shoes.id, fmcg.id] }));

      const profile = await fake.profile.findUnique({ where: { userId } });
      expect(profile?.interests.map((interest) => interest.category.slug)).toEqual([
        'shoes',
        'fmcg',
      ]);
    });

    it('clears optional fields and interests that are omitted on re-submit', async () => {
      await service.submitOnboarding(
        userId,
        buyerDto({ bio: 'میان‌متنی', instagram: 'arman.tehrani', interests: [apparel.id] }),
      );
      const result = await service.submitOnboarding(userId, buyerDto());

      expect(result.bio).toBeNull();
      expect(result.instagram).toBeNull();
      expect(result.interests).toEqual([]);
    });

    it('persists seller extras', async () => {
      const result = await service.submitOnboarding(
        userId,
        sellerDto({
          sellerYearsActive: 6,
          sellerBusinessType: 'MANUFACTURER',
          sellerDescription: 'تولیدکننده پوشاک',
          instagram: 'mina.apparel',
          website: 'https://mina-apparel.ir',
        }),
      );

      expect(result.sellerYearsActive).toBe(6);
      expect(result.sellerBusinessType).toBe('MANUFACTURER');
      expect(result.sellerDescription).toBe('تولیدکننده پوشاک');
      expect(result.instagram).toBe('mina.apparel');
      expect(result.website).toBe('https://mina-apparel.ir');
    });

    it('throws Unauthorized for a user that no longer exists', async () => {
      await expect(service.submitOnboarding('missing-id', buyerDto())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('validation rules (service-level, cross-field)', () => {
    it('rejects selecting no role at all', async () => {
      await expect(
        service.submitOnboarding(userId, buyerDto({ isBuyer: false })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires businessName for sellers', async () => {
      await expect(
        service.submitOnboarding(userId, sellerDto({ businessName: undefined })),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.submitOnboarding(userId, sellerDto({ businessName: '   ' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts buyers without a businessName', async () => {
      const result = await service.submitOnboarding(userId, buyerDto());
      expect(result.businessName).toBeNull();
    });

    it('requires province and city to be sent together', async () => {
      await expect(
        service.submitOnboarding(userId, buyerDto({ province: 'tehran' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.submitOnboarding(userId, buyerDto({ city: 'tehran' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('validates the (province, city) pair against the static geo list', async () => {
      await expect(
        service.submitOnboarding(userId, buyerDto({ province: 'tehran', city: 'kashan' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.submitOnboarding(userId, buyerDto({ province: 'atlantis', city: 'tehran' })),
      ).rejects.toBeInstanceOf(BadRequestException);

      const ok = await service.submitOnboarding(
        userId,
        buyerDto({ province: 'isfahan', city: 'kashan' }),
      );
      expect(ok.province).toBe('isfahan');
      expect(ok.city).toBe('kashan');
    });

    it('accepts omitting location entirely', async () => {
      const result = await service.submitOnboarding(userId, buyerDto());
      expect(result.province).toBeNull();
      expect(result.city).toBeNull();
    });

    it('rejects interests referencing unknown categories', async () => {
      await expect(
        service.submitOnboarding(userId, buyerDto({ interests: ['missing-id'] })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects interests referencing inactive categories', async () => {
      const hidden = fake.seedCategory({
        nameFa: 'مخفی',
        slug: 'hidden',
        sortOrder: 4,
        isActive: false,
      });
      await expect(
        service.submitOnboarding(userId, buyerDto({ interests: [hidden.id] })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getMyProfile', () => {
    it('returns the full own-profile shape with placeholders', async () => {
      await service.submitOnboarding(userId, buyerDto({ interests: [apparel.id] }));

      const result = await service.getMyProfile(userId);

      expect(Object.keys(result).sort()).toEqual([
        'bio',
        'businessName',
        'city',
        'createdAt',
        'displayName',
        'id',
        'instagram',
        'interests',
        'isBuyer',
        'isSeller',
        'metrics',
        'onboardingCompleted',
        'province',
        'sellerBusinessType',
        'sellerDescription',
        'sellerYearsActive',
        'updatedAt',
        'userId',
        'verificationBadges',
        'website',
      ]);
      expect(result.verificationBadges).toEqual([]);
      expect(result.onboardingCompleted).toBe(true);
      expect(result.interests).toEqual([{ id: apparel.id, nameFa: 'پوشاک', slug: 'apparel' }]);
    });

    it('exposes placeholder trust metrics (zeros and nulls until the P1 jobs)', async () => {
      await service.submitOnboarding(userId, buyerDto());

      const result = await service.getMyProfile(userId);

      expect(result.metrics).toEqual({
        successfulTransactions: 0,
        averageRating: null,
        ratingCount: 0,
        responseRateMinutes: null,
        cancellationRate: null,
        activeListings: 0,
      });
    });

    it('throws NotFound for a user that has not onboarded yet', async () => {
      await expect(service.getMyProfile(userId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Unauthorized for a user that no longer exists', async () => {
      await expect(service.getMyProfile('missing-id')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('updateMyProfile (PATCH semantics)', () => {
    it('updates only the provided fields and leaves everything else untouched', async () => {
      await service.submitOnboarding(
        userId,
        buyerDto({
          bio: 'بیوی اول',
          province: 'tehran',
          city: 'tehran',
          interests: [apparel.id],
        }),
      );

      const result = await service.updateMyProfile(userId, { displayName: 'آرمان ویرایش' });

      expect(result.displayName).toBe('آرمان ویرایش');
      expect(result.bio).toBe('بیوی اول');
      expect(result.province).toBe('tehran');
      expect(result.city).toBe('tehran');
      expect(result.interests.map((interest) => interest.slug)).toEqual(['apparel']);
    });

    it('clears optional fields on explicit null and replaces interests when provided', async () => {
      await service.submitOnboarding(
        userId,
        buyerDto({ bio: 'بیوی اول', instagram: 'arman.tehrani', interests: [apparel.id] }),
      );

      const result = await service.updateMyProfile(userId, {
        bio: null,
        instagram: null,
        interests: [shoes.id],
      });

      expect(result.bio).toBeNull();
      expect(result.instagram).toBeNull();
      expect(result.interests.map((interest) => interest.slug)).toEqual(['shoes']);
    });

    it('keeps the existing interests when the interests key is absent', async () => {
      await service.submitOnboarding(userId, buyerDto({ interests: [apparel.id] }));

      const result = await service.updateMyProfile(userId, { displayName: 'آرمان دوم' });

      expect(result.interests.map((interest) => interest.slug)).toEqual(['apparel']);
    });

    it('accepts an empty PATCH body as a no-op round-trip', async () => {
      const created = await service.submitOnboarding(userId, buyerDto({ bio: 'بیو' }));

      const result = await service.updateMyProfile(userId, {});

      expect(result.bio).toBe('بیو');
      expect(result.id).toBe(created.id);
    });

    it('adds the seller hat in one call and syncs User.accountRoles', async () => {
      await service.submitOnboarding(userId, buyerDto());

      const result = await service.updateMyProfile(userId, {
        isSeller: true,
        businessName: 'تولیدی آرمان',
        sellerBusinessType: 'WORKSHOP',
      });

      expect(result.isSeller).toBe(true);
      expect(result.businessName).toBe('تولیدی آرمان');
      expect((await storedUser())?.accountRoles).toEqual([AccountRole.BUYER, AccountRole.SELLER]);
    });

    it('adds the buyer hat to a seller and syncs User.accountRoles', async () => {
      await service.submitOnboarding(userId, sellerDto());

      const result = await service.updateMyProfile(userId, { isBuyer: true });

      expect(result.isBuyer).toBe(true);
      expect((await storedUser())?.accountRoles).toEqual([AccountRole.BUYER, AccountRole.SELLER]);
    });

    it('rejects removing a held role — "never removes history" (also protects the last role)', async () => {
      await service.submitOnboarding(userId, buyerDto());

      // Last-role removal:
      await expect(service.updateMyProfile(userId, { isBuyer: false })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // Removal while the other hat is kept is equally refused:
      await service.submitOnboarding(userId, sellerDto({ isBuyer: true }));
      await expect(service.updateMyProfile(userId, { isBuyer: false })).rejects.toThrow(
        'Account roles are never removed',
      );

      // Nothing was written by the rejected PATCHes.
      const profile = await fake.profile.findUnique({ where: { userId } });
      expect(profile?.isBuyer).toBe(true);
      expect(profile?.isSeller).toBe(true);
      expect((await storedUser())?.accountRoles).toEqual([AccountRole.BUYER, AccountRole.SELLER]);
    });

    it('rejects adding the seller hat without a businessName', async () => {
      await service.submitOnboarding(userId, buyerDto());

      await expect(service.updateMyProfile(userId, { isSeller: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('keeps businessName required for sellers when clearing it via PATCH', async () => {
      await service.submitOnboarding(userId, sellerDto());

      await expect(service.updateMyProfile(userId, { businessName: '   ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('validates the resulting province/city pair (both-or-neither + geo check)', async () => {
      // Clearing only one half of a stored pair leaves an invalid result.
      await service.submitOnboarding(userId, buyerDto({ province: 'tehran', city: 'tehran' }));
      await expect(service.updateMyProfile(userId, { city: null })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // A lone incoming province against an empty stored location.
      const bare = fake.seedUser({ phone: '09123335555', name: 'Bare' });
      await service.submitOnboarding(bare.id, {
        isBuyer: true,
        isSeller: false,
        displayName: 'بدون شهر',
      });
      await expect(service.updateMyProfile(bare.id, { province: 'tehran' })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // A well-formed new pair passes.
      const result = await service.updateMyProfile(userId, {
        province: 'isfahan',
        city: 'kashan',
      });
      expect(result.province).toBe('isfahan');
      expect(result.city).toBe('kashan');
    });

    it('allows clearing the whole location in one PATCH', async () => {
      await service.submitOnboarding(userId, buyerDto({ province: 'tehran', city: 'tehran' }));

      const result = await service.updateMyProfile(userId, { province: null, city: null });

      expect(result.province).toBeNull();
      expect(result.city).toBeNull();
    });

    it('rejects interests referencing unknown categories', async () => {
      await service.submitOnboarding(userId, buyerDto());

      await expect(
        service.updateMyProfile(userId, { interests: ['missing-id'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns placeholder metrics like GET does', async () => {
      await service.submitOnboarding(userId, buyerDto());

      const result = await service.updateMyProfile(userId, { displayName: 'آرمان دوم' });

      expect(result.metrics.successfulTransactions).toBe(0);
      expect(result.metrics.averageRating).toBeNull();
    });

    it('throws NotFound when the user has not onboarded yet', async () => {
      await expect(service.updateMyProfile(userId, { bio: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws Unauthorized for a user that no longer exists', async () => {
      await expect(
        service.updateMyProfile('missing-id', { bio: 'x' } as UpdateProfileDto),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
