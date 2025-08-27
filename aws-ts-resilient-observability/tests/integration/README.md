# Integration Testing Framework

This directory contains the integration testing framework for AWS infrastructure components. The framework provides comprehensive testing capabilities for component interactions, multi-stack deployments, and end-to-end infrastructure validation.

## Overview

The integration testing framework includes:

- **Component Interaction Tests**: Test integration between components (VPC + IPAM, VPC + Transit Gateway)
- **Multi-Component Deployment Tests**: Test complete infrastructure deployments with dependencies
- **Automated Cleanup**: Automatic cleanup of test resources to prevent resource leaks
- **Test Utilities**: Helper functions and utilities for integration testing

## Test Structure

```
tests/integration/
├── README.md                           # This file
├── setup.ts                           # Jest setup for integration tests
├── global-setup.js                    # Global test setup
├── global-teardown.js                 # Global test teardown
├── env-setup.js                       # Environment configuration
├── test-utils.ts                      # Test utility functions
├── cleanup-manager.ts                 # Automated cleanup management
├── vpc-ipam.test.ts                   # VPC + IPAM integration tests
├── vpc-transitgateway.test.ts         # VPC + Transit Gateway integration tests
├── multi-component-deployment.test.ts # Multi-component deployment tests
└── workspaces/                        # Temporary test workspaces (auto-created)
```

## Running Integration Tests

### Prerequisites

1. **AWS Credentials**: Ensure AWS credentials are configured
2. **AWS Region**: Set `AWS_REGION` environment variable (defaults to `us-east-1`)
3. **Pulumi**: Pulumi CLI should be installed and configured

### Running Tests

```bash
# Run all integration tests
npm run test:integration

# Run integration tests with coverage
npm run test:integration:coverage

# Run integration tests in watch mode
npm run test:integration:watch

# Run specific test file
npx jest --config jest.integration.config.js vpc-ipam.test.ts

# Run all tests (unit + integration)
npm run test:all
```

### Test Configuration

Integration tests use a separate Jest configuration (`jest.integration.config.js`) with:

- **Timeout**: 20 minutes per test (infrastructure deployments take time)
- **Serial Execution**: Tests run one at a time to avoid resource conflicts
- **Retry**: Failed tests are retried once to handle infrastructure flakiness
- **Cleanup**: Automatic cleanup of test resources

## Test Categories

### 1. VPC + IPAM Integration Tests (`vpc-ipam.test.ts`)

Tests the integration between VPC and IPAM components:

- **Basic Integration**: VPC successfully uses IPAM for CIDR allocation
- **Pool Exhaustion**: VPC handles IPAM pool exhaustion gracefully
- **Multiple VPCs**: Multiple VPCs get non-overlapping CIDRs from same IPAM pool

### 2. VPC + Transit Gateway Integration Tests (`vpc-transitgateway.test.ts`)

Tests the integration between VPC and Transit Gateway components:

- **Basic Attachment**: VPC successfully attaches to Transit Gateway
- **Multiple VPCs**: Multiple VPCs attach to same Transit Gateway
- **Failure Handling**: VPC handles invalid Transit Gateway ARN gracefully
- **Subnet Fallback**: VPC uses private subnets when no transit-gateway subnets specified

### 3. Multi-Component Deployment Tests (`multi-component-deployment.test.ts`)

Tests complete infrastructure deployments:

- **Networking Foundation**: Deploy IPAM and Transit Gateway together
- **Complete Infrastructure**: Deploy multi-region infrastructure with dependencies
- **Failure Handling**: Handle deployment failures and stop dependent stacks

## Test Utilities

### IntegrationTestHelper

The `IntegrationTestHelper` class provides utilities for integration testing:

```typescript
const testHelper = new IntegrationTestHelper('test-prefix');

// Create test stack
const stack = await testHelper.createTestStack({
    stackName: 'my-test',
    workDir: './test-workspace'
});

// Deploy stack
const result = await testHelper.deployTestStack(stack);

// Wait for outputs
const outputs = await testHelper.waitForStackOutputs(stack, ['vpcId', 'subnetIds']);

// Validate outputs
testHelper.validateStackOutputs(outputs, {
    vpcId: validators.isValidVpcId,
    subnetIds: validators.isArray
});

// Cleanup
await testHelper.cleanup();
```

### Validators

Common validation functions for test outputs:

```typescript
import { validators } from './test-utils';

// Validate string outputs
validators.isString(value)
validators.hasMinLength(5)(value)

// Validate AWS resource IDs
validators.isValidVpcId(value)
validators.isValidSubnetId(value)
validators.isValidArn(value)

// Validate network configurations
validators.isValidCidr(value)
validators.isInRegion('us-east-1')(value)
```

## Automated Cleanup

The framework includes automated cleanup mechanisms to prevent resource leaks:

### CleanupManager

Tracks and cleans up test resources:

```typescript
import { CleanupManager } from './cleanup-manager';

const cleanupManager = new CleanupManager();

// Register resources for cleanup
cleanupManager.registerStack(stack);
cleanupManager.registerWorkspace(workspaceDir);
cleanupManager.registerFile(filePath);

// Clean up all resources
await cleanupManager.cleanupAll();

// Clean up old resources (older than 1 hour)
await cleanupManager.cleanupOldResources(60 * 60 * 1000);
```

### Automatic Cleanup

- **Test Completion**: Resources are cleaned up after each test
- **Process Exit**: Emergency cleanup on process exit
- **Error Handling**: Cleanup on uncaught exceptions
- **Old Resources**: Periodic cleanup of old test resources

## Environment Configuration

### Required Environment Variables

- `AWS_REGION`: AWS region for testing (default: `us-east-1`)
- AWS credentials (via AWS CLI, environment variables, or IAM roles)

### Optional Environment Variables

- `PULUMI_CONFIG_PASSPHRASE`: Pulumi configuration passphrase (default: `test-passphrase`)
- `TEST_RUN_ID`: Unique identifier for test run (auto-generated)

### Safety Checks

- Tests will not run against production environments
- AWS profile must not be set to 'production'
- NODE_ENV must not be 'production'

## Best Practices

### Writing Integration Tests

1. **Use Descriptive Names**: Test names should clearly describe what is being tested
2. **Test Real Scenarios**: Test realistic infrastructure scenarios, not just happy paths
3. **Handle Failures**: Test error conditions and failure scenarios
4. **Clean Up Resources**: Always clean up test resources to avoid costs
5. **Use Timeouts**: Set appropriate timeouts for infrastructure operations

### Test Organization

1. **Group Related Tests**: Group tests by component interactions
2. **Use Setup/Teardown**: Use Jest setup/teardown for common operations
3. **Share Utilities**: Use shared utilities for common test operations
4. **Document Tests**: Include clear descriptions of what each test validates

### Resource Management

1. **Unique Names**: Use unique names for test resources to avoid conflicts
2. **Tag Resources**: Tag all test resources for easy identification
3. **Monitor Costs**: Monitor AWS costs from test resources
4. **Clean Up Regularly**: Run cleanup operations regularly to remove orphaned resources

## Troubleshooting

### Common Issues

1. **Timeout Errors**: Increase test timeout or check AWS service limits
2. **Resource Conflicts**: Ensure unique resource names across tests
3. **Cleanup Failures**: Check AWS permissions for resource deletion
4. **Flaky Tests**: Use retry mechanisms for infrastructure-dependent tests

### Debugging

1. **Verbose Output**: Use `--verbose` flag for detailed test output
2. **Keep Resources**: Set environment variable to keep resources for debugging
3. **Check Logs**: Review Pulumi and AWS CloudTrail logs
4. **Manual Cleanup**: Use AWS console to manually clean up stuck resources

### Performance

1. **Parallel Execution**: Tests run serially by default to avoid conflicts
2. **Resource Reuse**: Consider reusing long-lived resources across tests
3. **Selective Testing**: Run specific test files during development
4. **Cleanup Optimization**: Optimize cleanup operations for faster test runs

## Contributing

When adding new integration tests:

1. Follow the existing test structure and naming conventions
2. Include appropriate cleanup mechanisms
3. Add validation for all important outputs
4. Test both success and failure scenarios
5. Update this README with new test descriptions
6. Ensure tests are deterministic and don't depend on external state