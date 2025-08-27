import { setupCleanupForJest, globalCleanupManager } from './cleanup-manager';

/**
 * Integration test setup configuration
 * This file is run before integration test suites
 */

// Set up automatic cleanup mechanisms
setupCleanupForJest();

// Configure Jest timeout for integration tests
jest.setTimeout(20 * 60 * 1000); // 20 minutes

// Global setup before all tests
beforeAll(async () => {
    console.log('🚀 Starting integration test suite...');
    
    // Clean up any leftover resources from previous test runs
    const resourceCounts = globalCleanupManager.getResourceCounts();
    const totalResources = Object.values(resourceCounts).reduce((sum, count) => sum + count, 0);
    
    if (totalResources > 0) {
        console.log(`🧹 Found ${totalResources} leftover resources from previous runs`);
        console.log(`   Stacks: ${resourceCounts.stack}`);
        console.log(`   Workspaces: ${resourceCounts.workspace}`);
        console.log(`   Files: ${resourceCounts.file}`);
        
        // Clean up old resources (older than 1 hour)
        const oneHour = 60 * 60 * 1000;
        await globalCleanupManager.cleanupOldResources(oneHour, { forceCleanup: true });
    }
});

// Global cleanup after all tests
afterAll(async () => {
    console.log('🧹 Integration test suite completed, performing final cleanup...');
    
    try {
        await globalCleanupManager.cleanupAll({ forceCleanup: true });
        console.log('✅ Final cleanup completed successfully');
    } catch (error) {
        console.error('❌ Final cleanup failed:', error);
        // Don't fail the test suite due to cleanup issues
    }
});

// Handle test failures
afterEach(async () => {
    // If a test failed, we might want to keep resources for debugging
    const testState = expect.getState();
    if (testState.currentTestName && testState.assertionCalls === 0) {
        // Test might have failed, consider keeping resources
        console.log(`⚠️  Test "${testState.currentTestName}" may have failed, resources preserved for debugging`);
    }
});

// Export utilities for tests
export { globalCleanupManager };

// Mock Pulumi runtime for integration tests that don't actually deploy
export const mockPulumiForIntegrationTests = () => {
    // This is different from unit test mocks - we want real deployments
    // Only mock if explicitly requested
    return {
        isMocked: false,
        enableMocking: () => {
            // Enable mocking for specific tests that don't need real deployments
            process.env.PULUMI_TEST_MODE = 'mocked';
        },
        disableMocking: () => {
            delete process.env.PULUMI_TEST_MODE;
        }
    };
};

// Environment validation
const validateTestEnvironment = () => {
    const requiredEnvVars = [
        // AWS credentials should be available
        'AWS_REGION',
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.warn(`⚠️  Missing environment variables for integration tests: ${missingVars.join(', ')}`);
        console.warn('   Some tests may fail or be skipped');
    }

    // Set default AWS region if not specified
    if (!process.env.AWS_REGION) {
        process.env.AWS_REGION = 'us-east-1';
        console.log('🔧 Set default AWS_REGION to us-east-1');
    }

    // Ensure we're not running against production
    if (process.env.AWS_PROFILE === 'production' || process.env.NODE_ENV === 'production') {
        throw new Error('Integration tests should not run against production environment');
    }
};

// Run environment validation
validateTestEnvironment();

console.log('✅ Integration test environment setup completed');