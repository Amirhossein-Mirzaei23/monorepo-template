import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';

import { createTestApp } from './utils/create-test-app';

type RequestOptions = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: () => string;
  body?: () => Record<string, unknown>;
  expectedAdminStatus: number;
};

describe('Admin permission matrix (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let adminId: string;
  let userToken: string;
  let existingUserId: string;
  let deleteOnlyUserId: string;
  let categoryId: string;
  let siblingCategoryId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;

    const admin = testApp.prisma.seedUser({
      phone: '09120000000',
      email: 'admin@monorepo.local',
      name: 'Admin',
      passwordHash: await hash('admin-pass-123', 4),
      role: UserRole.ADMIN,
    });
    adminId = admin.id;
    const existingUser = testApp.prisma.seedUser({
      phone: '09120000001',
      email: 'user@monorepo.local',
      name: 'User',
      role: UserRole.USER,
    });
    existingUserId = existingUser.id;
    const deleteOnlyUser = testApp.prisma.seedUser({
      phone: '09120000002',
      email: 'delete-me@monorepo.local',
      name: 'Delete me',
      role: UserRole.USER,
    });
    deleteOnlyUserId = deleteOnlyUser.id;

    const category = testApp.prisma.seedCategory({
      nameFa: 'Category',
      slug: 'permission-category',
      sortOrder: 1,
    });
    categoryId = category.id;
    siblingCategoryId = testApp.prisma.seedCategory({
      nameFa: 'Sibling',
      slug: 'permission-sibling',
      sortOrder: 2,
    }).id;

    adminToken = await login(app, 'admin@monorepo.local', 'admin-pass-123');
    userToken = await otpLogin(app, '09120000001');
  });

  afterAll(async () => {
    await app.close();
  });

  it.each<RequestOptions>([
    {
      method: 'get',
      path: () => '/admin/overview',
      expectedAdminStatus: 200,
    },
    {
      method: 'get',
      path: () => '/users',
      expectedAdminStatus: 200,
    },
    {
      method: 'get',
      path: () => `/users/${existingUserId}`,
      expectedAdminStatus: 200,
    },
    {
      method: 'post',
      path: () => '/users',
      body: () => ({ phone: '09129990001', name: 'Created', password: 'super-secret-1' }),
      expectedAdminStatus: 201,
    },
    {
      method: 'patch',
      path: () => `/users/${existingUserId}`,
      body: () => ({ name: 'Updated' }),
      expectedAdminStatus: 200,
    },
    {
      method: 'delete',
      path: () => `/users/${deleteOnlyUserId}`,
      expectedAdminStatus: 204,
    },
    {
      method: 'post',
      path: () => '/admin/categories',
      body: () => ({ nameFa: 'Created category', slug: 'permission-created' }),
      expectedAdminStatus: 201,
    },
    {
      method: 'patch',
      path: () => `/admin/categories/${categoryId}`,
      body: () => ({ nameFa: 'Updated category' }),
      expectedAdminStatus: 200,
    },
    {
      method: 'patch',
      path: () => `/admin/categories/${categoryId}/reorder`,
      body: () => ({ siblingId: siblingCategoryId }),
      expectedAdminStatus: 200,
    },
  ])('$method $path is 401 anonymous, 403 for USER, and succeeds for ADMIN', async (operation) => {
    const anonymous = send(app, operation);
    await anonymous.expect(401);

    const user = send(app, operation).set('Authorization', `Bearer ${userToken}`);
    await user.expect(403);

    const admin = send(app, operation).set('Authorization', `Bearer ${adminToken}`);
    await admin.expect(operation.expectedAdminStatus);
  });

  it('persists the privileged category audit context and allowlisted metadata', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-forwarded-for', '203.0.113.42')
      .send({ nameFa: 'Audited category', slug: 'audited-category' })
      .expect(201);

    const audit = await request(app.getHttpServer())
      .get('/admin/audit')
      .query({ entityType: 'Category', entityId: response.body.id, action: 'category.create' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(audit.body.items).toEqual([
      expect.objectContaining({
        actorId: adminId,
        requestId: response.headers['x-request-id'],
        ip: '203.0.113.42',
        action: 'category.create',
        metadata: {
          parentId: null,
          sortOrder: expect.any(Number),
          isActive: true,
        },
      }),
    ]);
  });
});

function send(app: INestApplication, operation: RequestOptions): request.Test {
  const test = request(app.getHttpServer())[operation.method](operation.path());
  if (operation.body) {
    test.send(operation.body());
  }
  return test;
}

async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`login failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.accessToken as string;
}

async function otpLogin(app: INestApplication, phone: string): Promise<string> {
  const issued = await request(app.getHttpServer()).post('/auth/otp/request').send({ phone });
  if (issued.status !== 200 || typeof issued.body.devCode !== 'string') {
    throw new Error(`otp request failed: ${issued.status} ${JSON.stringify(issued.body)}`);
  }
  const verified = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({ phone, code: issued.body.devCode });
  if (verified.status !== 200) {
    throw new Error(`otp verify failed: ${verified.status} ${JSON.stringify(verified.body)}`);
  }
  return verified.body.accessToken as string;
}
