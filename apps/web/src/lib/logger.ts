import pino from 'pino';

/**
 * Structured logging for web server contexts (route handlers / BFF).
 * Client components must not import this module.
 * No pino transport here on purpose: transports use dynamic requires that
 * Next's server bundler cannot follow.
 */
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { app: 'monorepo-web' },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
