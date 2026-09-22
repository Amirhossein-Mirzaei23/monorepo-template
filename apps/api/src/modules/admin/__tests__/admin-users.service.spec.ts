import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AccountRole, UserRole, UserStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { AuditRepository } from '../../audit/audit.repository';
import { AuditService, type AuditWriteContext } from '../../audit/audit.service';
import { UserStatusAction } from '../dto/admin-user-action.dto';
import { AdminUsersRepository } from '../admin-users.repository';
import { AdminUsersService } from '../admin-users.service';

const CONTEXT: AuditWriteContext = {
  actorId: 'acting-admin',
  requestId: 'request-1',
  ip: '127.0.0.1',
};

const TOKEN_TTL = new Date(Date.now() + 24 * 60 * 60 * 1000);

/** The acting actor differs from the target — the self-guard must not fire. */
const OTHER_ACTOR: AuditWriteContext = { ...CONTEXT, actorId: 'another-admin' };

/**
 * Admin panel Task 05 — safe user management service rules: deterministic
 * search, allowlisted detail, the status transition table, the self-action and
 * last-active-admin guards, same-transaction session revocation and audit.
 */
describe('AdminUsersService', () => {
  let fake: FakePrisma;
  let service: AdminUsersService;

  beforeEach(() => {
    fake = new FakePrisma();
    const prisma = fake as unknown as PrismaService;
    service = new AdminUsersService(
      new AdminUsersRepository(prisma),
      prisma,
      new AuditService(new AuditRepository(prisma)),
    );
  });

  /** Asserts the action fails with the given Nest exception AND machine code. */
  async function expectGuard(
    action: Promise<unknown>,
    exception: new (body: unknown) => object,
    code: string,
  ): Promise<void> {
    const error = await action.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(exception);
    expect((error as ConflictException).getResponse()).toMatchObject({ code });
  }

  function seedActiveTokens(userId: string, count: number): Promise<unknown> {
    return Promise.all(
      Array.from({ length: count }, (_, index) =>
        fake.refreshToken.create({
          data: { tokenHash: `hash-${userId}-${index}`, userId, expiresAt: TOKEN_TTL },
        }),
      ),
    );
  }

  /** Count currently-active refresh tokens for the user. */
  function activeTokens(userId: string): Promise<number> {
    return fake.refreshToken
      .updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
      .then((result) => result.count);
  }

  describe('list — deterministic search', () => {
    it('finds users by a phone, name or email substring (case-insensitive)', async () => {
      const target = fake.seedUser({
        phone: '09121234567',
        name: 'سارا',
        email: 'Sara@Example.com',
      });
      fake.seedUser({ phone: '09120000001', name: 'علی' });

      const byPhone = await service.list({ page: 1, limit: 20, q: '1234567' });
      expect(byPhone.items.map((item) => item.id)).toEqual([target.id]);

      const byName = await service.list({ page: 1, limit: 20, q: 'سارا' });
      expect(byName.items).toHaveLength(1);

      // Substring + case-insensitive email match.
      const byEmail = await service.list({ page: 1, limit: 20, q: 'sara@example' });
      expect(byEmail.items).toHaveLength(1);
    });

    it('matches the business name through the profile summary', async () => {
      const seller = fake.seedUser({ phone: '09120000002', name: 'فروشنده' });
      fake.seedProfile({
        userId: seller.id,
        displayName: 'فروشنده',
        businessName: 'فروشگاه آفتاب',
      });
      fake.seedUser({ phone: '09120000003', name: 'بیزنس' });

      const page = await service.list({ page: 1, limit: 20, q: 'آفتاب' });
      expect(page.items.map((item) => item.id)).toEqual([seller.id]);
      expect(page.items[0]?.profile?.businessName).toBe('فروشگاه آفتاب');
    });

    it('filters by role, status, accountRole and onboarding state', async () => {
      const onboardedSeller = fake.seedUser({
        phone: '09120000004',
        name: 'تکمیل',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        accountRoles: [AccountRole.SELLER],
        onboardingCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      fake.seedUser({
        phone: '09120000005',
        name: 'ناقص',
        accountRoles: [AccountRole.BUYER],
      });
      fake.seedUser({
        phone: '09120000006',
        name: 'تعلیق',
        accountRoles: [AccountRole.SELLER],
        onboardingCompletedAt: new Date('2026-01-02T00:00:00.000Z'),
        status: UserStatus.SUSPENDED,
      });

      const page = await service.list({
        page: 1,
        limit: 20,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        accountRole: AccountRole.SELLER,
        onboarded: true,
      });
      expect(page.items.map((item) => item.id)).toEqual([onboardedSeller.id]);
    });

    it('sorts deterministically with an id tiebreak on equal keys', async () => {
      const sameMoment = new Date('2026-03-03T10:00:00.000Z');
      const laterId = fake.seedUser({ phone: '09120000008', name: 'دوم', createdAt: sameMoment });
      const earlierId = fake.seedUser({ phone: '09120000007', name: 'اول', createdAt: sameMoment });
      const expected = [earlierId.id, laterId.id].sort();

      // Identical createdAt stamps: createdAt desc + id asc tiebreak is total.
      const page = await service.list({ page: 1, limit: 20 });
      expect(page.items.map((item) => item.id)).toEqual(expected);

      const again = await service.list({ page: 1, limit: 20 });
      expect(again.items.map((item) => item.id)).toEqual(expected);
    });

    it('never returns password hashes or refresh tokens in list rows', async () => {
      fake.seedUser({ phone: '09120000009', name: 'مخفی', passwordHash: 'super-secret-hash' });
      const page = await service.list({ page: 1, limit: 20 });
      expect(page.items[0]).not.toHaveProperty('passwordHash');
      expect(page.items[0]).not.toHaveProperty('refreshTokens');
      expect(JSON.stringify(page.items[0])).not.toContain('super-secret-hash');
    });
  });

  describe('detail — allowlisted shape', () => {
    it('returns the user, profile summary and bounded lot/deal counts', async () => {
      const seller = fake.seedUser({
        phone: '09120000010',
        name: 'فروشنده',
        role: UserRole.USER,
        onboardingCompletedAt: new Date('2026-02-02T00:00:00.000Z'),
      });
      fake.seedProfile({
        userId: seller.id,
        displayName: 'نمایش فروشنده',
        businessName: 'کسب‌وکار نمونه',
        province: 'tehran',
        city: 'tehran',
        isSeller: true,
        successfulDeals: 3,
      });

      const detail = await service.getDetail(seller.id);
      expect(detail).toMatchObject({
        id: seller.id,
        phone: '09120000010',
        status: UserStatus.ACTIVE,
        profile: {
          displayName: 'نمایش فروشنده',
          businessName: 'کسب‌وکار نمونه',
          isSeller: true,
        },
        counts: { lots: 0, dealsAsBuyer: 0, dealsAsSeller: 0 },
      });
      expect(detail).not.toHaveProperty('passwordHash');
      expect(detail).not.toHaveProperty('refreshTokens');
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(service.getDetail('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus — transitions, revocation, audit', () => {
    it('suspends an ACTIVE user, revokes sessions and audits with the reason', async () => {
      const target = fake.seedUser({ phone: '09120000011', name: 'هدف' });
      await seedActiveTokens(target.id, 2);

      const result = await service.updateStatus(
        target.id,
        { action: UserStatusAction.SUSPEND, reason: 'نقض قوانین فروش' },
        OTHER_ACTOR,
      );

      expect(result.status).toBe(UserStatus.SUSPENDED);
      expect(result.deletedAt).toBeNull();
      // Everything was already revoked inside the action — nothing left active.
      await expect(activeTokens(target.id)).resolves.toBe(0);

      const audits = await fake.auditLog.findMany({ where: { entityId: target.id } });
      expect(audits).toEqual([
        expect.objectContaining({
          actorId: OTHER_ACTOR.actorId,
          action: 'user.status',
          entityType: 'User',
          metadata: expect.objectContaining({
            statusAction: 'SUSPEND',
            fromStatus: 'ACTIVE',
            toStatus: 'SUSPENDED',
            reason: 'نقض قوانین فروش',
            revokedSessions: 2,
          }),
        }),
      ]);
    });

    it('activates a SUSPENDED user back to ACTIVE', async () => {
      const target = fake.seedUser({
        phone: '09120000012',
        name: 'تعلیق',
        status: UserStatus.SUSPENDED,
      });
      const result = await service.updateStatus(
        target.id,
        { action: UserStatusAction.ACTIVATE, reason: 'رفع مشکل' },
        OTHER_ACTOR,
      );
      expect(result.status).toBe(UserStatus.ACTIVE);
    });

    it('soft-deletes: status DELETED with deletedAt stamp and revoked sessions', async () => {
      const target = fake.seedUser({ phone: '09120000013', name: 'حذف' });
      await seedActiveTokens(target.id, 1);

      const result = await service.updateStatus(
        target.id,
        { action: UserStatusAction.DELETE, reason: 'درخواست کاربر' },
        OTHER_ACTOR,
      );
      expect(result.status).toBe(UserStatus.DELETED);
      expect(result.deletedAt).not.toBeNull();
      await expect(activeTokens(target.id)).resolves.toBe(0);

      // Soft delete — the row must remain resolvable by id.
      const detail = await service.getDetail(target.id);
      expect(detail.status).toBe(UserStatus.DELETED);
    });

    it.each([
      { action: UserStatusAction.ACTIVATE, status: UserStatus.ACTIVE },
      { action: UserStatusAction.SUSPEND, status: UserStatus.SUSPENDED },
      { action: UserStatusAction.ACTIVATE, status: UserStatus.DELETED },
    ] as const)(
      'rejects $action on a $status user as an illegal transition',
      async ({ action, status }) => {
        const target = fake.seedUser({ phone: '09120000014', name: 'غیرقانونی', status });
        await expectGuard(
          service.updateStatus(target.id, { action, reason: 'تلاش غیرقانونی' }, OTHER_ACTOR),
          BadRequestException,
          'ILLEGAL_USER_STATUS_TRANSITION',
        );
      },
    );

    it('rejects self-targeted status actions (ADMIN_SELF_ACTION_FORBIDDEN)', async () => {
      const self = fake.seedUser({ phone: '09120000015', name: 'مدیر خود', role: UserRole.ADMIN });
      await expectGuard(
        service.updateStatus(
          self.id,
          { action: UserStatusAction.SUSPEND, reason: 'خودتعلیقی ممنوع' },
          { ...CONTEXT, actorId: self.id },
        ),
        ConflictException,
        'ADMIN_SELF_ACTION_FORBIDDEN',
      );
    });

    it('blocks suspending the last active admin (LAST_ADMIN_GUARD)', async () => {
      const lastAdmin = fake.seedUser({
        phone: '09120000016',
        name: 'آخرین مدیر',
        role: UserRole.ADMIN,
      });

      await expectGuard(
        service.updateStatus(
          lastAdmin.id,
          { action: UserStatusAction.SUSPEND, reason: 'نگهبان آخرین مدیر' },
          OTHER_ACTOR,
        ),
        ConflictException,
        'LAST_ADMIN_GUARD',
      );

      // With a second ACTIVE admin remaining, the suspension succeeds.
      fake.seedUser({ phone: '09120000017', name: 'مدیر دوم', role: UserRole.ADMIN });
      const result = await service.updateStatus(
        lastAdmin.id,
        { action: UserStatusAction.SUSPEND, reason: 'یک مدیر فعال دیگر باقی می‌ماند' },
        OTHER_ACTOR,
      );
      expect(result.status).toBe(UserStatus.SUSPENDED);
    });

    it('rolls the whole action back when the audit write fails', async () => {
      const target = fake.seedUser({ phone: '09120000018', name: 'برگردان' });
      await seedActiveTokens(target.id, 1);
      fake.failNextAuditCreate(new Error('audit unavailable'));

      await expect(
        service.updateStatus(
          target.id,
          { action: UserStatusAction.SUSPEND, reason: 'نباید بماند' },
          OTHER_ACTOR,
        ),
      ).rejects.toThrow('audit unavailable');

      await expect(fake.user.findUnique({ where: { id: target.id } })).resolves.toMatchObject({
        status: UserStatus.ACTIVE,
      });
      await expect(activeTokens(target.id)).resolves.toBe(1);
      await expect(fake.auditLog.findMany({ where: { entityId: target.id } })).resolves.toEqual([]);
    });
  });

  describe('updateRole — demotion guard and audit', () => {
    it('promotes a USER to ADMIN and audits the change', async () => {
      const target = fake.seedUser({ phone: '09120000019', name: 'ارتقا' });
      const result = await service.updateRole(
        target.id,
        { role: UserRole.ADMIN, reason: 'جایگزینی مدیر' },
        OTHER_ACTOR,
      );
      expect(result.role).toBe(UserRole.ADMIN);
      const audits = await fake.auditLog.findMany({ where: { entityId: target.id } });
      expect(audits[0]).toMatchObject({
        action: 'user.role',
        metadata: expect.objectContaining({
          fromRole: 'USER',
          toRole: 'ADMIN',
          reason: 'جایگزینی مدیر',
        }),
      });
    });

    it('refuses to demote the last active admin (LAST_ADMIN_GUARD)', async () => {
      const lastAdmin = fake.seedUser({
        phone: '09120000020',
        name: 'تنها مدیر',
        role: UserRole.ADMIN,
      });
      await expectGuard(
        service.updateRole(
          lastAdmin.id,
          { role: UserRole.USER, reason: 'تنها مدیر سیستم' },
          OTHER_ACTOR,
        ),
        ConflictException,
        'LAST_ADMIN_GUARD',
      );
      // The refused demotion must not have audited or mutated.
      await expect(fake.auditLog.findMany({ where: { entityId: lastAdmin.id } })).resolves.toEqual(
        [],
      );
      await expect(fake.user.findUnique({ where: { id: lastAdmin.id } })).resolves.toMatchObject({
        role: UserRole.ADMIN,
      });
    });

    it('demotes an admin when another active admin remains and revokes sessions', async () => {
      fake.seedUser({ phone: '09120000021', name: 'مدیر بازمانده', role: UserRole.ADMIN });
      const target = fake.seedUser({ phone: '09120000022', name: 'تنزیل', role: UserRole.ADMIN });
      await seedActiveTokens(target.id, 2);

      const result = await service.updateRole(
        target.id,
        { role: UserRole.USER, reason: 'سلب دسترسی مدیریتی' },
        OTHER_ACTOR,
      );
      expect(result.role).toBe(UserRole.USER);
      await expect(activeTokens(target.id)).resolves.toBe(0);
    });

    it('rejects self role changes (ADMIN_SELF_ACTION_FORBIDDEN)', async () => {
      const self = fake.seedUser({ phone: '09120000023', name: 'مدیر خود', role: UserRole.ADMIN });
      await expectGuard(
        service.updateRole(
          self.id,
          { role: UserRole.USER, reason: 'تغییر نقش خود ممنوع' },
          { ...CONTEXT, actorId: self.id },
        ),
        ConflictException,
        'ADMIN_SELF_ACTION_FORBIDDEN',
      );
    });

    it('audits a no-op when the role is unchanged (no mutation, no revocation)', async () => {
      const target = fake.seedUser({ phone: '09120000024', name: 'بی‌تغییر' });
      const result = await service.updateRole(
        target.id,
        { role: UserRole.USER, reason: 'بدون تغییر' },
        OTHER_ACTOR,
      );
      expect(result.role).toBe(UserRole.USER);
      const audits = await fake.auditLog.findMany({ where: { entityId: target.id } });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe('user.role');
      expect(audits[0]?.metadata).toMatchObject({ fromRole: 'USER', toRole: 'USER' });
    });
  });

  describe('revokeSessions', () => {
    it('revokes only the active refresh tokens and audits the action', async () => {
      const target = fake.seedUser({ phone: '09120000025', name: 'نشست‌ها' });
      await seedActiveTokens(target.id, 2);
      await fake.refreshToken.create({
        data: { tokenHash: 'already-revoked', userId: target.id, expiresAt: TOKEN_TTL },
      });
      await fake.refreshToken.updateMany({
        where: { tokenHash: 'already-revoked' },
        data: { revokedAt: new Date() },
      });

      const result = await service.revokeSessions(target.id, { reason: 'نشست مشکوک' }, OTHER_ACTOR);
      expect(result.revokedSessions).toBe(2);

      const audits = await fake.auditLog.findMany({ where: { entityId: target.id } });
      expect(audits[0]).toMatchObject({
        action: 'user.sessions',
        metadata: expect.objectContaining({ reason: 'نشست مشکوک', revokedSessions: 2 }),
      });
    });

    it('rejects self revocation (ADMIN_SELF_ACTION_FORBIDDEN)', async () => {
      const self = fake.seedUser({ phone: '09120000026', name: 'مدیر خود', role: UserRole.ADMIN });
      await expectGuard(
        service.revokeSessions(
          self.id,
          { reason: 'خودلغو ممنوع' },
          { ...CONTEXT, actorId: self.id },
        ),
        ConflictException,
        'ADMIN_SELF_ACTION_FORBIDDEN',
      );
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(
        service.revokeSessions('missing-id', { reason: 'وجود ندارد' }, OTHER_ACTOR),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
