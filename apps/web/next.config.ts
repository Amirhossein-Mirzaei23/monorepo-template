import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Media origin (MEDIA-001): the API-served media base (lot images/avatars now,
 * chat media later) must be loadable in <img>/<video>. Follows the lib/config
 * convention — NEXT_PUBLIC_* build-time env — with the API URL + /media as the
 * default (mirrors the api's PUBLIC_MEDIA_BASE_URL default).
 */
const mediaOrigin = new URL(
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/media`,
).origin;

/**
 * Security headers incl. CSP (doc/ARCHITECTURE.md → Web hardening).
 * The template starts with script-src 'unsafe-inline' — Next's hydration and
 * dev tooling need it; tighten to nonce-based CSP before exposing to prod.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${mediaOrigin}`,
      `media-src 'self' blob: ${mediaOrigin}`,
      "font-src 'self' data:",
      "connect-src 'self'" + (isDev ? ' ws:' : ''),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
