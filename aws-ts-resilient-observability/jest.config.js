module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/components', '<rootDir>/tests', '<rootDir>/automation'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
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
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};