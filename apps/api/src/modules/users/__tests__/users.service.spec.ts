import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { compare } from 'bcryptjs';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

describe('UsersService', () => {
  let service: UsersService;
  let fake: FakePrisma;

  beforeEach(async () => {
    fake = new FakePrisma();
    const repository = new UsersRepository(fake as unknown as PrismaService);
    service = new UsersService(repository, fake as unknown as PrismaService);
  });

  describe('create', () => {
    it('hashes the password and never returns it', async () => {
      const created = await service.create({
        phone: '09120000002',
        name: 'Jane',
        password: 'super-secret-1',
      });

      expect(created.phone).toBe('09120000002');
      expect(created).not.toHaveProperty('passwordHash');

      const stored = await fake.user.findUnique({ where: { id: created.id } });
      expect(stored).not.toBeNull();
      expect(stored?.passwordHash).not.toBe('super-secret-1');
      expect(await compare('super-secret-1', stored!.passwordHash as string)).toBe(true);
    });

    it('stores the optional email verbatim', async () => {
      const created = await service.create({
        phone: '09120000002',
        email: 'jane@example.com',
        name: 'Jane',
        password: 'super-secret-1',
      });
      expect(created.email).toBe('jane@example.com');
    });

    it('treats an explicit null email as "no email" — no uniqueness lookup, stores null', async () => {
      // A user with a null email already exists: a lookup for `email: null`
      // would either clash here or throw in real Prisma (null in a unique where).
      await service.create({ phone: '09120000001', name: 'A', password: 'super-secret-1' });

      const created = await service.create({
        phone: '09120000002',
        email: null,
        name: 'Jane',
        password: 'super-secret-1',
      });

      expect(created.email).toBeNull();
      const stored = await fake.user.findUnique({ where: { id: created.id } });
      expect(stored?.email).toBeNull();
    });

    it('defaults role/status/accountRoles for phone-first users', async () => {
      const created = await service.create({
        phone: '09120000002',
        name: 'Jane',
        password: 'super-secret-1',
      });
      expect(created.role).toBe(UserRole.USER);
      expect(created.status).toBe(UserStatus.ACTIVE);
      expect(created.accountRoles).toEqual([]);
    });

    it('rejects duplicate phones', async () => {
      await service.create({ phone: '09120000002', name: 'Jane', password: 'super-secret-1' });
      await expect(
        service.create({ phone: '09120000002', name: 'Jane 2', password: 'super-secret-2' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects duplicate emails when provided', async () => {
      await service.create({
        phone: '09120000002',
        email: 'jane@example.com',
        name: 'Jane',
        password: 'super-secret-1',
      });
      await expect(
        service.create({
          phone: '09120000003',
          email: 'jane@example.com',
          name: 'Jane 2',
          password: 'super-secret-2',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      for (const [name, phone] of [
        ['charlie', '09120000013'],
        ['alpha', '09120000011'],
        ['bravo', '09120000012'],
      ] as const) {
        await service.create({ phone, name, password: 'super-secret-1' });
      }
    });

    it('paginates and reports totals', async () => {
      const page = await service.list({ page: 1, limit: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(3);
      expect(page.page).toBe(1);
      expect(page.limit).toBe(2);
    });

    it('sorts by allowed fields', async () => {
      const page = await service.list({ page: 1, limit: 10, sort: 'phone' });
      expect(page.items.map((user) => user.phone)).toEqual([
        '09120000011',
        '09120000012',
        '09120000013',
      ]);
    });

    it('filters by phone', async () => {
      const page = await service.list({ page: 1, limit: 10, phone: '09120000012' });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.name).toBe('bravo');
    });

    it('rejects sort fields outside the allowlist', async () => {
      await expect(
        service.list({ page: 1, limit: 10, sort: 'passwordHash' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('filters by role', async () => {
      await service.create({
        phone: '09120000014',
        name: 'Admin',
        password: 'super-secret-1',
        role: UserRole.ADMIN,
      });
      const page = await service.list({ page: 1, limit: 10, role: UserRole.ADMIN });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.phone).toBe('09120000014');
    });
  });

  describe('getById', () => {
    it('throws NotFound for unknown ids', async () => {
      await expect(service.getById('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
