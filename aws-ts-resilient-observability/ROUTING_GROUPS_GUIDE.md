# Transit Gateway Routing Groups Guide

## Overview

This guide explains how to implement enterprise-grade network segmentation using Transit Gateway routing groups. This architecture provides isolation between different environments while allowing controlled communication with shared services.

## Architecture Principles

### Traditional Approach (Not Recommended for Enterprise)
```
All VPCs → Single TGW Route Table → All VPCs can talk to each other
```
**Problem**: No isolation between environments. A compromised dev environment can access production.

### Routing Groups Approach (Enterprise-Ready)
```
Production VPC → Production Route Table → Only Hub VPC
Development VPC → Development Route Table → Hub VPC + Test VPC
Test VPC → Test Route Table → Hub VPC + Development VPC
Hub VPC → Hub Route Table → All VPCs (for monitoring/logging)
```
**Benefit**: Complete isolation with controlled communication paths.

## Key Concepts

### 1. Routing Groups
A routing group is a logical collection of VPCs that share the same routing policy. Each group has:
- **Dedicated Route Table**: Isolated routing domain
- **Implicit Hub Access**: All groups can automatically access the hub VPC
- **Peer Group Access**: Define which other groups can be reached

### 2. Hub VPC (Automatic)
The hub VPC is **automatically created** and accessible by all routing groups. You don't need to explicitly configure it. The hub contains shared services:
- Monitoring and observability (Grafana, Prometheus)
- Centralized logging (Loki, CloudWatch)
- DNS resolution
- Security services (vulnerability scanning, SIEM)
- Shared databases or caches

### 3. Route Table Isolation
When `enableRouteTableIsolation: true`:
- Each routing group gets its own Transit Gateway route table
- Hub routing group is automatically created
- VPCs only learn routes based on their group's policy
- Default route table association/propagation is disabled
- Manual route propagation based on security rules

## Configuration

### Basic Setup

```typescript
import { TransitGateway } from "./components/aws/transit-gateway";

const tgw = new TransitGateway("enterprise-tgw", {
    amazonSideAsn: 64512,
    enableRouteTableIsolation: true,
    routingGroups: {
        // Note: 'hub' is automatically created and accessible by all groups
        
        production: {
            description: "Production workloads",
            allowedGroups: []  // Only hub access (implicit)
        },
        development: {
            description: "Development workloads",
            allowedGroups: ["test"]  // Hub + test access
        },
        test: {
            description: "Test workloads",
            allowedGroups: ["development"]  // Hub + dev access
        }
    }
});
```

### Attaching VPCs

```typescript
// Attach hub VPC to hub routing group
const hubAttachment = tgw.attachVpc("hub-vpc-attachment", {
    vpcId: hubVpc.vpcId,
    subnetIds: hubVpc.getSubnetIdsByType("private"),
    routingGroup: "hub",
    tags: { Purpose: "SharedServices" }
});

// Attach production VPC to production routing group
const prodAttachment = tgw.attachVpc("prod-vpc-attachment", {
    vpcId: productionVpc.vpcId,
    subnetIds: productionVpc.getSubnetIdsByType("private"),
    routingGroup: "production",
    tags: { Environment: "Production" }
});

// Attach dev VPC to development routing group
const devAttachment = tgw.attachVpc("dev-vpc-attachment", {
    vpcId: developmentVpc.vpcId,
    subnetIds: developmentVpc.getSubnetIdsByType("private"),
    routingGroup: "development",
    tags: { Environment: "Development" }
});
```

## Common Routing Patterns

### Pattern 1: Complete Isolation (Production)
```typescript
production: {
    allowedGroups: []  // Only hub access
}
```
**Use Case**: Production workloads that must be completely isolated from non-production environments.

### Pattern 2: Controlled Collaboration (Dev/Test)
```typescript
development: {
    allowedGroups: ["test", "staging"]  // Hub + test + staging
}
```
**Use Case**: Development environments that need to collaborate with test/staging but not production.

### Pattern 3: DMZ/Public-Facing
```typescript
dmz: {
    allowedGroups: []  // Only hub access
}
```
**Use Case**: Public-facing services that should only access hub for logging/monitoring.

## Communication Matrix Example

For a typical enterprise setup:

```
                  Hub    Prod    Dev    Test    DMZ
Hub               ✓      ✓       ✓      ✓       ✓
Production        ✓      ✓       ✗      ✗       ✗
Development       ✓      ✗       ✓      ✓       ✗
Test              ✓      ✗       ✓      ✓       ✗
DMZ               ✓      ✗       ✗      ✗       ✓
```

**Legend:**
- ✓ = Can communicate
- ✗ = Cannot communicate (network-level isolation)

## Security Benefits

### 1. Defense in Depth
- Network-level isolation prevents lateral movement
- Even if security groups are misconfigured, routing prevents access
- Reduces blast radius of security incidents

### 2. Compliance
- Meets regulatory requirements for environment separation
- Clear audit trail of network communication paths
- Supports PCI-DSS, HIPAA, SOC 2 requirements

### 3. Least Privilege
- Each environment only has access to what it needs
- Hub access is automatic for shared services
- Fine-grained control over inter-environment communication

### 4. Operational Safety
- Prevents accidental production access from dev/test
- Reduces risk of data leakage between environments
- Clear boundaries for troubleshooting

## Migration from Flat Network

### Step 1: Enable Isolation (No Impact)
```typescript
enableRouteTableIsolation: true
```
This creates separate route tables but doesn't change routing yet.

### Step 2: Define Routing Groups
```typescript
routingGroups: {
    production: { allowedGroups: [] },
    development: { allowedGroups: ["test"] },
    test: { allowedGroups: ["development"] }
}
```

### Step 3: Migrate VPCs Gradually
Move VPCs one at a time to their routing groups:
```typescript
// Before: VPC uses default route table
// After: VPC uses routing group table
tgw.attachVpc("vpc-attachment", {
    vpcId: vpc.vpcId,
    subnetIds: vpc.getSubnetIdsByType("private"),
    routingGroup: "production"  // Assigns to routing group
});
```

### Step 4: Validate and Monitor
- Test connectivity between environments
- Monitor CloudWatch metrics for dropped packets
- Validate security group rules still work

## Troubleshooting

### Issue: VPC Can't Reach Hub
**Check:**
1. Hub VPC is attached to "hub" routing group
2. Security groups allow traffic
3. Route propagation is configured
4. Transit Gateway attachment is in "available" state

### Issue: Two VPCs Can't Communicate
**Check:**
1. Both groups list each other in `allowedGroups`
2. Both VPCs are attached to correct routing groups
3. Route propagation is bidirectional
4. Security groups and NACLs allow traffic

### Issue: Routes Not Propagating
**Check:**
1. `enableRouteTableIsolation: true` is set
2. VPC attachment specifies correct `routingGroup`
3. Route table associations are created
4. Transit Gateway attachment is in "available" state

### Issue: "hub is a reserved routing group name"
**Solution:** Don't include "hub" in your `routingGroups` map. It's automatically created.

## Best Practices

### 1. Hub is Automatic
Don't define "hub" in your routing groups - it's created automatically and accessible by all.

### 2. Use Map-Based Configuration
```typescript
// Good - Clean and readable
routingGroups: {
    production: { allowedGroups: [] },
    development: { allowedGroups: ["test"] }
}

// Bad - Old array-based approach (deprecated)
routingGroups: [
    { name: "production", ... }
]
```

### 3. Start with Strict Isolation
Begin with no inter-group communication, then add as needed:
```typescript
allowedGroups: []  // Start here
allowedGroups: ["test"]  // Add only what's necessary
```

### 4. Use Descriptive Names
```typescript
// Good
{
    "production-workloads": { ... },
    "development-sandbox": { ... }
}

// Bad
{
    "group1": { ... },
    "vpc-group": { ... }
}
```

### 5. Tag Everything
```typescript
production: {
    tags: {
        Environment: "Production",
        Criticality: "High",
        Owner: "platform-team"
    }
}
```

### 6. Monitor Route Tables
Set up CloudWatch alarms for:
- Unexpected route additions
- Route table association changes
- Transit Gateway attachment state changes

### 7. Implement Security Groups
Routing groups provide network-level isolation, but still use security groups for defense in depth:
```typescript
// Even though routing prevents access, add security group rules
const prodSG = new aws.ec2.SecurityGroup("prod-sg", {
    vpcId: productionVpc.vpcId,
    ingress: [
        {
            fromPort: 443,
            toPort: 443,
            protocol: "tcp",
            cidrBlocks: ["10.0.0.0/16"]  // Only hub VPC
        }
    ]
});
```

## Advanced: Multi-Region Routing Groups

For multi-region deployments, maintain consistent routing groups across regions:

```typescript
// us-east-1
const tgwEast = new TransitGateway("tgw-east", {
    enableRouteTableIsolation: true,
    routingGroups: {
        production: { allowedGroups: [] },
        development: { allowedGroups: ["test"] }
    }
});

// us-west-2
const tgwWest = new TransitGateway("tgw-west", {
    enableRouteTableIsolation: true,
    routingGroups: {
        production: { allowedGroups: [] },
        development: { allowedGroups: ["test"] }
    }
});

// Peer the transit gateways
const peering = tgwWest.createPeering("cross-region-peering", {
    peerTransitGatewayId: tgwEast.transitGateway.id,
    peerRegion: "us-east-1",
    currentRegion: "us-west-2"
});
```

## Cost Considerations

- **Route Tables**: No additional cost (included with Transit Gateway)
- **Attachments**: $0.05/hour per attachment (same as before)
- **Data Transfer**: $0.02/GB (same as before)

**Routing groups add security without additional cost.**

## Compliance Mapping

| Requirement | How Routing Groups Help |
|------------|------------------------|
| PCI-DSS 1.2.1 | Network segmentation between cardholder data environment and other networks |
| HIPAA 164.312(a)(1) | Technical safeguards to prevent unauthorized access to ePHI |
| SOC 2 CC6.6 | Logical access controls to restrict access to information assets |
| NIST 800-53 SC-7 | Boundary protection through network segmentation |

## Summary

Routing groups provide enterprise-grade network segmentation with:
- ✅ Complete isolation between environments
- ✅ Automatic hub access for shared services
- ✅ Map-based configuration for readability
- ✅ Fine-grained communication policies
- ✅ Defense in depth security
- ✅ Compliance-ready architecture
- ✅ No additional cost

This is the recommended approach for any production deployment requiring environment isolation.
