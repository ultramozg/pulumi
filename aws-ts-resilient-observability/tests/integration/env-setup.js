/**
 * Environment setup for integration tests
 * Sets up environment variables and configuration
 */

// Pulumi configuration
process.env.PULUMI_SKIP_UPDATE_CHECK = 'true';
process.env.PULUMI_SKIP_CONFIRMATIONS = 'true';
process.env.PULUMI_CONFIG_PASSPHRASE = 'test-passphrase';

// AWS configuration
if (!process.env.AWS_REGION) {
  process.env.AWS_REGION = 'us-east-1';
}

// Test configuration
process.env.NODE_ENV = 'test';
process.env.INTEGRATION_TEST = 'true';

// Disable telemetry and analytics
process.env.PULUMI_SKIP_TELEMETRY = 'true';
process.env.DO_NOT_TRACK = '1';

console.log('🔧 Integration test environment variables configured');