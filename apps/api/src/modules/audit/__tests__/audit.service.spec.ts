import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { AuditRepository } from '../audit.repository';
import { AuditService } from '../audit.service';

describe('AuditService', () => {
  let fake: FakePrisma;
  let service: AuditService;

  beforeEach(() => {
    fake = new FakePrisma();
    service = new AuditService(new AuditRepository(fake as unknown as PrismaService));
  });

  it('creates immutable allowlisted audit data with a caller transaction', async () => {
    await fake.$transaction((tx) =>
      service.create(
        {
          actorId: null,
          action: 'job.run',
          entityType: 'Job',
          entityId: 'job-1',
          metadata: { changedFields: ['status'] },
          requestId: 'job-request',
          ip: 'internal',
        },
        tx as never,
      ),
    );

    const rows = await fake.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: null, metadata: { changedFields: ['status'] } });
  });

  it.each([
    ['unsupported keys', { password: 'secret' }],
    ['nested values', { changedFields: { nameFa: true } }],
  ])('rejects metadata with %s at the service boundary', async (_case, metadata) => {
    await expect(
      service.create(
        {
          actorId: null,
          action: 'category.update',
          entityType: 'Category',
          entityId: 'category-1',
          metadata: metadata as never,
          requestId: 'request-1',
          ip: '127.0.0.1',
        },
        fake as never,
      ),
    ).rejects.toThrow('Unsupported audit metadata');
  });

  it('filters and paginates by actor, action, entity and date', async () => {
    const actor = fake.seedUser({ phone: '09120000000', name: 'Admin' });
    const tx = fake as never;
    await service.create(
      {
        actorId: actor.id,
        action: 'category.update',
        entityType: 'Category',
        entityId: 'category-1',
        metadata: {},
        requestId: 'r1',
        ip: '127.0.0.1',
      },
      tx,
    );
    await service.create(
      {
        actorId: actor.id,
        action: 'category.create',
        entityType: 'Category',
        entityId: 'category-2',
        metadata: {},
        requestId: 'r2',
        ip: '127.0.0.1',
      },
      tx,
    );

    const result = await service.list({
      page: 1,
      limit: 1,
      actorId: actor.id,
      action: 'category.update',
      entityType: 'Category',
      entityId: 'category-1',
      from: new Date(0),
      to: new Date('2999-01-01T00:00:00.000Z'),
    });

    expect(result).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect(result.items[0]).toMatchObject({ action: 'category.update', entityId: 'category-1' });
  });
});
