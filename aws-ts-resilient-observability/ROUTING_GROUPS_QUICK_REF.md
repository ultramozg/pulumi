# Routing Groups Quick Reference

## TL;DR

Routing groups = network segmentation for enterprise security. Each environment gets its own route table, preventing unauthorized cross-environment access. **Hub is automatic** - all groups can access it by default.

## Quick Start

### 1. Enable Routing Groups

```typescript
const tgw = new TransitGateway("my-tgw", {
    enableRouteTableIsolation: true,
    routingGroups: {
        // Note: 'hub' is automatically created - don't define it!
        
        production: {
            allowedGroups: []  // Only hub access
        },
        development: {
            allowedGroups: ["test"]  // Hub + test
        },
        test: {
            allowedGroups: ["development"]  // Hub + dev
        }
    }
});
```

### 2. Attach VPCs

```typescript
tgw.attachVpc("prod-vpc-attachment", {
    vpcId: productionVpc.vpcId,
    subnetIds: productionVpc.getSubnetIdsByType("private"),
    routingGroup: "production"
});
```

## Common Patterns

### Pattern: Isolated Production
```typescript
production: {
    allowedGroups: []  // ✅ Hub access (automatic), ❌ No other groups
}
```

### Pattern: Collaborative Dev/Test
```typescript
development: {
    allowedGroups: ["test", "staging"]  // ✅ Hub + test + staging
}
```

### Pattern: Hub VPC
```typescript
// Hub is automatic - just attach your VPC to "hub" routing group
tgw.attachVpc("hub-attachment", {
    vpcId: hubVpc.vpcId,
    subnetIds: hubVpc.getSubnetIdsByType("private"),
    routingGroup: "hub"  // Use the automatic hub group
});
```

### Pattern: DMZ (Public-Facing)
```typescript
dmz: {
    allowedGroups: []  // ✅ Only hub for logging, ❌ Isolated from everything else
}
```

## Communication Matrix

```
              Hub    Prod    Dev    Test
Hub           ✓      ✓       ✓      ✓
Production    ✓      ✓       ✗      ✗
Development   ✓      ✗       ✓      ✓
Test          ✓      ✗       ✓      ✓
```

## Key Properties

| Property | Description | Example |
|----------|-------------|---------|
| **Map Key** | Routing group name | `production:` |
| `allowedGroups` | Which groups can be reached (hub is automatic) | `["test", "staging"]` |
| `description` | Human-readable description | `"Production workloads"` |
| `tags` | AWS tags | `{ Environment: "prod" }` |

**Note**: Hub access is automatic for all groups - no need to specify it!

## Troubleshooting

### Can't reach hub?
- Check: `allowHubAccess: true`
- Check: Hub VPC attached to "hub" routing group
- Check: Security groups allow traffic

### Can't reach another group?
- Check: Both groups list each other in `allowedGroups`
- Check: Route propagation is bidirectional
- Check: Security groups allow traffic

### Routes not showing up?
- Check: `enableRouteTableIsolation: true`
- Check: VPC attached with correct `routingGroup`
- Check: Transit Gateway attachment is "available"

## Security Benefits

✅ **Network isolation** - Prod can't be accessed from dev/test  
✅ **Compliance** - Meets PCI-DSS, HIPAA, SOC 2 requirements  
✅ **Defense in depth** - Multiple security layers  
✅ **Least privilege** - Only necessary communication allowed  
✅ **Audit trail** - Clear network communication paths  

## Cost

**$0 additional cost** - Route tables are included with Transit Gateway

## Migration Path

1. **Enable isolation** (no impact yet)
2. **Define routing groups**
3. **Migrate VPCs one by one**
4. **Validate connectivity**
5. **Monitor and adjust**

## Best Practices

1. ✅ Always use a hub VPC for shared services
2. ✅ Start with strict isolation, add access as needed
3. ✅ Document your communication matrix
4. ✅ Use descriptive routing group names
5. ✅ Tag everything for visibility
6. ✅ Monitor route table changes
7. ✅ Still use security groups (defense in depth)

## Example: Complete Setup

```typescript
// 1. Create Transit Gateway with routing groups
const tgw = new TransitGateway("enterprise-tgw", {
    enableRouteTableIsolation: true,
    routingGroups: {
        // Hub is automatic - don't define it here!
        production: { allowedGroups: [] },
        development: { allowedGroups: ["test"] },
        test: { allowedGroups: ["development"] }
    }
});

// 2. Create VPCs
const hubVpc = new VPCComponent("hub-vpc", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    // ... other config
});

const prodVpc = new VPCComponent("prod-vpc", {
    region: "us-east-1",
    cidrBlock: "10.1.0.0/16",
    // ... other config
});

// 3. Attach VPCs to routing groups
tgw.attachVpc("hub-attachment", {
    vpcId: hubVpc.vpcId,
    subnetIds: hubVpc.getSubnetIdsByType("private"),
    routingGroup: "hub"  // Use automatic hub group
});

tgw.attachVpc("prod-attachment", {
    vpcId: prodVpc.vpcId,
    subnetIds: prodVpc.getSubnetIdsByType("private"),
    routingGroup: "production"
});

// Done! Production is now isolated from dev/test but can access hub
```

## When to Use

✅ **Use routing groups when:**
- You have multiple environments (prod, dev, test)
- You need compliance (PCI-DSS, HIPAA, SOC 2)
- You want defense in depth
- You need to prevent lateral movement
- You have shared services (monitoring, logging)

❌ **Don't use routing groups when:**
- You have a single environment
- All VPCs need full mesh connectivity
- You're just testing/learning (use default route table)

## Resources

- Full Guide: `ROUTING_GROUPS_GUIDE.md`
- Architecture Diagrams: `diagrams/routing-groups-architecture.md`
- Example Code: `examples/routing-groups-example.ts`
- Component Code: `components/aws/transit-gateway/index.ts`
