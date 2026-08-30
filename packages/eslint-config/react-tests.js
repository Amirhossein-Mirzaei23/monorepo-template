import globals from 'globals';

/**
 * Test-file overrides for React/TS test suites (Jest + Testing Library).
 * Spread after the `web` or `node` preset, or import directly into an app config.
 */
export default [
  {
    files: [
      '**/__tests__/**/*.{js,ts,tsx,jsx}',
      '**/*.{test,spec}.{js,ts,tsx,jsx}',
      '**/test/**/*.{js,ts,tsx,jsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      // Non-null assertions are allowed in tests (doc/CONVENTIONS.md)
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
