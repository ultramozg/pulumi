# Changelog

## [Unreleased] - 2024-10-31

### Changed
- **Eliminated environment variables**: No more environment variables needed for deployment
- **Simplified role configuration**: Role ARNs specified directly in stack configuration when needed
- **Uses default AWS credentials**: Leverages existing AWS CLI/SDK credential setup

### Added
- **Stack-level role configuration**: Optional `roleArn` field in stack configuration for cross-account deployment
- **Cross-account provider utilities** (`components/utils/aws-provider.ts`):
  - `createCrossAccountProvider()`: Create AWS provider with role assumption from role ARN
  - `getCachedProvider()`: Cached provider management for efficiency
  - `validateRoleAssumption()`: Pre-deployment role access validation
  - `createProvidersForDeployment()`: Bulk provider creation for multiple role ARNs
- **Enhanced AWS utilities** (`components/utils/aws-helpers.ts`):
  - `extractAccountIdFromArn()`: Extract account ID from AWS ARN
  - `parseArn()`: Parse AWS ARN into components
  - `isValidAccountId()`: Validate AWS account ID format
  - `getAccountIdFromEnv()`: Get account ID from environment variable containing role ARN
- **Comprehensive test coverage** for all new utilities
- **Usage examples**:
  - `examples/arn-usage-example.ts`: ARN utility functions
  - `examples/cross-account-provider-example.ts`: Cross-account deployment patterns
- **Deployment script** (`scripts/deploy-with-role-assumption.ts`): Example deployment using new approach

### Updated
- **Type definitions**: Enhanced `DeploymentConfig` and `StackConfig` with account references
- **Deployment orchestrator**: Added account validation before deployment
- `deployment-config.json`: Added accounts section with role configuration
- `DEPLOYMENT_GUIDE.md`: Updated to reflect configuration-driven approach
- `.env.template`: Simplified to minimal optional overrides

### Benefits
- **Zero environment variables**: Uses default AWS credentials with optional role assumption
- **Minimal configuration**: Only specify role ARNs when cross-account deployment is needed
- **Automatic validation**: Role access verified before deployment starts
- **Simplified setup**: Works with existing AWS CLI/SDK credential configuration
- **Account ID extraction**: Automatically extracts account IDs from role ARNs when needed
- **Enhanced error handling**: Clear validation and error messages for role assumption issues