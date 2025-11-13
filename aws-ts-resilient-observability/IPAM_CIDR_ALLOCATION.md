# IPAM-Based CIDR Allocation

## Overview

This project uses AWS IPAM (IP Address Management) for automatic CIDR allocation instead of manually specifying CIDR blocks for each VPC. This eliminates the need to track and manage IP address ranges manually.

## How It Works

### 1. Top-Level IPAM Pool
- **CIDR Range**: `10.0.0.0/8` (defined in IPAM component config)
- **Scope**: Organization-wide IP address space
- **Managed by**: Primary region (us-east-1)

### 2. Regional Pools
- **Netmask**: `/12` (configurable via `ipamRegionalPoolNetmask`)
- **Allocation**: Automatic from top-level pool
- **Regions**: us-east-1, us-west-2 (configurable via `ipamOperatingRegions`)

### 3. VPC Allocation
- **Netmask**: `/16` (configurable via `ipamVpcAllocationNetmask`)
- **Allocation**: Automatic from regional pool
- **No manual CIDR required**: IPAM automatically assigns non-overlapping ranges

## Configuration

### IPAM Component (deployment-config.json)

```json
{
  "type": "ipam",
  "name": "primary-ipam",
  "config": {
    "region": "us-east-1",
    "ipamCidrBlocks": ["10.0.0.0/8"],
    "ipamOperatingRegions": ["us-east-1", "us-west-2"],
    "ipamRegionalPoolNetmask": 12,
    "ipamVpcAllocationNetmask": 16
  }
}
```

### VPC Configuration (Before - Manual CIDR)

```json
{
  "type": "hub-vpc",
  "config": {
    "region": "us-east-1",
    "cidrBlock": "10.0.0.0/16"  // ❌ Manual CIDR - prone to conflicts
  }
}
```

### VPC Configuration (After - IPAM)

```json
{
  "type": "hub-vpc",
  "config": {
    "region": "us-east-1"
  },
  "notes": "CIDR automatically allocated from IPAM pool"
}
```

No `cidrBlock` needed! The VPC component automatically uses the IPAM pool ID from the shared services stack.

## Benefits

1. **No CIDR Conflicts**: IPAM ensures non-overlapping allocations
2. **Simplified Configuration**: No need to manually calculate CIDR ranges
3. **Scalability**: Easy to add new VPCs without planning IP ranges
4. **Cross-Region Support**: Single IPAM manages multiple regions
5. **Cross-Account Support**: IPAM pools can be shared via RAM

## Architecture

```
10.0.0.0/8 (Top-Level Pool)
├── us-east-1 Regional Pool (/12)
│   ├── Hub VPC (auto-allocated /16)
│   └── Spoke VPC (auto-allocated /16)
└── us-west-2 Regional Pool (/12)
    ├── Hub VPC (auto-allocated /16)
    └── Spoke VPC (auto-allocated /16)
```

## Implementation Details

### Shared Services Stack (`shared-services/index.ts`)

**Primary Region:**
```typescript
// Create IPAM with top-level pool
ipam = new IPAMComponent(`ipam-primary`, {
    region: currentRegion,
    cidrBlocks: ["10.0.0.0/8"],
    operatingRegions: ["us-east-1", "us-west-2"],
    regionalPoolNetmask: 12,
    vpcAllocationNetmask: 16,
    // ...
});

// Get pool resources for VPC creation
const poolResources = ipam.getPoolResources(currentRegion);
ipamPoolId = poolResources.pool.id;

// Create VPC with IPAM
const hubVpc = new VPCComponent(`hub-vpc-${currentRegion}`, {
    region: currentRegion,
    ipamPoolId: ipamPoolId,  // ✅ Automatic CIDR allocation
    // ...
});
```

**Secondary Region:**
```typescript
// Import IPAM pool from primary region
const primaryStack = new pulumi.StackReference(`shared-services-primary`);
const primaryIpamPoolIds = primaryStack.getOutput("ipamPoolIds");

// Extract pool ID for current region
ipamPoolId = pulumi.output(primaryIpamPoolIds).apply((pools: any) => {
    return pools[currentRegion];
});

// Create VPC with IPAM
const hubVpc = new VPCComponent(`hub-vpc-${currentRegion}`, {
    region: currentRegion,
    ipamPoolId: ipamPoolId,  // ✅ Automatic CIDR allocation
    // ...
});
```

### Workloads Stack (`workloads/index.ts`)

```typescript
// Import IPAM pool from shared services
const sharedServicesStackRef = new pulumi.StackReference(`shared-services-${currentRegion}`);
const ipamPoolIds = sharedServicesStackRef.getOutput("ipamPoolIds");

// Extract pool ID for current region
const ipamPoolId = pulumi.output(ipamPoolIds).apply((pools: any) => {
    return pools[currentRegion];
});

// Create spoke VPC with IPAM
const spokeVpc = new VPCComponent(`spoke-vpc-${currentRegion}`, {
    region: currentRegion,
    ipamPoolId: ipamPoolId,  // ✅ Automatic CIDR allocation
    // ...
});
```

### Key Points

1. **IPAM is created once** in the primary region
2. **Regional pools are automatically created** for each operating region
3. **VPCs reference the IPAM pool ID** instead of specifying CIDR blocks
4. **IPAM automatically allocates** non-overlapping CIDRs
5. **Cross-stack references** share IPAM pool IDs between stacks

## Migration Notes

If you have existing VPCs with manual CIDRs:
1. IPAM cannot manage existing VPCs
2. New VPCs will use IPAM allocation
3. Consider recreating VPCs to use IPAM (requires downtime)
4. Or keep existing VPCs with manual CIDRs and use IPAM for new ones

## Customization

### Change VPC Netmask

To use a different netmask for VPCs (e.g., `/18` instead of `/16`):

```json
{
  "type": "ipam",
  "config": {
    "ipamVpcAllocationNetmask": 18  // Change from 16 to 18
  }
}
```

Or override in the VPC component code:

```typescript
const hubVpc = new VPCComponent(`hub-vpc`, {
    ipamPoolId: ipamPoolId,
    // VPC component uses ipv4NetmaskLength from IPAM pool's default
    // To override, modify the IPAM pool's allocationDefaultNetmaskLength
});
```

### Add More Regions

To add more regions (e.g., `eu-west-1`):

```json
{
  "type": "ipam",
  "config": {
    "ipamOperatingRegions": ["us-east-1", "us-west-2", "eu-west-1"]
  }
}
```

Then create stacks for the new region following the same pattern.

### Change Top-Level CIDR

To use a different top-level CIDR range:

```json
{
  "type": "ipam",
  "config": {
    "ipamCidrBlocks": ["172.16.0.0/12"]  // Use 172.16.x.x instead
  }
}
```
