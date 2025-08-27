# Run-All Capabilities Guide

This guide demonstrates the comprehensive run-all capabilities of the AWS Infrastructure Components automation API, providing Terragrunt-like functionality for Pulumi deployments.

## Overview

The automation API provides powerful run-all capabilities that enable:

- **Parallel Deployment**: Deploy multiple stacks simultaneously within dependency groups
- **Dependency Resolution**: Automatically resolve and respect inter-stack dependencies
- **Rollback Support**: Automatic rollback on deployment failures
- **Error Handling**: Comprehensive error handling with retry mechanisms
- **CLI Interface**: Rich command-line interface for all operations
- **Component Integration**: Seamless integration of all infrastructure components

## Quick Start

### 1. Deploy All Components with Default Configuration

```bash
# Deploy all available components with default settings
npm run run-all -- --region us-east-1

# Or using the CLI directly
npm run automation run-all -- --region us-east-1
```

### 2. Deploy Specific Components

```bash
# Deploy only VPC and EKS components
npm run deploy-components -- --components vpc,eks --region us-east-1

# Deploy all components except RDS and EKS
npm run run-all -- --exclude rds,eks --region us-west-2
```

### 3. Deploy from Configuration File

```bash
# Deploy complete infrastructure from configuration
npm run deploy -- --config examples/complete-run-all-deployment.yaml --rollback-on-failure

# Preview changes before deployment
npm run preview -- --config examples/simple-run-all-example.yaml --refresh
```

## CLI Commands

### Core Commands

| Command | Description | Example |
|---------|-------------|---------|
| `deploy` | Deploy from configuration file | `npm run deploy -- --config deployment.yaml` |
| `destroy` | Destroy all resources | `npm run destroy -- --config deployment.yaml --force` |
| `preview` | Preview changes without applying | `npm run preview -- --config deployment.yaml` |
| `run-all` | Deploy all components with defaults | `npm run run-all -- --region us-east-1` |
| `deploy-components` | Deploy specific components | `npm run deploy-components -- --components vpc,ecr` |
| `validate` | Validate configuration file | `npm run validate -- --config deployment.yaml` |
| `status` | Show deployment status | `npm run status -- --config deployment.yaml` |
| `rollback` | Rollback entire deployment | `npm run rollback -- --config deployment.yaml --force` |

### Command Options

| Option | Description | Example |
|--------|-------------|---------|
| `--config <path>` | Configuration file path | `--config deployment.yaml` |
| `--region <region>` | AWS region | `--region us-west-2` |
| `--components <list>` | Comma-separated component list | `--components vpc,ecr,eks` |
| `--exclude <list>` | Components to exclude | `--exclude rds,eks` |
| `--no-parallel` | Disable parallel deployment | `--no-parallel` |
| `--refresh` | Refresh state before deployment | `--refresh` |
| `--continue-on-failure` | Continue on stack failures | `--continue-on-failure` |
| `--rollback-on-failure` | Auto-rollback on failure | `--rollback-on-failure` |
| `--force` | Skip confirmations | `--force` |

## Configuration Examples

### Simple Run-All Configuration

```yaml
name: "simple-infrastructure"
defaultRegion: "us-east-1"
defaultTags:
  Environment: "development"
  ManagedBy: "pulumi-automation"

stacks:
  - name: "networking"
    workDir: "./shared-services"
    components:
      - type: "vpc"
        name: "demo-vpc"
        config:
          cidrBlock: "10.0.0.0/16"
          internetGatewayEnabled: true
          natGatewayEnabled: false

  - name: "container-registry"
    workDir: "./shared-services"
    components:
      - type: "ecr"
        name: "demo-registry"
        config:
          repositories:
            - name: "demo-app"
```

### Complete Multi-Region Configuration

See [examples/complete-run-all-deployment.yaml](examples/complete-run-all-deployment.yaml) for a comprehensive example with:

- Multi-region VPC deployment
- Global container registry with replication
- DNS and certificate management
- Global database with Aurora
- Kubernetes clusters across regions

## Programmatic Usage

### Using the InfrastructureAutomation Class

```typescript
import { InfrastructureAutomation } from './index';

const automation = new InfrastructureAutomation({
    errorHandling: {
        strategy: 'RETRY',
        maxRetries: 3,
        retryDelay: 5000
    }
});

// Deploy all components with default configuration
const config = automation.createComponentsConfig('my-deployment', {
    region: 'us-east-1',
    tags: { Environment: 'production' },
    includeComponents: ['vpc', 'ecr', 'eks']
});

const result = await automation.deployAll(config, {
    parallel: true,
    rollbackOnFailure: true
});

console.log(`Deployed ${result.successfulStacks}/${result.totalStacks} stacks`);
```

### Custom Configuration

```typescript
import { DeploymentConfig } from './automation/types';

const customConfig: DeploymentConfig = {
    name: 'custom-deployment',
    defaultRegion: 'us-west-2',
    defaultTags: {
        Project: 'my-project',
        Environment: 'staging'
    },
    stacks: [
        {
            name: 'networking',
            workDir: './shared-services',
            components: [
                {
                    type: 'vpc',
                    name: 'custom-vpc',
                    config: {
                        cidrBlock: '172.16.0.0/16',
                        internetGatewayEnabled: true,
                        natGatewayEnabled: true,
                        availabilityZoneCount: 3
                    }
                }
            ]
        }
    ]
};

const result = await automation.deployAll(customConfig);
```

## Deployment Features

### Parallel Deployment

The automation API automatically deploys stacks in parallel within dependency groups:

```
Group 1: [networking, container-registry] (parallel)
Group 2: [vpc-east, vpc-west] (parallel, depends on networking)
Group 3: [database, kubernetes] (parallel, depends on VPCs)
```

### Dependency Resolution

Dependencies are automatically resolved from the configuration:

```yaml
stacks:
  - name: "vpc"
    dependencies: ["networking"]  # Will deploy after networking
  - name: "eks"
    dependencies: ["vpc", "ecr"]  # Will deploy after both VPC and ECR
```

### Error Handling and Rollback

Comprehensive error handling with multiple strategies:

- **RETRY**: Retry failed operations with exponential backoff
- **FAIL_FAST**: Stop immediately on first failure
- **CONTINUE**: Continue deployment despite failures

Automatic rollback on failure:

```bash
# Enable automatic rollback on deployment failure
npm run deploy -- --config deployment.yaml --rollback-on-failure
```

### Monitoring and Logging

Built-in monitoring and structured logging:

- Deployment progress tracking
- Performance metrics collection
- Detailed error reporting
- Stack-level timing information

## Testing

### Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run specific test patterns
npm run test:error-handling
```

### Integration Tests

```bash
# Run integration tests
npm run test:integration

# Run end-to-end deployment tests
npm run test:e2e
```

### End-to-End Testing

The automation API includes comprehensive end-to-end tests that validate:

- Complete multi-stack deployments
- Dependency resolution
- Parallel deployment
- Rollback functionality
- Error handling scenarios

## Best Practices

### 1. Configuration Management

- Use version control for deployment configurations
- Validate configurations before deployment
- Use environment-specific configurations

### 2. Deployment Strategy

- Start with preview mode to validate changes
- Use rollback-on-failure for production deployments
- Monitor deployment progress and logs

### 3. Error Handling

- Configure appropriate retry strategies
- Use continue-on-failure for non-critical stacks
- Implement proper cleanup procedures

### 4. Security

- Use least-privilege IAM policies
- Enable encryption for all resources
- Regularly audit deployed resources

## Troubleshooting

### Common Issues

1. **Dependency Cycles**: Ensure no circular dependencies in stack configuration
2. **Resource Limits**: Check AWS service limits and quotas
3. **Permission Issues**: Verify IAM permissions for all required services
4. **Network Connectivity**: Ensure proper VPC and subnet configurations

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Enable debug logging
DEBUG=* npm run deploy -- --config deployment.yaml
```

### Validation

Always validate configurations before deployment:

```bash
# Validate configuration file
npm run validate -- --config deployment.yaml
```

## Advanced Usage

### Custom Components

Extend the automation API with custom components:

```typescript
// Register custom component
automation.registerComponent('custom-component', CustomComponent);

// Use in configuration
const config = {
    stacks: [{
        components: [{
            type: 'custom-component',
            name: 'my-custom',
            config: { /* custom config */ }
        }]
    }]
};
```

### Hooks and Plugins

Implement deployment hooks for custom logic:

```typescript
automation.addHook('pre-deploy', async (stack) => {
    console.log(`Pre-deploy hook for ${stack.name}`);
});

automation.addHook('post-deploy', async (stack, result) => {
    console.log(`Post-deploy hook for ${stack.name}: ${result.success}`);
});
```

## Migration from Terragrunt

The automation API provides similar functionality to Terragrunt's run-all:

| Terragrunt | Automation API |
|------------|----------------|
| `terragrunt run-all apply` | `npm run run-all` |
| `terragrunt run-all plan` | `npm run preview` |
| `terragrunt run-all destroy` | `npm run destroy` |
| `--terragrunt-parallelism` | `--no-parallel` (to disable) |
| `--terragrunt-include-dir` | `--components` |
| `--terragrunt-exclude-dir` | `--exclude` |

## Support

For issues and questions:

1. Check the [troubleshooting guide](examples/TROUBLESHOOTING_GUIDE.md)
2. Review [component usage guide](examples/COMPONENT_USAGE_GUIDE.md)
3. Run validation on your configuration
4. Check AWS service limits and permissions

## Examples

- [Simple Run-All Example](examples/simple-run-all-example.yaml)
- [Complete Multi-Region Deployment](examples/complete-run-all-deployment.yaml)
- [Development Environment](examples/deployment-configs/development-environment.yaml)
- [Microservices Platform](examples/deployment-configs/microservices-platform.yaml)