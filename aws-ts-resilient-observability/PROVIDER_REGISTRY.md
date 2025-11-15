# Provider Registry Pattern

## Problem

Previously, each component was creating its own AWS provider for the same region, leading to:
- **Duplicate provider resources** in Pulumi state (e.g., `vpccomponent-us-west-2-provider-us-west-2`, `ekscomponent-us-west-2-provider-us-west-2`)
- **Slower deployments** due to multiple provider initializations
- **Increased resource overhead** and state file bloat
- **Unnecessary complexity** in managing provider lifecycle

## Solution

The **Provider Registry** pattern implements a singleton registry that caches and reuses AWS providers across all components.

### Key Benefits

1. **Single Provider Per Region**: Only one provider is created for each region/account combination
2. **Automatic Reuse**: Components automatically get the cached provider
3. **Transparent Migration**: Existing component code continues to work without changes
4. **Cross-Account Support**: Handles role assumption and multi-account scenarios
5. **Performance**: Faster deployments with fewer provider resources

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Provider Registry                       │
│  (Singleton - Single instance across all components)    │
│                                                          │
│  Cache: Map<string, aws.Provider>                       │
│  Key Format: "region-accountId-roleArn"                 │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ getProvider()
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
   │   VPC   │      │   EKS   │      │   TGW   │
   │Component│      │Component│      │Component│
   └─────────┘      └─────────┘      └─────────┘
```

## Usage

### In Components (Automatic)

Components extending `BaseAWSComponent` automatically use the registry:

```typescript
// This now uses the provider registry internally
const provider = this.createProvider('us-west-2');
```

### Direct Usage

For custom scenarios:

```typescript
import { getProvider } from './components/shared/utils/provider-registry';

// Get provider for a region
const provider = getProvider('us-west-2');

// Get provider for cross-account scenario
const crossAccountProvider = getProvider(
    'us-west-2',
    parentResource,
    '123456789012',
    'arn:aws:iam::123456789012:role/DeploymentRole'
);
```

### Cross-Account Providers

The existing cross-account utilities now use the registry:

```typescript
import { getCachedProvider } from './components/shared/utils/aws-provider';

// Automatically uses the registry
const provider = getCachedProvider(roleArn, region);
```

## Migration Impact

### Before
```
Resources:
    ├─ pulumi:providers:aws  vpccomponent-us-west-2-provider-us-west-2
    ├─ pulumi:providers:aws  ekscomponent-us-west-2-provider-us-west-2
    ├─ pulumi:providers:aws  tgw-us-west-2-peer-provider
    └─ ... (3 providers for the same region)
```

### After
```
Resources:
    ├─ pulumi:providers:aws  aws-provider-us-west-2
    └─ ... (1 provider for the region)
```

## Implementation Details

### Cache Key Generation

The registry generates unique cache keys based on:
- **Region**: AWS region (e.g., `us-west-2`)
- **Account ID**: Optional account identifier for cross-account
- **Role ARN**: Optional role ARN for role assumption

Examples:
- Same account: `us-west-2`
- Cross-account: `us-west-2-123456789012`
- With role: `us-west-2-123456789012-arn:aws:iam::123456789012:role/DeploymentRole`

### Provider Configuration

The registry automatically handles:
- Region configuration
- Role assumption from Pulumi config (`aws:assumeRoles`)
- Cross-account role assumption
- Parent resource relationships

### Thread Safety

The registry is implemented as a singleton with a Map-based cache. In Pulumi's execution model (single-threaded Node.js), this is safe without additional locking.

## Testing

Run the provider registry tests:

```bash
npm test -- provider-registry.test.ts
```

The tests verify:
- Provider creation and caching
- Reuse for same region/account
- Separate providers for different regions/accounts
- Cache clearing functionality

## Debugging

To see which providers are cached:

```typescript
import { providerRegistry } from './components/shared/utils/provider-registry';

console.log('Cached providers:', providerRegistry.getKeys());
console.log('Provider count:', providerRegistry.size());
```

## Best Practices

1. **Always use `createProvider()`** in components - it automatically uses the registry
2. **Don't create providers directly** with `new aws.Provider()` unless absolutely necessary
3. **Use `getCachedProvider()`** for cross-account scenarios
4. **Clear the registry in tests** using `providerRegistry.clear()` to ensure test isolation

## Performance Impact

Expected improvements:
- **Deployment time**: 10-20% faster for multi-component stacks
- **State file size**: Reduced by number of duplicate providers
- **Memory usage**: Lower provider overhead during deployment
- **Provider initialization**: Only once per region instead of per component

## Backward Compatibility

The implementation is fully backward compatible:
- Existing component code works without changes
- `createProvider()` method signature unchanged
- Cross-account utilities maintain same interface
- No breaking changes to public APIs
