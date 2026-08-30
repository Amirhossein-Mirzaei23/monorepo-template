import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '\\.css$': 'identity-obj-proxy' },
  collectCoverageFrom: [
    'src/features/**/*.{ts,tsx}',
    'src/components/**/*.{ts,tsx}',
    'src/lib/**/*.{ts,tsx}',
    'src/providers/**/*.{ts,tsx}',
    '!src/**/index.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  // Web coverage target intentionally lower than api/shared packages:
  // UI glue code dominates; raise as the app grows (task 5.3).
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 55,
      functions: 60,
      lines: 60,
    },
  },
};

export default createJestConfig(config);
