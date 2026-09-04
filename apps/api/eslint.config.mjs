import node from '@monorepo/eslint-config/node';
import reactTests from '@monorepo/eslint-config/react-tests';

const config = [
  ...node,
  ...reactTests,
  {
    // NestJS runtime metadata: constructor-injected dependencies (PrismaService,
    // JwtService, app services…) AND controller handler parameter DTOs must be
    // runtime imports — `import type` erases them from design:paramtypes and the
    // app crashes with "can't resolve dependencies … Function at index [0]" /
    // the ValidationPipe silently skips DTO validation. This rule cannot tell
    // which type imports feed DI metadata, so it stays off for API source.
    // Keep genuinely type-only imports (prisma models, express req/res,
    // response interfaces) as `import type` by convention.
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];

export default config;
