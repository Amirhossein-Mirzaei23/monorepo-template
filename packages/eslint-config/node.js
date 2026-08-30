import globals from 'globals';
import base, { commonIgnores } from './base.js';

/** Node preset: base + node globals. Used by `apps/api` and node-side tooling. */
export default [
  {
    ignores: commonIgnores,
  },
  ...base,
  {
    files: ['**/*.{js,cjs,mjs,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
