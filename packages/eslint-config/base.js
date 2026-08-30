import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** Ignores shared by every preset. */
export const commonIgnores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.next/**',
  '**/next-env.d.ts',
  '**/*.generated.*',
  'packages/shared-types/src/generated/**',
  'packages/shared-types/openapi.json',
];

/**
 * Base flat config: JS + TypeScript recommended, with repo conventions layered on.
 * Intended to be spread into the `node` and `web` presets.
 */
export default [
  {
    ignores: commonIgnores,
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TS rules only on TS files: .mjs/.js tool configs are parsed by other
    // parsers (e.g. eslint-config-next) that cannot provide type information.
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: {
      'no-console': 'off', // structured logging policy is enforced by review; scripts legitimately log
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // NOTE: no `fixStyle: inline-type-imports` — that option requires
      // type-aware linting, which the web preset cannot assume (next's parser).
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
  // CommonJS tool configs legitimately use require()
  {
    files: ['**/*.config.{js,cjs}', '**/jest.config.*'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
];
