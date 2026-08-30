const { join } = require('node:path');

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: join(__dirname, 'tsconfig.json') }],
  },
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/__tests__/**'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
};
