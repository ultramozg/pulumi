# IPAM Custom Configuration

## Overview

The IPAM component now supports flexible configuration for CIDR blocks, operating regions, and netmask sizes.

## Configuration Parameters

### In deployment-config.json

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

### Parameters Explained

- **ipamCidrBlocks**: Array of top-level CIDR blocks for IPAM (e.g., `["10.0.0.0/8"]`)
- **ipamOperatingRegions**: Array of AWS regions where IPAM will operate (e.g., `["us-east-1", "us-west-2", "eu-west-1"]`)
- **ipamRegionalPoolNetmask**: Netmask length for regional pool allocations (default: 12)
  - With `/8` parent and `/12` regional: Each region gets ~16 `/12` blocks
  - Example: us-east-1 gets `10.0.0.0/12`, us-west-2 gets `10.16.0.0/12`
- **ipamVpcAllocationNetmask**: Default netmask for VPC allocations (default: 16)
  - Each VPC will get a `/16` by default from its regional pool

## Examples

### Three-Region Deployment

```json
{
  "ipamCidrBlocks": ["10.0.0.0/8"],
  "ipamOperatingRegions": ["us-east-1", "us-west-2", "eu-west-1"],
  "ipamRegionalPoolNetmask": 12,
  "ipamVpcAllocationNetmask": 16
}
```

Result:
- us-east-1: `10.0.0.0/12` (4,096 /16 VPCs)
- us-west-2: `10.16.0.0/12` (4,096 /16 VPCs)
- eu-west-1: `10.32.0.0/12` (4,096 /16 VPCs)

### Smaller Regional Pools

```json
{
  "ipamCidrBlocks": ["10.0.0.0/8"],
  "ipamOperatingRegions": ["us-east-1", "us-west-2"],
  "ipamRegionalPoolNetmask": 10,
  "ipamVpcAllocationNetmask": 16
}
```

Result:
- us-east-1: `10.0.0.0/10` (16,384 /16 VPCs)
- us-west-2: `10.64.0.0/10` (16,384 /16 VPCs)

### Larger VPC Allocations

```json
{
  "ipamCidrBlocks": ["10.0.0.0/8"],
  "ipamOperatingRegions": ["us-east-1", "us-west-2"],
  "ipamRegionalPoolNetmask": 12,
  "ipamVpcAllocationNetmask": 14
}
```

Result:
- Each VPC gets a `/14` by default (4x larger than `/16`)
- Each regional `/12` pool can support ~1,024 /14 VPCs

## CIDR Planning Guide

| Parent | Regional | VPC Size | VPCs per Region |
|--------|----------|----------|-----------------|
| /8     | /12      | /16      | 4,096           |
| /8     | /12      | /14      | 1,024           |
| /8     | /10      | /16      | 16,384          |
| /10    | /14      | /16      | 1,024           |

## Direct Pulumi Config (Alternative)

You can also set these via Pulumi config:

```bash
pulumi config set shared-services:ipamCidrBlocks '["10.0.0.0/8"]' --stack shared-services-primary
pulumi config set shared-services:ipamOperatingRegions '["us-east-1","us-west-2"]' --stack shared-services-primary
pulumi config set shared-services:ipamRegionalPoolNetmask 12 --stack shared-services-primary
pulumi config set shared-services:ipamVpcAllocationNetmask 16 --stack shared-services-primary
```
