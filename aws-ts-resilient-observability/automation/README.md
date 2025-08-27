# Automation API for Multi-Stack Deployment

This automation API provides enhanced capabilities for deploying multiple Pulumi stacks with dependency resolution, similar to Terragrunt's run-all functionality.

## Features

- **Multi-stack deployment**: Deploy multiple stacks in dependency order
- **Dependency resolution**: Automatically resolve and validate inter-stack dependencies
- **Parallel execution**: Deploy independent stacks in parallel for faster deployments
- **Configuration management**: YAML-based configuration for deployment specifications
- **Error handling**: Comprehensive error handling with rollback capabilities
- **CLI interface**: Command-line interface for easy automation
- **Dry-run support**: Preview changes before deployment

## Quick Start

### 1. Create a deployment configuration

Create a `deployment.yaml` file:

```yaml
name: "my-infrastructure"
defaultRegion: "us-east-1"
defaultTags:
  Environment: "production"
  Project: "my-project"

stacks:
  - name: "networking"
    workDir: "./networking"
    components:
      - type: "vpc"
        name: "main-vpc"
        config:
          cidrBlock: "10.0.0.0/16"
  
  - name: "applications"
    workDir: "./applications"
    dependencies: ["networking"]
    components:
      - type: "eks"
        name: "main-cluster"
        config:
          vpcId: "${networking.vpc.id}"
```

### 2. Deploy using CLI

```bash
# Deploy all stacks
npm run deploy -- --config deployment.yaml

# Preview changes
npm run preview -- --config deployment.yaml

# Destroy all stacks
npm run destroy -- --config deployment.yaml --force
```

### 3. Deploy programmatically

```typescript
import { InfrastructureAutomation } from './index';

const automation = new InfrastructureAutomation();

// Deploy from configuration file
await automation.deployFromConfig('./deployment.yaml');

// Or create configuration programmatically
const config = automation.createConfig('my-deployment', [
  {
    name: 'networking',
    workDir: './networking',
    components: [{ type: 'vpc', name: 'main', config: {} }]
  }
]);

await automation.deployAll(config);
```

## Configuration Format

### Deployment Configuration

```yaml
name: string                    # Deployment name
defaultRegion?: string          # Default AWS region
defaultTags?: object           # Default tags applied to all stacks

stacks:                        # Array of stack configurations
  - name: string               # Stack name (must be unique)
    workDir: string            # Path to stack directory
    dependencies?: string[]    # Array of stack names this stack depends on
    tags?: object             # Stack-specific tags
    components:               # Array of components in this stack
      - type: string          # Component type
        name: string          # Component name
        region?: string       # Component-specific region
        config: object        # Component configuration
```

### Stack Dependencies

Stacks can depend on other stacks using the `dependencies` field:

```yaml
stacks:
  - name: "networking"
    workDir: "./networking"
    components: [...]
  
  - name: "applications"
    workDir: "./applications"
    dependencies: ["networking"]  # Depends on networking stack
    components: [...]
  
  - name: "monitoring"
    workDir: "./monitoring"
    dependencies: ["networking", "applications"]  # Depends on both
    components: [...]
```

## API Reference

### DeploymentOrchestrator

Main class for orchestrating multi-stack deployments.

```typescript
class DeploymentOrchestrator {
  // Deploy from configuration file
  async deployFromConfig(configPath: string, options?: DeployOptions): Promise<DeploymentSummary>
  
  // Deploy from configuration object
  async deployAll(config: DeploymentConfig, options?: DeployOptions): Promise<DeploymentSummary>
  
  // Destroy all stacks
  async destroyAll(config: DeploymentConfig, options?: DestroyOptions): Promise<DeploymentSummary>
}
```

### ConfigManager

Utility for managing deployment configurations.

```typescript
class ConfigManager {
  // Load configuration from YAML file
  static loadConfig(configPath: string): DeploymentConfig
  
  // Create configuration programmatically
  static createConfig(name: string, stacks: StackConfig[], options?: ConfigOptions): DeploymentConfig
  
  // Save configuration to YAML file
  static saveConfig(config: DeploymentConfig, outputPath: string): void
}
```

### DependencyResolver

Handles dependency resolution and validation.

```typescript
class DependencyResolver {
  // Resolve dependencies and return deployment groups
  resolveDependencies(stacks: StackConfig[]): StackConfig[][]
}
```

## CLI Commands

### Deploy

Deploy all stacks from configuration:

```bash
npm run automation deploy [options]
```

Options:
- `--config <path>`: Path to deployment configuration file
- `--no-parallel`: Disable parallel deployment within groups
- `--refresh`: Refresh stack state before deployment

### Preview

Preview deployment changes:

```bash
npm run automation preview [options]
```

Options:
- `--config <path>`: Path to deployment configuration file
- `--refresh`: Refresh stack state before preview

### Destroy

Destroy all stacks:

```bash
npm run automation destroy [options]
```

Options:
- `--config <path>`: Path to deployment configuration file
- `--force`: Skip confirmation prompts
- `--no-parallel`: Disable parallel destruction within groups

## Deployment Flow

1. **Configuration Loading**: Load and validate deployment configuration
2. **Dependency Resolution**: Resolve stack dependencies and detect cycles
3. **Group Creation**: Create deployment groups based on dependencies
4. **Sequential Group Deployment**: Deploy each group in dependency order
5. **Parallel Stack Deployment**: Deploy stacks within each group in parallel
6. **Error Handling**: Stop deployment on failures and provide detailed error information

## Error Handling

The automation API provides comprehensive error handling:

- **Configuration Validation**: Validates configuration format and dependencies
- **Circular Dependency Detection**: Detects and reports circular dependencies
- **Deployment Failures**: Stops deployment on stack failures and provides detailed error information
- **Rollback Support**: Supports destroying partially deployed infrastructure

## Examples

See the `examples/` directory for complete deployment configuration examples:

- `deployment-config.yaml`: Comprehensive multi-stack deployment with all component types
- Simple configurations for specific use cases

## Integration with Existing Stacks

The automation API is backward compatible with existing stack deployments. You can:

1. Continue using the legacy `upStack` function for simple deployments
2. Gradually migrate to the new automation API
3. Mix both approaches as needed

```typescript
// Legacy approach
await upStack("my-stack", "./my-stack");

// New automation API approach
const automation = new InfrastructureAutomation();
await automation.deployFromConfig('./deployment.yaml');
```