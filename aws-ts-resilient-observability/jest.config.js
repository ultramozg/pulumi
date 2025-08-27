module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/components', '<rootDir>/tests/unit', '<rootDir>/automation'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'components/**/*.ts',
    'automation/**/*.ts',
    '!components/**/*.test.ts',
    '!components/**/*.spec.ts',
    '!automation/**/*.test.ts',
    '!automation/**/*.spec.ts',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  silent: true
};