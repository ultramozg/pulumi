# Logging Configuration

## Overview

The deployment automation and component logging system supports configurable log levels to control output verbosity. By default, the system uses **INFO** level logging to reduce noise during deployments.

## Log Levels

The system supports four log levels (in order of increasing severity):

1. **DEBUG** (0) - Verbose logging including all validation steps, AWS provider calls, and detailed context
2. **INFO** (1) - Standard operational messages (deployments, resource creation, completions) - **DEFAULT**
3. **WARN** (2) - Warnings, retries, and rollbacks
4. **ERROR** (3) - Errors and failures only

## Setting Log Level

### Environment Variable

Set the `PULUMI_LOG_LEVEL` environment variable before running deployments:

```bash
# Default (INFO level) - Clean output, no debug messages
npm run automation deploy

# DEBUG level - Verbose output with full context
PULUMI_LOG_LEVEL=DEBUG npm run automation deploy

# WARN level - Only warnings and errors
PULUMI_LOG_LEVEL=WARN npm run automation deploy

# ERROR level - Only errors
PULUMI_LOG_LEVEL=ERROR npm run automation deploy
```

### In Scripts

You can set the log level programmatically in your deployment scripts:

```typescript
// Set before importing logging utilities
process.env.PULUMI_LOG_LEVEL = 'INFO';

import { DeploymentOrchestrator } from './automation/deployment-orchestrator';
```

## Log Output Differences

### INFO Level (Default)

Clean, concise output showing deployment progress:

```
📦 Deploying: shared-services-primary
🔐 Policy enforcement: enabled (advisory mode)
────────────────────────────────────────────────────────────
[custom:aws:observability:Mimir:observabilitystackcomponent-us-east-1-mimir] Component initialization completed
[custom:aws:observability:Mimir:observabilitystackcomponent-us-east-1-mimir] Creating ConfigMap: otel-config
✅ Completed: shared-services-primary (245.3s)
```

### DEBUG Level

Verbose output with full context JSON for troubleshooting:

```
📦 Deploying: shared-services-primary
🔐 Policy enforcement: enabled (advisory mode)
────────────────────────────────────────────────────────────
[custom:aws:observability:Mimir:observabilitystackcomponent-us-east-1-mimir] Component initialization completed | Context: {"componentType":"custom:aws:observability:Mimir","componentName":"observabilitystackcomponent-us-east-1-mimir","timestamp":"2025-11-29T09:17:08.135Z","region":"us-east-1","stackName":"shared-services-primary","tagCount":7}
DEBUG: [custom:aws:observability:Mimir:observabilitystackcomponent-us-east-1-mimir] Starting validation: component-arguments | Context: {"componentType":"custom:aws:observability:Mimir","operation":"validation_component-arguments","timestamp":"2025-11-29T09:17:08.135Z"}
DEBUG: [custom:aws:observability:Mimir:observabilitystackcomponent-us-east-1-mimir] Validation successful: component-arguments | Context: {...}
DEBUG: [custom:aws:observability:Mimir:observabilitystackcomponent-us-east-1-mimir] Getting AWS provider from registry | Context: {...}
[custom:aws:observability:Mimir:observabilitystackcomponent-us-east-1-mimir] Creating ConfigMap: otel-config
✅ Completed: shared-services-primary (245.3s)
```

### WARN Level

Only warnings, retries, rollbacks, and errors:

```
⚠️ BucketV2 is deprecated
🔄 Retrying deploy-stack-shared-services-primary (attempt 2/3) after 5000ms
❌ Failed: shared-services-primary (15.2s)
```

### ERROR Level

Only critical errors:

```
❌ Stack deployment failed: shared-services-primary | Context: {"error":{"message":"..."}}
```

## Context Visibility

- **DEBUG level**: Full context JSON shown for all log messages
- **ERROR level**: Full context JSON shown only for error messages
- **INFO/WARN levels**: Clean messages without context JSON (except errors)

This reduces log clutter while keeping critical error information detailed.

## Best Practices

1. **Development**: Use `DEBUG` level when developing new components
   ```bash
   PULUMI_LOG_LEVEL=DEBUG npm run automation deploy
   ```

2. **Production**: Use default `INFO` level for clean deployment logs
   ```bash
   npm run automation deploy
   ```

3. **Troubleshooting**: Use `DEBUG` level to diagnose issues
   ```bash
   PULUMI_LOG_LEVEL=DEBUG npm run automation deploy 2>&1 | tee deployment.log
   ```

4. **CI/CD**: Use `INFO` or `WARN` level to reduce log volume
   ```bash
   PULUMI_LOG_LEVEL=WARN npm run automation deploy
   ```

## Component-Specific Logging

All components use the `ComponentLogger` class which respects the global `PULUMI_LOG_LEVEL` setting:

```typescript
import { ComponentLogger } from '../shared/utils/logging';

const logger = new ComponentLogger('custom:aws:eks', 'my-cluster');

// This will only log if PULUMI_LOG_LEVEL=DEBUG
logger.debug('Starting validation');

// This will always log (unless PULUMI_LOG_LEVEL=WARN or ERROR)
logger.info('Creating cluster');

// This will always log (unless PULUMI_LOG_LEVEL=ERROR)
logger.warn('Using deprecated configuration');

// This will always log with full context
logger.error('Failed to create cluster', error);
```

## Automation Logging

The `DeploymentLogger` used by the automation orchestrator also respects the log level:

```typescript
import { DeploymentLogger } from './utils/logging';

const logger = new DeploymentLogger('my-deployment');

// Respects PULUMI_LOG_LEVEL
logger.info('Deployment started');
logger.warn('Retrying failed stack');
logger.error('Deployment failed', error);
```

## Troubleshooting

### Too Much Output

If you're seeing too many DEBUG messages:

1. Ensure `PULUMI_LOG_LEVEL` is not set, or set it to `INFO`
2. Check for direct `pulumi.log.info()` calls that bypass the logging system

### Too Little Output

If you're not seeing expected log messages:

1. Check if `PULUMI_LOG_LEVEL` is set to `WARN` or `ERROR`
2. Verify you're using the logging classes (`ComponentLogger`, `DeploymentLogger`)
3. Ensure the message is using the correct log level (e.g., `info()` not `debug()`)

### Context Not Showing

Context JSON is only shown in:
- **DEBUG mode** (all messages)
- **ERROR level messages** (always)

This is intentional to reduce log clutter while keeping error information detailed.
