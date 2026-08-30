import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../../test/utils/create-test-app';

describe('Health & Metrics (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live → 200 without authentication', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body).toMatchObject({ status: 'ok' });
    expect(response.body.uptimeSeconds).toEqual(expect.any(Number));
  });

  it('GET /health/ready → 200 when the database check passes', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
  });

  it('GET /metrics → 200 with prometheus text format', async () => {
    const response = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(String(response.headers['content-type'])).toContain('text/plain');
    expect(response.text).toContain('api_http_request_duration_seconds');
  });

  it('responses carry an x-request-id header (request-id correlation)', async () => {
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });
});
