# IPAM Setup Guide

## Overview

This project uses AWS IPAM (IP Address Management) for centralized IP address allocation across multiple regions and accounts. IPAM is deployed in the **primary region (us-east-1)** within the **shared-services** stack and manages IP addresses for all VPCs across both regions.

## Architecture

### IPAM Configuration

- **Location**: Primary region (us-east-1) in shared-services stack
- **CIDR Block**: `10.0.0.0/8` - Large address space for all VPCs
- **Operating Regions**: 
  - `us-east-1` (primary)
  - `us-west-2` (secondary)
- **Organization Sharing**: Disabled by default (can be enabled for AWS Organizations)

### IPAM Pools

IPAM creates regional pools for each operating region:
- **us-east-1 pool**: Allocates CIDRs for VPCs in the primary region
- **us-west-2 pool**: Allocates CIDRs for VPCs in the secondary region

## VPC Integration

### Primary Region VPCs

VPCs in the primary region (us-east-1) automatically use IPAM for CIDR allocation:

```typescript
// Primary region creates IPAM
ipam = new IPAMComponent(`ipam-primary`, {
    region: currentRegion,
    cidrBlocks: ["10.0.0.0/8"],
    operatingRegions: ["us-east-1", "us-west-2"],
    // ...
});

ipamPoolId = ipam.getPoolId(currentRegion);

// VPC uses IPAM pool
const hubVpc = new VPCComponent(`hub-vpc-${currentRegion}`, {
    region: currentRegion,
    ipamPoolId: ipamPoolId,  // Uses IPAM pool
    // No manual cidrBlock needed
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: { ... }
});
```

### Secondary Region VPCs

VPCs in the secondary region (us-west-2) import IPAM pool IDs from the primary stack:

```typescript
// Secondary region imports IPAM pool from primary
const primaryStack = new pulumi.StackReference("shared-services-primary");
const primaryIpamPoolIds = primaryStack.getOutput("ipamPoolIds");

ipamPoolId = pulumi.output(primaryIpamPoolIds).apply((pools: any) => {
    return pools[currentRegion] as string;
});

// VPC uses the same IPAM pool from primary region
const hubVpc = new VPCComponent(`hub-vpc-${currentRegion}`, {
    region: currentRegion,
    ipamPoolId: ipamPoolId,  // Uses IPAM pool from primary
    // ...
});
```

## Benefits

1. **Centralized Management**: Single source of truth for IP address allocation
2. **Automatic Allocation**: No need to manually calculate CIDR blocks
3. **Conflict Prevention**: IPAM ensures no overlapping IP ranges
4. **Multi-Region Support**: Consistent IP management across regions
5. **Scalability**: Easy to add new VPCs without IP planning overhead

## Configuration

### IPAM Component Arguments

```typescript
{
    region: string;                    // Primary region for IPAM
    cidrBlocks: string[];              // Top-level CIDR blocks (e.g., ["10.0.0.0/8"])
    shareWithOrganization: boolean;    // Enable AWS Organizations sharing
    operatingRegions: string[];        // Regions where IPAM operates
    tags: { [key: string]: string };   // Resource tags
}
```

### VPC Component with IPAM

```typescript
{
    region: string;
    ipamPoolId?: pulumi.Input<string>;  // IPAM pool ID for auto-allocation
    cidrBlock?: string;                 // Manual CIDR (alternative to IPAM)
    // ... other VPC configuration
}
```

## Exported Outputs

The shared-services stack exports the following IPAM-related outputs:

- `ipamId`: IPAM instance ID
- `ipamArn`: IPAM instance ARN
- `ipamPoolIds`: Map of region to pool ID
- `ipamScopeId`: IPAM scope ID

These can be referenced by other stacks for VPC creation.

## Cross-Region Architecture

### How It Works

1. **Primary Region (us-east-1)**:
   - Creates IPAM instance with operating regions: us-east-1, us-west-2
   - IPAM automatically creates regional pools for each operating region
   - Exports IPAM pool IDs via stack outputs

2. **Secondary Region (us-west-2)**:
   - Imports IPAM pool IDs from primary stack using `StackReference`
   - Uses the us-west-2 pool ID from the primary region's IPAM
   - VPCs get automatic CIDR allocation from the regional pool

3. **Dependency Chain**:
   ```
   Primary Stack (us-east-1)
   └── Creates IPAM with pools for both regions
   └── Exports ipamPoolIds
   
   Secondary Stack (us-west-2)
   └── Depends on Primary Stack
   └── Imports ipamPoolIds
   └── Uses us-west-2 pool for VPC creation
   ```

## Troubleshooting

### VPC Creation Fails with IPAM

If VPC creation fails when using IPAM:

1. Verify IPAM is created in primary region
2. Check IPAM pool has available CIDR space
3. Ensure operating regions include the target region
4. Verify IPAM pool ID is correctly exported/imported

### CIDR Conflicts

IPAM automatically prevents conflicts, but if issues occur:

1. Check IPAM pool allocations in AWS Console
2. Verify no manual VPCs overlap with IPAM range
3. Review IPAM pool CIDR blocks configuration

## AWS Console Access

To view IPAM resources:

1. Navigate to VPC Console
2. Select "IP Address Manager" from left menu
3. View IPAM instances, scopes, and pools
4. Monitor CIDR allocations and utilization
