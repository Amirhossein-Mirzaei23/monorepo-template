import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
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
        email: 'jane@example.com',
        name: 'Jane',
        password: 'super-secret-1',
      });

      expect(created.email).toBe('jane@example.com');
      expect(created).not.toHaveProperty('passwordHash');

      const stored = await fake.user.findUnique({ where: { id: created.id } });
      expect(stored).not.toBeNull();
      expect(stored?.passwordHash).not.toBe('super-secret-1');
      expect(await compare('super-secret-1', stored!.passwordHash)).toBe(true);
    });

    it('defaults the role to USER', async () => {
      const created = await service.create({
        email: 'jane@example.com',
        name: 'Jane',
        password: 'super-secret-1',
      });
      expect(created.role).toBe(UserRole.USER);
    });

    it('rejects duplicate emails', async () => {
      await service.create({ email: 'jane@example.com', name: 'Jane', password: 'super-secret-1' });
      await expect(
        service.create({ email: 'jane@example.com', name: 'Jane 2', password: 'super-secret-2' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      for (const name of ['charlie', 'alpha', 'bravo']) {
        await service.create({ email: `${name}@example.com`, name, password: 'super-secret-1' });
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
      const page = await service.list({ page: 1, limit: 10, sort: 'email' });
      expect(page.items.map((user) => user.email)).toEqual([
        'alpha@example.com',
        'bravo@example.com',
        'charlie@example.com',
      ]);
    });

    it('rejects sort fields outside the allowlist', async () => {
      await expect(
        service.list({ page: 1, limit: 10, sort: 'passwordHash' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('filters by role', async () => {
      await service.create({
        email: 'admin@example.com',
        name: 'Admin',
        password: 'super-secret-1',
        role: UserRole.ADMIN,
      });
      const page = await service.list({ page: 1, limit: 10, role: UserRole.ADMIN });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.email).toBe('admin@example.com');
    });
  });

  describe('getById', () => {
    it('throws NotFound for unknown ids', async () => {
      await expect(service.getById('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('re-hashes a new password inside the transaction boundary', async () => {
      const created = await service.create({
        email: 'jane@example.com',
        name: 'Jane',
        password: 'super-secret-1',
      });

      const updated = await service.update(created.id, { password: 'brand-new-pass' });
      expect(updated.id).toBe(created.id);

      const stored = await fake.user.findUnique({ where: { id: created.id } });
      expect(await compare('brand-new-pass', stored!.passwordHash)).toBe(true);
    });

    it('throws NotFound for unknown ids', async () => {
      await expect(service.update('missing-id', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects email clashes', async () => {
      await service.create({ email: 'a@example.com', name: 'A', password: 'super-secret-1' });
      const b = await service.create({
        email: 'b@example.com',
        name: 'B',
        password: 'super-secret-1',
      });
      await expect(service.update(b.id, { email: 'a@example.com' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('deletes inside the transaction boundary', async () => {
      const created = await service.create({
        email: 'jane@example.com',
        name: 'Jane',
        password: 'super-secret-1',
      });
      await service.remove(created.id);
      await expect(service.getById(created.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound for unknown ids', async () => {
      await expect(service.remove('missing-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
