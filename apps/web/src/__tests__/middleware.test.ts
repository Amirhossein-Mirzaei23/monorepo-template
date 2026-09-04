/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

const BASE_URL = 'http://localhost:3000';

function request(path: string, options: { refreshCookie?: boolean } = {}): NextRequest {
  const headers = new Headers();
  if (options.refreshCookie) {
    headers.set('cookie', 'refresh_token=header.payload.signature');
  }
  return new NextRequest(new URL(path, BASE_URL), { headers });
}

function redirectedTo(response: Response): URL {
  const location = response.headers.get('location');
  if (!location) {
    throw new Error('expected a redirect location header');
  }
  return new URL(location);
}

/** PLAT-002 matrix: cookie present/absent × protected/public/api routes. */
describe('middleware (PLAT-002 route gate)', () => {
  describe('protected routes', () => {
    it('redirects anonymous /dashboard to /login?next=/dashboard', () => {
      const response = middleware(request('/dashboard'));

      expect(response.status).toBe(307);
      const target = redirectedTo(response);
      expect(target.pathname).toBe('/login');
      expect(target.searchParams.get('next')).toBe('/dashboard');
    });

    it('keeps the full nested path in next=', () => {
      const response = middleware(request('/dashboard/deals/42'));

      expect(redirectedTo(response).searchParams.get('next')).toBe('/dashboard/deals/42');
    });

    it.each(['/onboarding', '/settings'])(
      'redirects anonymous %s (future protected prefix)',
      (path) => {
        const response = middleware(request(path));

        expect(response.status).toBe(307);
        expect(redirectedTo(response).searchParams.get('next')).toBe(path);
      },
    );

    it('passes /dashboard when the refresh cookie is present', () => {
      const response = middleware(request('/dashboard', { refreshCookie: true }));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('public routes', () => {
    it('lets anonymous / (marketplace home) through — no auth gate on /', () => {
      const response = middleware(request('/'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('lets anonymous /login through', () => {
      const response = middleware(request('/login'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('untouched surfaces', () => {
    it('does not gate /api BFF routes', () => {
      const response = middleware(request('/api/auth/login'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('does not gate static assets', () => {
      const response = middleware(request('/_next/static/chunks/app.js'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('matches prefixes on segment boundaries only (/dashboardx is public)', () => {
      const response = middleware(request('/dashboardx'));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });
});
