import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { AuditRepository } from '../../audit/audit.repository';
import { AuditService, type AuditWriteContext } from '../../audit/audit.service';
import { CategoriesRepository } from '../categories.repository';
import { CategoriesService } from '../categories.service';

const CONTEXT: AuditWriteContext = {
  actorId: 'admin-1',
  requestId: 'request-1',
  ip: '127.0.0.1',
};

describe('CategoriesService audit transaction', () => {
  let fake: FakePrisma;
  let service: CategoriesService;

  beforeEach(() => {
    fake = new FakePrisma();
    const prisma = fake as unknown as PrismaService;
    const audit = new AuditService(new AuditRepository(prisma));
    service = new CategoriesService(new CategoriesRepository(prisma), prisma, audit);
  });

  it('commits a category update and its allowlisted audit row together', async () => {
    const category = fake.seedCategory({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });

    await service.update(category.id, { nameFa: 'پوشاک تازه' }, CONTEXT);

    await expect(fake.category.findUnique({ where: { id: category.id } })).resolves.toMatchObject({
      nameFa: 'پوشاک تازه',
    });
    await expect(fake.auditLog.findMany({ where: { entityId: category.id } })).resolves.toEqual([
      expect.objectContaining({
        actorId: CONTEXT.actorId,
        action: 'category.update',
        entityType: 'Category',
        entityId: category.id,
        metadata: { changedFields: ['nameFa'] },
        requestId: CONTEXT.requestId,
        ip: CONTEXT.ip,
      }),
    ]);
  });

  it('rolls back the category update when audit creation fails', async () => {
    const category = fake.seedCategory({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
    fake.failNextAuditCreate(new Error('audit unavailable'));

    await expect(service.update(category.id, { nameFa: 'نباید بماند' }, CONTEXT)).rejects.toThrow(
      'audit unavailable',
    );

    await expect(fake.category.findUnique({ where: { id: category.id } })).resolves.toMatchObject({
      nameFa: 'پوشاک',
    });
    await expect(fake.auditLog.findMany({ where: { entityId: category.id } })).resolves.toEqual([]);
  });
});
