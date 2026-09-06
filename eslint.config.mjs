// Root config for root-invoked lint runs (lint-staged, editors). Canonical
// per-workspace configs live in apps/* and packages/* — `npm run lint` uses those.
// Blocks below mirror the per-workspace setups scoped to their directories, so a
// root-invoked `eslint --fix` (lint-staged) produces the same results as the
// workspace configs and cannot strip directives/imports the workspaces rely on.
import node from '@monorepo/eslint-config/node';
import web from '@monorepo/eslint-config/web';
import reactTests from '@monorepo/eslint-config/react-tests';

/** Scope config entries to the web app unless they already carry a files filter. */
function scopedToWeb(configs) {
  return configs.map((entry) =>
    entry.files ? entry : { ...entry, files: ['apps/web/**/*.{ts,tsx}'] },
  );
}

export default [
  ...node,
  ...scopedToWeb(web),
  ...scopedToWeb(reactTests).map((entry) => ({
    ...entry,
    files: ['apps/web/**/__tests__/**/*.{ts,tsx}', 'apps/web/src/**/*.spec.{ts,tsx}'],
  })),
  {
    // Mirror of apps/api/eslint.config.mjs: NestJS runtime metadata — constructor-
    // injected dependencies and controller DTO parameters must be runtime imports.
    // The rule's autofix would erase them from design:paramtypes and break DI;
    // the API workspace keeps it off, so root runs must too. Kept LAST: in flat
    // config the last matching entry wins for the same rule key.
    files: ['apps/api/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
