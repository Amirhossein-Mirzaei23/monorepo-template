const { join } = require('node:path');

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: 'src',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: join(__dirname, 'tsconfig.json') }],
  },
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  setupFiles: ['<rootDir>/test/set-env.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/instrumentation.ts',
    '!src/scripts/**',
    '!src/test/**',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 65,
      functions: 75,
      lines: 75,
    },
  },
};
