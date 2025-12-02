# VPC Component

The VPC Component provides flexible VPC deployment with automatic IP management and connectivity options. It supports three different approaches for CIDR allocation:

1. **IPAM-based allocation** - Uses AWS IPAM for automatic CIDR assignment
2. **Manual CIDR block** - Specify a fixed CIDR block for the VPC
3. **Base subnet with prefix calculation** - Specify a base subnet and let the component calculate subnet CIDRs automatically

## Features

- Automatic subnet CIDR calculation based on prefix lengths
- Support for multiple subnet types (public, private, transit-gateway)
- Internet Gateway and NAT Gateway configuration with flexible strategies
- Transit Gateway attachment support
- Route table management with proper associations
- Comprehensive validation and error handling

## NAT Gateway Strategies

The VPC component supports two NAT Gateway deployment strategies:

### Zonal Strategy (Default)
- **High Availability**: One NAT Gateway per availability zone
- **Cost**: Higher (multiple NAT Gateways + data processing charges per gateway)
- **Resilience**: If one AZ fails, other AZs maintain internet connectivity
- **Use case**: Production workloads requiring high availability

### Regional Strategy
- **Cost-Optimized**: Single NAT Gateway shared across all availability zones
- **Cost**: Lower (one NAT Gateway + single data processing charge)
- **Resilience**: Single point of failure - if the AZ with NAT Gateway fails, all private subnets lose internet access
- **Cross-AZ Data Transfer**: Additional charges for traffic from other AZs
- **Use case**: Development/test environments, cost-sensitive deployments

## Usage

### Example with Zonal NAT Gateway (High Availability - Default)

```typescript
import { VPCComponent } from "./components/vpc";

const vpc = new VPCComponent("my-vpc-ha", {
    region: "us-west-2",
    environment: "production",

    // Use base subnet for automatic CIDR calculation
    baseSubnet: "10.0.0.0/16",

    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    natGatewayStrategy: "zonal",  // One NAT per AZ (default)
    availabilityZoneCount: 3,

    subnets: {
        "public": {
            type: "public",
            subnetPrefix: 24,  // /24 = 256 IPs per subnet
            availabilityZones: 3
        },
        "private": {
            type: "private",
            subnetPrefix: 24,  // /24 = 256 IPs per subnet
            availabilityZones: 3
        }
    }
});
```

### Example with Regional NAT Gateway (Cost-Optimized)

```typescript
import { VPCComponent } from "./components/vpc";

const vpc = new VPCComponent("my-vpc-dev", {
    region: "us-west-2",
    environment: "development",

    baseSubnet: "10.1.0.0/16",

    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    natGatewayStrategy: "regional",  // Single NAT for all AZs (cost-optimized)
    availabilityZoneCount: 3,

    subnets: {
        "public": {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: 3
        },
        "private": {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: 3
        },
        "database": {
            type: "private",
            subnetPrefix: 26,  // /26 = 64 IPs per subnet
            availabilityZones: 3
        }
    }
});
```

### CIDR Calculation Logic

When using `baseSubnet`, the component automatically calculates non-overlapping CIDR blocks for each subnet:

**Example with base subnet `10.0.0.0/16`:**

- `public-0`: `10.0.0.0/24` (256 IPs: 10.0.0.1 - 10.0.0.254)
- `public-1`: `10.0.1.0/24` (256 IPs: 10.0.1.1 - 10.0.1.254)
- `public-2`: `10.0.2.0/24` (256 IPs: 10.0.2.1 - 10.0.2.254)
- `private-0`: `10.0.3.0/24` (256 IPs: 10.0.3.1 - 10.0.3.254)
- `private-1`: `10.0.4.0/24` (256 IPs: 10.0.4.1 - 10.0.4.254)
- `private-2`: `10.0.5.0/24` (256 IPs: 10.0.5.1 - 10.0.5.254)
- `database-0`: `10.0.6.0/26` (64 IPs: 10.0.6.1 - 10.0.6.62)
- `database-1`: `10.0.6.64/26` (64 IPs: 10.0.6.65 - 10.0.6.126)
- `database-2`: `10.0.6.128/26` (64 IPs: 10.0.6.129 - 10.0.6.190)

### Alternative Configuration Methods

#### Manual CIDR Block
```typescript
const vpc = new VPCComponent("my-vpc", {
    region: "us-west-2",
    cidrBlock: "172.16.0.0/16",
    // ... other configuration
});
```

#### IPAM-based Allocation
```typescript
const vpc = new VPCComponent("my-vpc", {
    region: "us-west-2", 
    ipamPoolArn: "arn:aws:ec2::123456789012:ipam-pool/ipam-pool-12345",
    // ... other configuration
});
```

## Configuration Options

### VPCComponentArgs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | string | Yes | AWS region for VPC deployment |
| `baseSubnet` | string | No* | Base subnet CIDR for automatic calculation (e.g., "10.0.0.0/16") |
| `cidrBlock` | string | No* | Manual CIDR block for VPC |
| `ipamPoolArn` | string | No* | IPAM pool ARN for automatic CIDR allocation |
| `internetGatewayEnabled` | boolean | Yes | Enable Internet Gateway |
| `natGatewayEnabled` | boolean | Yes | Enable NAT Gateway |
| `natGatewayStrategy` | string | No | NAT Gateway strategy: "zonal" (one per AZ, HA) or "regional" (single NAT, cost-optimized). Default: "zonal" |
| `availabilityZoneCount` | number | Yes | Number of AZs to use (1-6) |
| `subnets` | object | Yes | Subnet specifications |
| `transitGatewayArn` | string | No | Transit Gateway ARN for attachment |

*One of `baseSubnet`, `cidrBlock`, or `ipamPoolArn` must be provided.

### SubnetSpec

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Subnet type: "public", "private", or "transit-gateway" |
| `subnetPrefix` | number | Yes* | Subnet prefix length (8-30, e.g., 24 for /24) |
| `cidrPrefix` | number | No | Legacy: Number of host bits (deprecated) |
| `availabilityZones` | string[] | Yes | List of AZ suffixes (e.g., ["a", "b", "c"]) |

*Either `subnetPrefix` or `cidrPrefix` must be provided.

## Outputs

The component provides the following outputs:

- `vpcId` - VPC ID
- `vpcArn` - VPC ARN  
- `cidrBlock` - VPC CIDR block
- `subnetIds` - All subnet IDs
- `subnetsByType` - Subnet IDs grouped by type
- `routeTableIds` - Route table IDs
- `internetGatewayId` - Internet Gateway ID (if enabled)
- `natGatewayIds` - NAT Gateway IDs (if enabled)
- `transitGatewayAttachmentId` - Transit Gateway attachment ID (if configured)

### Helper Methods

```typescript
// Get subnet IDs by type
const publicSubnets = vpc.getSubnetIdsByType("public");
const privateSubnets = vpc.getSubnetIdsByType("private");

// Get specific subnet by name and AZ index
const firstPublicSubnet = vpc.getSubnetId("public", 0);

// Get all subnets for a specific name
const allDatabaseSubnets = vpc.getSubnetIdsByName("database");
```

## Validation

The component performs comprehensive validation:

- Ensures only one of `baseSubnet`, `cidrBlock`, or `ipamPoolArn` is specified
- Validates subnet prefix ranges (8-30 for `subnetPrefix`)
- Checks availability zone count limits (1-6)
- Verifies subnet specifications are complete
- Ensures subnet prefixes are larger than VPC prefix

## Migration from Legacy Configuration

If you're using the legacy `cidrPrefix` field, you can migrate to the new `subnetPrefix` approach:

**Legacy (deprecated):**
```typescript
subnets: {
    "public": {
        type: "public",
        cidrPrefix: 8,  // Adds 8 bits to VPC prefix
        availabilityZones: ["a", "b", "c"]
    }
}
```

**New (recommended):**
```typescript
subnets: {
    "public": {
        type: "public", 
        subnetPrefix: 24,  // Absolute prefix length
        availabilityZones: ["a", "b", "c"]
    }
}
```

The component maintains backward compatibility with the legacy `cidrPrefix` field.