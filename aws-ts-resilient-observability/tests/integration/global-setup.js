/**
 * Global setup for integration tests
 * Runs once before all test suites
 */

const fs = require('fs');
const path = require('path');

module.exports = async () => {
  console.log('🚀 Global integration test setup starting...');
  
  // Create necessary directories
  const dirs = [
    path.join(__dirname, 'workspaces'),
    path.join(__dirname, '../../test-results/integration'),
    path.join(__dirname, '../../coverage/integration')
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  });
  
  // Set up test environment variables
  process.env.PULUMI_SKIP_UPDATE_CHECK = 'true';
  process.env.PULUMI_SKIP_CONFIRMATIONS = 'true';
  process.env.PULUMI_CONFIG_PASSPHRASE = 'test-passphrase';
  
  // Ensure AWS region is set
  if (!process.env.AWS_REGION) {
    process.env.AWS_REGION = 'us-east-1';
  }
  
  // Create a test run identifier
  const testRunId = `integration-${Date.now()}`;
  process.env.TEST_RUN_ID = testRunId;
  
  console.log(`🏷️  Test run ID: ${testRunId}`);
  console.log(`🌍 AWS Region: ${process.env.AWS_REGION}`);
  console.log('✅ Global integration test setup completed');
};