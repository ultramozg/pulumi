# ESC Environments Configuration

## Overview

The deployment orchestrator now supports declarative ESC (Environment, Secrets, and Configuration) environment management through the `deployment-config.json` file. This eliminates the need for hardcoded credential references in code.

## Configuration

### Stack-Level ESC Environments

Add the `escEnvironments` field to any stack configuration to specify which Pulumi ESC environments should be loaded:

```json
{
  "name": "shared-services-primary",
  "workDir": "./shared-services",
  "stackName": "shared-services-primary",
  "roleArn": "${SHARED_SERVICES_ROLE_ARN}",
  "escEnvironments": ["namecheap-credentials", "cloudflare-credentials"],
  "components": [
    // ... component configuration
  ]
}
```

### How It Works

1. The deployment orchestrator reads the `escEnvironments` array from each stack configuration
2. Before deploying the stack, it checks which environments are already loaded
3. It adds any missing environments to the stack workspace
4. The Pulumi automation API loads secrets and config from these environments

## Benefits

### ✅ Configuration-Driven
- All ESC environment references are declared in `deployment-config.json`
- No need to modify code when adding new credentials or environments
- Easy to see which stacks use which credentials

### ✅ Extensible
- Add as many ESC environments as needed per stack
- Different stacks can use different combinations of environments
- Supports environment-specific configurations (dev, staging, prod)

### ✅ Maintainable
- No hardcoded credential names in TypeScript code
- Single source of truth for environment configuration
- Easier to audit and manage credential usage

### ✅ Flexible
- Works with existing Pulumi.yaml environment configurations
- Gracefully handles environments already loaded
- Compatible with multi-account, multi-region deployments

## Examples

### Example 1: Shared Services with Multiple Credentials

```json
{
  "name": "shared-services-primary",
  "escEnvironments": [
    "namecheap-credentials",
    "cloudflare-credentials",
    "datadog-credentials"
  ]
}
```

### Example 2: Workload Stack with Observability Credentials

```json
{
  "name": "workloads-primary",
  "escEnvironments": [
    "observability-endpoints",
    "database-credentials"
  ]
}
```

### Example 3: Development vs Production

```json
{
  "stacks": [
    {
      "name": "app-dev",
      "escEnvironments": ["aws-dev-credentials", "datadog-dev"]
    },
    {
      "name": "app-prod",
      "escEnvironments": ["aws-prod-credentials", "datadog-prod"]
    }
  ]
}
```

## Migration Guide

### Before (Hardcoded)

```typescript
// ❌ Hardcoded in deployment-orchestrator.ts
if (stackConfig.name.includes('shared-services')) {
    if (!existingEnvironments.includes('namecheap-credentials')) {
        await workspace.addEnvironments(stackName, 'namecheap-credentials');
    }
    if (!existingEnvironments.includes('cloudflare-credentials')) {
        await workspace.addEnvironments(stackName, 'cloudflare-credentials');
    }
}
```

### After (Configuration-Driven)

```json
{
  "name": "shared-services-primary",
  "escEnvironments": ["namecheap-credentials", "cloudflare-credentials"]
}
```

```typescript
// ✅ Generic implementation in deployment-orchestrator.ts
if (stackConfig.escEnvironments && stackConfig.escEnvironments.length > 0) {
    for (const envName of stackConfig.escEnvironments) {
        if (!existingEnvironments.includes(envName)) {
            await workspace.addEnvironments(stackName, envName);
        }
    }
}
```

## Best Practices

1. **Organize by Purpose**: Group related credentials into ESC environments
   - Example: `dns-credentials`, `monitoring-credentials`, `database-credentials`

2. **Environment Naming Convention**: Use descriptive, consistent names
   - Good: `aws-prod-credentials`, `cloudflare-tunnel-prod`
   - Avoid: `creds1`, `temp`, `test123`

3. **Minimal Access**: Only add ESC environments to stacks that need them
   - Don't add all credentials to all stacks
   - Follow principle of least privilege

4. **Documentation**: Add notes in deployment-config.json explaining which credentials are needed
   ```json
   {
     "notes": "Requires Namecheap credentials in ESC for DNS validation"
   }
   ```

## Troubleshooting

### Environment Not Found

If you see errors about missing ESC environments:

1. Verify the environment exists in Pulumi Cloud:
   ```bash
   pulumi env list
   ```

2. Check the environment name matches exactly (case-sensitive)

3. Ensure you have access to the environment:
   ```bash
   pulumi env get <environment-name>
   ```

### Duplicate Environment Loading

The orchestrator automatically checks for already-loaded environments and skips duplicates. If you see warnings about duplicate environments, this is normal and safe.

### Credentials Not Available

If credentials aren't available during deployment:

1. Verify the ESC environment contains the required values
2. Check the Pulumi.yaml file doesn't conflict with automation API settings
3. Review console output for ESC environment loading confirmations
