# Routing Groups Deployment Guide

This guide explains how to deploy the infrastructure with routing groups enabled for enterprise-grade network segmentation.

## Overview

The shared-services and workloads stacks support routing groups for Transit Gateway route table isolation. This provides network-level segmentation between different environments while maintaining controlled access to shared services.

All configuration is managed through `deployment-config.json` and the automation CLI.

## Quick Start

### 1. Configure Routing Groups

Edit `deployment-config.json` to enable routing groups:

```json
{
  "networkSegmentation": {
    "enableRouteTableIsolation": true,
    "routingGroups": {
      "production": {
        "description": "Production workloads - isolated from non-prod",
        "allowedGroups": [],
        "tags": {
          "Environment": "Production",
          "Criticality": "Critical"
        }
      },
      "development": {
        "description": "Development workloads - can communicate with test",
        "allowedGroups": ["test"],
        "tags": {
          "Environment": "Development"
        }
      },
      "test": {
        "description": "Test workloads - can communicate with dev",
        "allowedGroups": ["development"],
        "tags": {
          "Environment": "Test"
        }
      }
    }
  }
}
```

### 2. Assign Workloads to Routing Groups

In the same `deployment-config.json`, assign workload VPCs to routing groups:

```json
{
  "stacks": [
    {
      "name": "workloads-primary",
      "components": [
        {
          "type": "spoke-vpc",
          "config": {
            "cidrBlock": "10.1.0.0/16",
            "routingGroup": "production"
          }
        }
      ]
    }
  ]
}
```

### 3. Deploy

```bash
# Deploy all stacks
npm run deploy

# Or deploy specific stacks
npm run automation deploy -- --stack shared-services-primary
npm run automation deploy -- --stack workloads-primary
```

## Configuration Structure

All routing groups are configured in `deployment-config.json`:

### Network Segmentation Section

```json
{
  "networkSegmentation": {
    "enableRouteTableIsolation": true,
    "routingGroups": {
      "group-name": {
        "description": "Human-readable description",
        "allowedGroups": ["other-group"],
        "tags": { "key": "value" }
      }
    }
  }
}
```

**Properties**:
- `enableRouteTableIsolation`: Enable/disable routing groups (default: `false`)
- `routingGroups`: Map of routing group configurations

**Routing Group Properties**:
- `allowedGroups`: List of other routing groups this group can communicate with (hub is automatic)
- `description`: Human-readable description (optional)
- `tags`: AWS tags for the route table (optional)

### Component Configuration

Transit Gateway components reference the network segmentation:

```json
{
  "type": "transit-gateway",
  "config": {
    "enableRouteTableIsolation": "${networkSegmentation.enableRouteTableIsolation}",
    "routingGroups": "${networkSegmentation.routingGroups}"
  }
}
```

Workload VPCs are assigned to routing groups:

```json
{
  "type": "spoke-vpc",
  "config": {
    "routingGroup": "production"
  }
}
```

## Deployment Scenarios

### Scenario 1: Disable Routing Groups (Flat Network)

**Use Case**: Development/testing, simple deployments

**Configuration**:
```json
{
  "networkSegmentation": {
    "enableRouteTableIsolation": false
  }
}
```

**Result**: All VPCs can communicate with each other through the default Transit Gateway route table.

### Scenario 2: Production Isolation

**Use Case**: Isolate production from non-production environments

**Configuration**:
```json
{
  "networkSegmentation": {
    "enableRouteTableIsolation": true,
    "routingGroups": {
      "production": { "allowedGroups": [] },
      "non-production": { "allowedGroups": [] }
    }
  },
  "stacks": [
    {
      "name": "workloads-production",
      "components": [
        { "type": "spoke-vpc", "config": { "routingGroup": "production" } }
      ]
    },
    {
      "name": "workloads-dev",
      "components": [
        { "type": "spoke-vpc", "config": { "routingGroup": "non-production" } }
      ]
    }
  ]
}
```

**Result**:
- Production VPC: Can access hub only
- Non-production VPC: Can access hub only
- Production and non-production cannot communicate

### Scenario 3: Dev/Test Collaboration

**Use Case**: Allow development and test environments to collaborate

**Configuration**:
```json
{
  "networkSegmentation": {
    "enableRouteTableIsolation": true,
    "routingGroups": {
      "production": { "allowedGroups": [] },
      "development": { "allowedGroups": ["test"] },
      "test": { "allowedGroups": ["development"] }
    }
  }
}
```

**Result**:
- Production: Isolated (hub only)
- Development: Can access hub + test
- Test: Can access hub + development

### Scenario 4: Staging with Production Access

**Use Case**: Staging environment needs to test against production data

**Configuration**:
```json
{
  "networkSegmentation": {
    "enableRouteTableIsolation": true,
    "routingGroups": {
      "production": { "allowedGroups": [] },
      "staging": { "allowedGroups": ["production"] },
      "development": { "allowedGroups": ["test"] },
      "test": { "allowedGroups": ["development"] }
    }
  }
}
```

**Result**:
- Staging can access production (for read-only testing)
- Production cannot initiate connections to staging
- Dev/test remain isolated from production

### Scenario 5: DMZ for Public Services

**Use Case**: Public-facing services isolated from internal networks

**Configuration**:
```json
{
  "networkSegmentation": {
    "enableRouteTableIsolation": true,
    "routingGroups": {
      "production": { "allowedGroups": [] },
      "dmz": {
        "allowedGroups": [],
        "tags": { "Purpose": "PublicFacing" }
      }
    }
  }
}
```

**Result**:
- DMZ: Can only access hub (for logging/monitoring)
- DMZ: Cannot access production or other internal networks
- Production: Cannot access DMZ

## Multi-Region Deployment

The `networkSegmentation` configuration in `deployment-config.json` applies to all regions automatically. The automation CLI ensures consistent routing groups across regions.

**Example**:
```json
{
  "networkSegmentation": {
    "enableRouteTableIsolation": true,
    "routingGroups": {
      "production": { "allowedGroups": [] }
    }
  },
  "stacks": [
    {
      "name": "shared-services-primary",
      "components": [
        {
          "type": "transit-gateway",
          "config": {
            "region": "us-east-1",
            "enableRouteTableIsolation": "${networkSegmentation.enableRouteTableIsolation}",
            "routingGroups": "${networkSegmentation.routingGroups}"
          }
        }
      ]
    },
    {
      "name": "shared-services-secondary",
      "components": [
        {
          "type": "transit-gateway",
          "config": {
            "region": "us-west-2",
            "enableRouteTableIsolation": "${networkSegmentation.enableRouteTableIsolation}",
            "routingGroups": "${networkSegmentation.routingGroups}"
          }
        }
      ]
    }
  ]
}
```

Both regions use the same routing group configuration automatically.

## Verification

### Check Transit Gateway Route Tables

```bash
# List route tables
aws ec2 describe-transit-gateway-route-tables \
  --filters "Name=transit-gateway-id,Values=<tgw-id>"

# Check routes in a specific route table
aws ec2 search-transit-gateway-routes \
  --transit-gateway-route-table-id <rt-id> \
  --filters "Name=state,Values=active"
```

### Check VPC Attachments

```bash
# List attachments
aws ec2 describe-transit-gateway-vpc-attachments \
  --filters "Name=transit-gateway-id,Values=<tgw-id>"

# Check route table association
aws ec2 get-transit-gateway-attachment-propagations \
  --transit-gateway-attachment-id <attachment-id>
```

### Test Connectivity

From a workload VPC instance:

```bash
# Should work: Hub VPC
ping <hub-vpc-private-ip>

# Should work: Allowed routing groups
ping <allowed-group-vpc-private-ip>

# Should fail: Blocked routing groups
ping <blocked-group-vpc-private-ip>  # Should timeout
```

## Troubleshooting

### Issue: VPC Can't Reach Hub

**Symptoms**: Workload VPC cannot access shared services in hub

**Checks**:
1. Verify routing groups are enabled:
   ```bash
   pulumi stack output transitGatewayIsolationEnabled
   ```

2. Check hub VPC attachment:
   ```bash
   pulumi stack output hubVpcAttachmentId
   ```

3. Verify security groups allow traffic from workload VPC CIDR

**Solution**: Ensure hub VPC is attached to "hub" routing group

### Issue: Workloads Can't Communicate

**Symptoms**: Two workload VPCs in different routing groups can't communicate

**Checks**:
1. Verify both groups list each other in `allowedGroups`
2. Check route table associations
3. Verify security groups allow traffic

**Solution**: Add mutual routing group access:
```yaml
development:
  allowedGroups: ["test"]
test:
  allowedGroups: ["development"]
```

### Issue: "hub is a reserved routing group name"

**Symptoms**: Error when deploying with hub in routingGroups

**Solution**: Remove hub from your routing groups configuration - it's automatic:
```yaml
# ❌ Wrong
routingGroups:
  hub:
    allowedGroups: []

# ✅ Correct
routingGroups:
  production:
    allowedGroups: []
```

### Issue: Routes Not Propagating

**Symptoms**: Routes don't appear in route tables

**Checks**:
1. Verify `enableRouteTableIsolation: true`
2. Check VPC attachment state (should be "available")
3. Verify routing group exists in configuration

**Solution**: Ensure VPC is attached with correct routing group:
```yaml
workloads:routingGroup: "production"  # Must match shared-services config
```

## Migration from Flat Network

### Step 1: Add Routing Groups Configuration

Add to `Pulumi.shared-services-primary.yaml`:
```yaml
shared-services:enableRouteTableIsolation: true
shared-services:routingGroups:
  production:
    allowedGroups: []
```

### Step 2: Deploy Shared Services

```bash
cd shared-services
pulumi up -s shared-services-primary
```

This creates the routing groups but doesn't affect existing VPCs yet.

### Step 3: Migrate Workloads One by One

For each workload stack:

1. Add routing group assignment:
   ```yaml
   workloads:routingGroup: "production"
   ```

2. Deploy:
   ```bash
   pulumi up -s workloads-primary
   ```

3. Test connectivity

4. Move to next workload

### Step 4: Validate

- Test connectivity between all VPCs
- Verify blocked paths are actually blocked
- Monitor CloudWatch metrics for dropped packets

## Best Practices

### 1. Plan Your Routing Groups

Before deployment, document your routing groups and communication matrix:

```
                  Hub    Prod    Staging    Dev    Test
Hub               ✓      ✓       ✓          ✓      ✓
Production        ✓      ✓       ✓          ✗      ✗
Staging           ✓      ✓       ✓          ✗      ✗
Development       ✓      ✗       ✗          ✓      ✓
Test              ✓      ✗       ✗          ✓      ✓
```

### 2. Use Consistent Naming

Use the same routing group names across all regions and stacks:
- `production`
- `staging`
- `development`
- `test`
- `dmz`

### 3. Start Strict, Relax Later

Begin with no inter-group communication:
```yaml
production:
  allowedGroups: []
```

Add access only when needed:
```yaml
staging:
  allowedGroups: ["production"]
```

### 4. Tag Everything

```yaml
production:
  tags:
    Environment: "Production"
    Criticality: "Critical"
    Owner: "platform-team"
    CostCenter: "engineering"
```

### 5. Document Communication Paths

Maintain a document showing which groups can communicate and why.

### 6. Monitor Route Tables

Set up CloudWatch alarms for:
- Route table changes
- Attachment state changes
- Unexpected route additions

### 7. Test Isolation

Regularly test that blocked paths are actually blocked:
```bash
# Should timeout
timeout 5 ping <blocked-vpc-ip> || echo "Correctly blocked"
```

## Security Considerations

### Defense in Depth

Routing groups provide network-level isolation, but still implement:

1. **Security Groups**: Allow only necessary ports and sources
2. **NACLs**: Additional subnet-level filtering
3. **IAM Policies**: Restrict API access
4. **Encryption**: TLS for data in transit

### Compliance

Routing groups help meet compliance requirements:

- **PCI-DSS 1.2.1**: Network segmentation
- **HIPAA 164.312(a)(1)**: Access controls
- **SOC 2 CC6.6**: Logical access controls
- **NIST 800-53 SC-7**: Boundary protection

### Audit Trail

All routing changes are logged in CloudTrail:
- Route table creation
- Route propagation changes
- Attachment associations

## Cost Impact

Routing groups have **no additional cost**:

- Route tables: Included with Transit Gateway
- Attachments: Same cost ($0.05/hour)
- Data transfer: Same cost ($0.02/GB)

**Network segmentation without additional cost!**

## Summary

Routing groups provide:
- ✅ Enterprise-grade network segmentation
- ✅ Automatic hub access for shared services
- ✅ Flexible communication policies
- ✅ Easy configuration via `deployment-config.json`
- ✅ Multi-region support
- ✅ No additional cost
- ✅ Compliance-ready architecture

All configuration is managed through `deployment-config.json` and the automation CLI - no manual Pulumi YAML files needed!

For more information, see:
- `ROUTING_GROUPS_GUIDE.md` - Comprehensive guide
- `ROUTING_GROUPS_QUICK_REF.md` - Quick reference
- `examples/routing-groups-example.ts` - Code examples
