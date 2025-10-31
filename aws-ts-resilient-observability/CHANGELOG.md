# Changelog

## [Unreleased] - 2024-10-31

### Changed
- **Simplified environment variables**: Removed redundant `SHARED_SERVICES_ACCOUNT_ID` and `WORKLOADS_ACCOUNT_ID` environment variables
- Account IDs are now automatically extracted from role ARNs using the new `extractAccountIdFromArn()` utility function

### Added
- **New AWS utilities** (`components/utils/aws-helpers.ts`):
  - `extractAccountIdFromArn()`: Extract account ID from AWS ARN
  - `parseArn()`: Parse AWS ARN into components
  - `isValidAccountId()`: Validate AWS account ID format
  - `getAccountIdFromEnv()`: Get account ID from environment variable containing role ARN
- **Comprehensive test coverage** for ARN parsing utilities
- **Usage example** (`examples/arn-usage-example.ts`) demonstrating ARN utility functions

### Updated
- `deployment-config.json`: Removed redundant account ID environment variables
- `DEPLOYMENT_GUIDE.md`: Updated environment variable documentation
- `.env.template`: Simplified to only include role ARNs with explanatory comments

### Benefits
- **Reduced configuration complexity**: Only role ARNs needed, account IDs extracted automatically
- **Eliminated redundancy**: Single source of truth for account information
- **Improved maintainability**: Less chance of mismatched account IDs and role ARNs
- **Better error handling**: Validation of ARN format and account ID extraction