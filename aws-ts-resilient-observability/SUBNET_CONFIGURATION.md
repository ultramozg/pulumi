# Subnet Configuration Guide

## Overview

The VPC component supports flexible subnet configuration with a simplified syntax for specifying availability zones.

## Syntax

### New Syntax (Recommended)

Simply specify the number of subnets to create:

```typescript
subnets: {
    public: {
        type: "public",
        subnetPrefix: 24,
        availabilityZones: 3  // Create 3 subnets (one per AZ)
    },
    private: {
        type: "private",
        subnetPrefix: 24,
        availabilityZones: 3  // Create 3 subnets (one per AZ)
    }
}
```

### Legacy Syntax (Still Supported)

You can still use an array for backward compatibility:

```typescript
subnets: {
    public: {
        type: "public",
        subnetPrefix: 24,
        availabilityZones: ["0", "1", "2"]  // Array of indices
    }
}
```

## How It Works

1. **VPC Component** fetches the first N availability zones in the region
2. **Subnets** are created automatically, one per AZ
3. **CIDR blocks** are calculated automatically with proper offsets to avoid overlaps

## Examples

### Basic VPC with 2 AZs

```typescript
const vpc = new VPCComponent("my-vpc", {
    region: "us-east-1",
    ipamPoolId: ipamPoolId,
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 2,  // Use 2 AZs
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: 2  // 2 public subnets
        },
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: 2  // 2 private subnets
        }
    }
});
```

### Production VPC with 3 AZs and Database Subnets

```typescript
const vpc = new VPCComponent("prod-vpc", {
    region: "us-east-1",
    ipamPoolId: ipamPoolId,
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,  // Use 3 AZs for HA
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,      // /24 = 256 IPs
            availabilityZones: 3   // 3 public subnets
        },
        private: {
            type: "private",
            subnetPrefix: 24,      // /24 = 256 IPs
            availabilityZones: 3   // 3 private subnets
        },
        database: {
            type: "private",
            subnetPrefix: 26,      // /26 = 64 IPs
            availabilityZones: 3   // 3 database subnets
        }
    }
});
```

### Different Subnet Counts per Type

You can create different numbers of subnets for different types:

```typescript
subnets: {
    public: {
        type: "public",
        subnetPrefix: 24,
        availabilityZones: 3  // 3 public subnets
    },
    private: {
        type: "private",
        subnetPrefix: 22,     // Larger subnets
        availabilityZones: 2  // Only 2 private subnets
    }
}
```

## Subnet Naming

Subnets are automatically named with the pattern: `{vpc-name}-subnet-{type}-{index}`

For example:
- `prod-vpc-subnet-public-0`
- `prod-vpc-subnet-public-1`
- `prod-vpc-subnet-private-0`
- `prod-vpc-subnet-private-1`

## CIDR Allocation

When using IPAM, CIDR blocks are automatically allocated:

1. **VPC** gets a CIDR from the IPAM pool (e.g., `/16`)
2. **Subnets** are carved out with proper offsets to avoid overlaps
3. **Subnet size** is determined by `subnetPrefix` (e.g., `24` for `/24`)

Example allocation for a VPC with `10.0.0.0/16`:
- `public-0`: `10.0.0.0/24`
- `public-1`: `10.0.1.0/24`
- `public-2`: `10.0.2.0/24`
- `private-0`: `10.0.3.0/24`
- `private-1`: `10.0.4.0/24`
- `private-2`: `10.0.5.0/24`

## Best Practices

1. **Use 3 AZs for production** - Provides high availability
2. **Use 2 AZs for dev/test** - Reduces costs while maintaining redundancy
3. **Match subnet count to AZ count** - Ensures even distribution
4. **Use smaller subnets for databases** - Databases typically need fewer IPs
5. **Use larger subnets for workloads** - Applications may need more IPs for scaling

## Migration from Array Syntax

If you're using the old array syntax, simply replace the array with a number:

**Before:**
```typescript
availabilityZones: ["0", "1", "2"]
```

**After:**
```typescript
availabilityZones: 3
```

Both syntaxes work, but the number syntax is cleaner and more intuitive.
