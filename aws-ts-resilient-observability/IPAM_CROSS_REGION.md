# IPAM Cross-Region Implementation

## Overview

This document explains how IPAM is shared between primary and secondary regions in the shared-services stack.

## Architecture Pattern

### Single IPAM Instance
- **Created in**: Primary region (us-east-1) only
- **Manages**: IP allocation for both us-east-1 and us-west-2
- **Benefit**: Centralized IP management, no duplication

### Regional Pools
When IPAM is created with multiple operating regions, it automatically creates a pool for each region:

```typescript
operatingRegions: ["us-east-1", "us-west-2"]
```

This creates:
- `us-east-1` pool → Allocates CIDRs for VPCs in us-east-1
- `us-west-2` pool → Allocates CIDRs for VPCs in us-west-2

## Implementation Details

### Primary Region (us-east-1)

```typescript
if (isPrimary) {
    // Create IPAM only in primary region
    ipam = new IPAMComponent(`ipam-primary`, {
        region: currentRegion,
        cidrBlocks: ["10.0.0.0/8"],
        shareWithOrganization: false,
        operatingRegions: ["us-east-1", "us-west-2"],
        tags: {
            Name: `shared-services-ipam`,
            Purpose: "CentralizedIPManagement",
            IsPrimary: "true"
        }
    });

    // Get pool ID for current region (us-east-1)
    ipamPoolId = ipam.getPoolId(currentRegion);
}
```

**Exports**:
```typescript
export const ipamPoolIds = ipam?.poolIds;
// Returns: { "us-east-1": "ipam-pool-xxx", "us-west-2": "ipam-pool-yyy" }
```

### Secondary Region (us-west-2)

```typescript
if (!isPrimary) {
    // Import IPAM pool IDs from primary stack
    const primaryStack = new pulumi.StackReference("shared-services-primary");
    const primaryIpamPoolIds = primaryStack.getOutput("ipamPoolIds");
    
    // Extract pool ID for us-west-2
    ipamPoolId = pulumi.output(primaryIpamPoolIds).apply((pools: any) => {
        if (!pools || !pools[currentRegion]) {
            throw new Error(`IPAM pool not found for region ${currentRegion}`);
        }
        return pools[currentRegion] as string;
    });
}
```

**Key Points**:
- Uses `StackReference` to access primary stack outputs
- Extracts the `us-west-2` pool ID from the map
- No IPAM creation in secondary region

### VPC Creation (Both Regions)

```typescript
const hubVpc = new VPCComponent(`hub-vpc-${currentRegion}`, {
    region: currentRegion,
    ipamPoolId: ipamPoolId,  // Works for both regions
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: { ... }
});
```

**Result**:
- Primary VPC gets CIDR from us-east-1 pool
- Secondary VPC gets CIDR from us-west-2 pool
- Both allocations managed by the same IPAM instance

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Primary Region Stack (us-east-1)                            │
│                                                              │
│  1. Create IPAM with operating regions                      │
│     └─► IPAM creates pools for each region                  │
│         ├─► us-east-1 pool (ipam-pool-xxx)                  │
│         └─► us-west-2 pool (ipam-pool-yyy)                  │
│                                                              │
│  2. Export ipamPoolIds                                       │
│     └─► { "us-east-1": "xxx", "us-west-2": "yyy" }         │
│                                                              │
│  3. Create VPC with us-east-1 pool                          │
│     └─► VPC gets CIDR from pool xxx                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ StackReference
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Secondary Region Stack (us-west-2)                          │
│                                                              │
│  1. Import ipamPoolIds from primary                         │
│     └─► Gets { "us-east-1": "xxx", "us-west-2": "yyy" }    │
│                                                              │
│  2. Extract us-west-2 pool ID                               │
│     └─► ipamPoolId = "yyy"                                  │
│                                                              │
│  3. Create VPC with us-west-2 pool                          │
│     └─► VPC gets CIDR from pool yyy                         │
└─────────────────────────────────────────────────────────────┘
```

## Benefits of This Approach

### 1. Single Source of Truth
- One IPAM instance manages all IP allocations
- No risk of creating duplicate IPAM instances
- Centralized visibility and control

### 2. Automatic Regional Isolation
- Each region has its own pool
- CIDRs are allocated from the appropriate regional pool
- No manual pool selection needed

### 3. Simplified Management
- Update IPAM configuration in one place (primary)
- Changes propagate to all regions
- Consistent IP allocation policies

### 4. Cost Optimization
- Only one IPAM instance (charged per instance)
- No duplicate resources across regions

### 5. Dependency Management
- Clear dependency: secondary depends on primary
- Pulumi handles the dependency chain automatically
- Prevents race conditions during deployment

## Stack Reference Details

### What is StackReference?

`StackReference` allows one Pulumi stack to reference outputs from another stack:

```typescript
const primaryStack = new pulumi.StackReference("shared-services-primary");
const output = primaryStack.getOutput("outputName");
```

### Why Use It?

- **Cross-stack communication**: Share data between stacks
- **Dependency management**: Ensures primary deploys before secondary
- **Type safety**: Outputs are properly typed
- **Automatic updates**: Changes in primary propagate to secondary

### Stack Naming Convention

The stack reference name must match the stack name:
- Primary stack name: `shared-services-primary`
- Reference in secondary: `new pulumi.StackReference("shared-services-primary")`

## Troubleshooting

### Error: "IPAM pool not found for region"

**Cause**: Primary stack hasn't exported IPAM pool IDs yet.

**Solution**:
1. Verify primary stack is deployed: `pulumi stack output -s shared-services-primary`
2. Check `ipamPoolIds` output exists
3. Redeploy secondary stack

### Error: "Stack 'shared-services-primary' not found"

**Cause**: Primary stack doesn't exist or wrong name.

**Solution**:
1. Deploy primary stack first
2. Verify stack name matches exactly
3. Check you're in the correct Pulumi organization/project

### VPC Creation Fails in Secondary Region

**Cause**: IPAM pool ID is invalid or not accessible.

**Solution**:
1. Check IPAM exists in primary region
2. Verify operating regions include us-west-2
3. Ensure IPAM pool has available CIDR space
4. Check AWS permissions for cross-region IPAM usage

## AWS Console Verification

### View IPAM Resources

1. Go to AWS Console → VPC → IP Address Manager
2. Select the IPAM instance (in us-east-1)
3. View "Scopes" tab → "Pools" tab
4. You should see two pools:
   - One for us-east-1
   - One for us-west-2

### View VPC Allocations

1. In IPAM console, select a pool
2. Click "Allocations" tab
3. See which VPCs are using CIDRs from this pool
4. Verify both primary and secondary VPCs appear

## Best Practices

### 1. Always Deploy Primary First
Never deploy secondary before primary. The deployment config enforces this:

```json
{
  "name": "shared-services-secondary",
  "dependencies": ["shared-services-primary"]
}
```

### 2. Use Consistent Naming
Keep stack names consistent with the StackReference:
- Stack name: `shared-services-primary`
- Reference: `new pulumi.StackReference("shared-services-primary")`

### 3. Export All Necessary Outputs
Primary stack should export everything secondary needs:
```typescript
export const ipamId = ipam?.ipamId;
export const ipamPoolIds = ipam?.poolIds;
export const ipamScopeId = ipam?.scopeId;
```

### 4. Handle Missing Outputs Gracefully
Secondary stack should validate imported data:
```typescript
if (!pools || !pools[currentRegion]) {
    throw new Error(`IPAM pool not found for region ${currentRegion}`);
}
```

### 5. Document Dependencies
Always document cross-stack dependencies in:
- README files
- Deployment guides
- Configuration files

## Future Enhancements

### Add More Regions
To add a new region (e.g., eu-west-1):

1. Update IPAM operating regions in primary:
   ```typescript
   operatingRegions: ["us-east-1", "us-west-2", "eu-west-1"]
   ```

2. Create new stack for eu-west-1:
   ```typescript
   const primaryStack = new pulumi.StackReference("shared-services-primary");
   ipamPoolId = primaryStack.getOutput("ipamPoolIds").apply(
       pools => pools["eu-west-1"]
   );
   ```

3. Deploy in order: primary → us-west-2 → eu-west-1

### Enable Organization Sharing
To share IPAM across AWS accounts:

1. Set `shareWithOrganization: true` in primary
2. IPAM automatically shares with AWS Organization
3. Other accounts can use IPAM pools for their VPCs

### Custom Pool Configuration
For more control over regional pools:

1. Create pools manually instead of automatic creation
2. Assign different CIDR ranges per region
3. Set custom allocation rules per pool
