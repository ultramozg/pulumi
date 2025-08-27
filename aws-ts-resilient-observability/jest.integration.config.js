module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Only run integration tests
  roots: ['<rootDir>/tests/integration'],
  testMatch: [
    '**/tests/integration/**/*.test.ts'
  ],
  
  // Transform TypeScript files
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  
  // Coverage configuration for integration tests
  collectCoverageFrom: [
    'components/**/*.ts',
    'automation/**/*.ts',
    '!components/**/*.test.ts',
    '!components/**/*.spec.ts',
    '!automation/**/*.test.ts',
    '!automation/**/*.spec.ts',
    '!tests/**/*',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Timeout configuration
  testTimeout: 20 * 60 * 1000, // 20 minutes for integration tests
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  
  // Verbose output for integration tests
  verbose: true,
  
  // Run tests serially to avoid resource conflicts
  maxWorkers: 1,
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/integration/global-setup.js',
  globalTeardown: '<rootDir>/tests/integration/global-teardown.js',
  
  // Test result processor for better reporting
  reporters: [
    'default'
  ],
  
  // Environment variables for tests
  setupFiles: ['<rootDir>/tests/integration/env-setup.js']
};