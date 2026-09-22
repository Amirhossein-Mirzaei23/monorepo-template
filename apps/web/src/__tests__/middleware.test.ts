jest.mock('next/server', () => ({
  NextResponse: {
    next: () => ({ status: 200, headers: new Headers() }),
    redirect: (url: URL) => ({ status: 307, headers: new Headers({ location: url.toString() }) }),
  },
}));

import { config, middleware } from '../middleware';

function request(path: string, cookie?: string) {
  const url = new URL(`http://localhost:3000${path}`);
  return {
    url: url.toString(),
    nextUrl: url,
    cookies: { has: (name: string) => name === 'refresh_token' && cookie !== undefined },
  } as never;
}

describe('middleware route gates', () => {
  it('redirects anonymous admin deep links with the complete safe next path', () => {
    const response = middleware(request('/admin/users?tab=active'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/login?next=%2Fadmin%2Fusers%3Ftab%3Dactive',
    );
  });

  it('redirects the bare /admin overview for anonymous visitors too', () => {
    const response = middleware(request('/admin'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/admin/login?next=%2Fadmin',
    );
  });

  it('leaves admin login available without a refresh cookie', () => {
    expect(middleware(request('/admin/login')).status).toBe(200);
  });

  it('preserves the existing normal route gate', () => {
    const response = middleware(request('/dashboard'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?next=%2Fdashboard');
  });

  it('allows cookie-present admin requests through to API-authoritative checks', () => {
    expect(middleware(request('/admin/audit', 'stale')).status).toBe(200);
  });

  it('pins the /admin matcher so the gate cannot silently regress', () => {
    expect(config.matcher).toContain('/admin/:path*');
  });
});
