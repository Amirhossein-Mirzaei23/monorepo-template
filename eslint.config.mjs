// Root config for root-invoked lint runs (lint-staged, editors). Canonical
// per-workspace configs live in apps/* and packages/* — `npm run lint` uses those.
// Blocks below mirror the per-workspace overrides so a root-invoked `eslint --fix`
// (lint-staged) produces identical results to the package configs.
import node from '@monorepo/eslint-config/node';

export default [
  ...node,
  {
    // Mirror of apps/api/eslint.config.mjs: NestJS runtime metadata — constructor-
    // injected dependencies and controller DTO parameters must be runtime imports.
    // The rule's autofix would erase them from design:paramtypes and break DI;
    // the API workspace keeps it off, so root runs must too.
    files: ['apps/api/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
