# Cross-Region Routing Guide

## Overview

This guide explains how cross-region routing works in the multi-region Transit Gateway architecture and how to verify that traffic can flow between regions.

## Architecture

### What Gets Created

When you deploy both primary and secondary region stacks, the following cross-region connectivity is automatically established:

```
┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────┐
│ us-east-1 (Primary)                     │       │ us-west-2 (Secondary)                   │
│                                         │       │                                         │
│  Hub VPC (10.0.0.0/16)                  │       │  Hub VPC (10.2.0.0/16)                  │
│  Production VPC (10.1.0.0/16)           │       │  Production VPC (10.3.0.0/16)           │
│                                         │       │                                         │
│  TGW (ASN: 64512)                       │◄──────┤  TGW (ASN: 64513)                       │
│  ├─ RT: Hub                             │Peering│  ├─ RT: Hub                             │
│  │  ├─ 10.0.0.0/16 (local hub)          │   +   │  │  ├─ 10.2.0.0/16 (local hub)          │
│  │  └─ 10.2.0.0/16 (peer hub) ✓         │Routes │  │  └─ 10.0.0.0/16 (peer hub) ✓         │
│  └─ RT: Production                      │       │  └─ RT: Production                      │
│     ├─ 10.1.0.0/16 (local prod)         │       │     ├─ 10.3.0.0/16 (local prod)         │
│     ├─ 10.0.0.0/16 (local hub)          │       │     ├─ 10.2.0.0/16 (peer hub)           │
│     ├─ 10.2.0.0/16 (peer hub) ✓         │       │     ├─ 10.0.0.0/16 (peer hub) ✓         │
│     └─ 10.3.0.0/16 (peer prod) ✓        │       │     └─ 10.1.0.0/16 (peer prod) ✓        │
└─────────────────────────────────────────┘       └─────────────────────────────────────────┘
```

### How It Works

1. **TGW Peering**: The secondary region automatically creates a peering connection to the primary region's Transit Gateway

2. **Route Propagation**: Routes are automatically propagated across the peering connection for each routing group:
   - Hub VPCs in both regions can communicate
   - Production VPCs in both regions can communicate
   - Other routing groups follow the same pattern

3. **Routing Group Isolation**: Cross-region traffic respects routing group isolation:
   - Production VPCs can only reach other production VPCs (and hub)
   - Development VPCs can only reach other development VPCs (and hub)
   - Hub is accessible by all routing groups in both regions

## Configuration Options

### Default Behavior (Enabled)

By default, cross-region route propagation is **enabled** for all routing groups:

```typescript
tgwPeering = transitGateway.createPeering(`tgw-${currentRegion}`, {
    peerTransitGatewayId: primaryTgwId,
    peerRegion: primaryRegion,
    currentRegion: currentRegion,
    // enableRoutePropagation: true is the default
});
```

### Selective Cross-Region Routing

To limit which routing groups have cross-region connectivity:

```typescript
tgwPeering = transitGateway.createPeering(`tgw-${currentRegion}`, {
    peerTransitGatewayId: primaryTgwId,
    peerRegion: primaryRegion,
    currentRegion: currentRegion,
    enableRoutePropagation: true,
    propagateToGroups: ['hub', 'production'], // Only these groups get cross-region routes
});
```

### Disable Cross-Region Routing

To create peering without route propagation (for later manual configuration):

```typescript
tgwPeering = transitGateway.createPeering(`tgw-${currentRegion}`, {
    peerTransitGatewayId: primaryTgwId,
    peerRegion: primaryRegion,
    currentRegion: currentRegion,
    enableRoutePropagation: false, // No automatic route propagation
});
```

## Verification

### 1. Check TGW Peering Status

Verify the peering connection is established and active:

```bash
# Check primary region TGW peering attachments
aws ec2 describe-transit-gateway-peering-attachments \
    --region us-east-1 \
    --filters "Name=state,Values=available" \
    --query 'TransitGatewayPeeringAttachments[*].[TransitGatewayAttachmentId,State,RequesterTgwInfo.Region,AccepterTgwInfo.Region]' \
    --output table

# Check secondary region TGW peering attachments
aws ec2 describe-transit-gateway-peering-attachments \
    --region us-west-2 \
    --filters "Name=state,Values=available" \
    --query 'TransitGatewayPeeringAttachments[*].[TransitGatewayAttachmentId,State,RequesterTgwInfo.Region,AccepterTgwInfo.Region]' \
    --output table
```

**Expected output**: State should be `available` for peering between us-east-1 and us-west-2

### 2. Check Route Table Associations

Get the Transit Gateway IDs:

```bash
# Get TGW IDs from Pulumi outputs
PRIMARY_TGW_ID=$(pulumi stack output transitGatewayId --stack shared-services-primary)
SECONDARY_TGW_ID=$(pulumi stack output transitGatewayId --stack shared-services-secondary)

echo "Primary TGW: $PRIMARY_TGW_ID"
echo "Secondary TGW: $SECONDARY_TGW_ID"
```

List route tables and their associations:

```bash
# Primary region route tables
aws ec2 describe-transit-gateway-route-tables \
    --region us-east-1 \
    --filters "Name=transit-gateway-id,Values=$PRIMARY_TGW_ID" \
    --query 'TransitGatewayRouteTables[*].[TransitGatewayRouteTableId,Tags[?Key==`Name`].Value|[0]]' \
    --output table

# Secondary region route tables
aws ec2 describe-transit-gateway-route-tables \
    --region us-west-2 \
    --filters "Name=transit-gateway-id,Values=$SECONDARY_TGW_ID" \
    --query 'TransitGatewayRouteTables[*].[TransitGatewayRouteTableId,Tags[?Key==`Name`].Value|[0]]' \
    --output table
```

### 3. Check Route Propagations

For each route table, check which attachments are propagating routes:

```bash
# Example: Check propagations for primary region's hub route table
HUB_RT_ID="<route-table-id-from-above>"

aws ec2 get-transit-gateway-route-table-propagations \
    --region us-east-1 \
    --transit-gateway-route-table-id $HUB_RT_ID \
    --query 'TransitGatewayRouteTablePropagations[*].[ResourceId,ResourceType,State,TransitGatewayAttachmentId]' \
    --output table
```

**Expected output**: You should see propagations for:
- Local VPC attachments
- Peering attachment (for cross-region routes)

### 4. Inspect Route Table Contents

View actual routes in each route table:

```bash
# Primary region hub route table
aws ec2 search-transit-gateway-routes \
    --region us-east-1 \
    --transit-gateway-route-table-id $HUB_RT_ID \
    --filters "Name=state,Values=active" \
    --query 'Routes[*].[DestinationCidrBlock,State,Type,TransitGatewayAttachments[0].ResourceId,TransitGatewayAttachments[0].ResourceType]' \
    --output table
```

**Expected output** for hub route table in us-east-1:
```
---------------------------------------------------------
|         SearchTransitGatewayRoutes                    |
+------------------+--------+-------------+-------------+
| 10.0.0.0/16      | active | propagated  | vpc-xxx     | vpc |
| 10.2.0.0/16      | active | propagated  | tgw-attach-xxx | peering |
---------------------------------------------------------
```

### 5. Test Cross-Region Connectivity

#### Option A: Using EC2 Instances

1. Launch test EC2 instances in each region:
   - One in us-east-1 hub VPC (e.g., 10.0.1.10)
   - One in us-west-2 hub VPC (e.g., 10.2.1.10)

2. From us-east-1 instance, ping us-west-2 instance:
   ```bash
   # From us-east-1 instance
   ping 10.2.1.10

   # Expected: Successful pings (cross-region latency ~50-100ms)
   ```

3. Test with other routing groups (production, etc.) following the same pattern

#### Option B: Using VPC Reachability Analyzer

```bash
# Create reachability analysis from us-east-1 to us-west-2
aws ec2 create-network-insights-path \
    --region us-east-1 \
    --source <eni-id-in-us-east-1> \
    --destination <eni-id-in-us-west-2> \
    --protocol tcp \
    --destination-port 443

# Start analysis
aws ec2 start-network-insights-analysis \
    --region us-east-1 \
    --network-insights-path-id <path-id-from-above>

# Check results (wait ~1 minute)
aws ec2 describe-network-insights-analyses \
    --region us-east-1 \
    --network-insights-analysis-ids <analysis-id> \
    --query 'NetworkInsightsAnalyses[0].[NetworkPathFound,Explanations[*].Direction]'
```

**Expected**: `NetworkPathFound: true`

### 6. Monitor Cross-Region Traffic

Use CloudWatch Metrics to monitor cross-region data transfer:

```bash
# Get TGW peering attachment ID
PEERING_ATTACHMENT_ID=$(aws ec2 describe-transit-gateway-peering-attachments \
    --region us-east-1 \
    --filters "Name=state,Values=available" \
    --query 'TransitGatewayPeeringAttachments[0].TransitGatewayAttachmentId' \
    --output text)

# Get bytes sent metric (last hour)
aws cloudwatch get-metric-statistics \
    --region us-east-1 \
    --namespace AWS/TransitGateway \
    --metric-name BytesSent \
    --dimensions Name=TransitGatewayAttachment,Value=$PEERING_ATTACHMENT_ID \
    --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
    --period 3600 \
    --statistics Sum \
    --output table
```

## Troubleshooting

### No Cross-Region Connectivity

**Issue**: Instances in one region cannot reach instances in the other region

**Checks**:

1. **Verify peering state**:
   ```bash
   aws ec2 describe-transit-gateway-peering-attachments \
       --region us-east-1 \
       --query 'TransitGatewayPeeringAttachments[*].[TransitGatewayAttachmentId,State]'
   ```
   State must be `available` (not `pending-acceptance` or `failed`)

2. **Check route propagation is configured**:
   ```bash
   # Check if peering attachment shows up in propagations
   aws ec2 get-transit-gateway-route-table-propagations \
       --region us-east-1 \
       --transit-gateway-route-table-id $HUB_RT_ID \
       | grep "tgw-attach"
   ```

3. **Verify routes exist**:
   ```bash
   # Search for peer region CIDR in route table
   aws ec2 search-transit-gateway-routes \
       --region us-east-1 \
       --transit-gateway-route-table-id $HUB_RT_ID \
       --filters "Name=state,Values=active"
   ```

4. **Check security groups and NACLs**:
   - Ensure security groups allow traffic from peer region CIDR blocks
   - Check Network ACLs are not blocking cross-region traffic

5. **Verify VPC route tables**:
   ```bash
   # Check VPC route table has routes pointing to TGW
   aws ec2 describe-route-tables \
       --region us-east-1 \
       --filters "Name=vpc-id,Values=<vpc-id>" \
       --query 'RouteTables[*].Routes[*].[DestinationCidrBlock,TransitGatewayId]'
   ```

### Partial Cross-Region Connectivity

**Issue**: Some routing groups work cross-region, others don't

**Solution**: Check `propagateToGroups` configuration in `shared-services/index.ts`:

```typescript
// Current configuration
tgwPeering = transitGateway.createPeering(`tgw-${currentRegion}`, {
    // ...
    propagateToGroups: ['hub', 'production'], // Only these groups
});

// To enable for all groups, remove this parameter or set to undefined
tgwPeering = transitGateway.createPeering(`tgw-${currentRegion}`, {
    // ...
    // propagateToGroups not specified = all groups
});
```

### High Latency Cross-Region

**Expected**: Cross-region latency between us-east-1 and us-west-2 is typically 60-80ms (speed of light limit)

If latency is higher:
1. Check for asymmetric routing (traffic taking different paths in each direction)
2. Verify TGW is not congested (check BytesSent/BytesReceived metrics)
3. Consider using AWS Global Accelerator for latency-sensitive workloads

## Cost Considerations

Cross-region data transfer has associated costs:

1. **TGW Peering**: $0.05 per attachment-hour per region
2. **Data Transfer**: $0.02 per GB transferred across regions (both directions)

**Cost Optimization**:
- Use `propagateToGroups` to limit which routing groups have cross-region access
- Place region-local services in the same region to avoid cross-region transfer
- Use VPC endpoints for AWS services to reduce data transfer costs

## Architecture Patterns

### Full Mesh (Default)

All routing groups in both regions can communicate:

```typescript
enableRoutePropagation: true
// propagateToGroups: undefined (all groups)
```

**Use Case**: Active-active deployment, full DR capability

### Hub-Only Cross-Region

Only hub VPCs communicate across regions:

```typescript
enableRoutePropagation: true,
propagateToGroups: ['hub']
```

**Use Case**: Centralized monitoring/logging, spoke VPCs stay regional

### Production-Only Cross-Region

Only production VPCs communicate across regions:

```typescript
enableRoutePropagation: true,
propagateToGroups: ['hub', 'production']
```

**Use Case**: Production needs DR, dev/test stays regional for cost savings

### No Cross-Region (Manual)

Disable automatic propagation:

```typescript
enableRoutePropagation: false
```

**Use Case**: Custom routing requirements, phased rollout

## Integration with Other Services

### Route 53 Health Checks

Combine cross-region routing with Route 53 health-based failover:

```typescript
// Route 53 health check monitors primary region endpoint
const healthCheck = new aws.route53.HealthCheck("primary-health", {
    ipAddress: primaryEndpointIp,
    port: 443,
    type: "HTTPS",
    resourcePath: "/health",
    failureThreshold: 3,
});

// Failover record points to secondary region if primary fails
const failoverRecord = new aws.route53.Record("service-failover", {
    zoneId: hostedZone.id,
    name: "service.example.com",
    type: "A",
    setIdentifier: "primary",
    failoverRoutingPolicies: [{
        type: "PRIMARY",
    }],
    healthCheckId: healthCheck.id,
    // ...
});
```

### Global Accelerator

For ultra-low latency and automatic failover:

```typescript
const accelerator = new aws.globalaccelerator.Accelerator("global", {
    enabled: true,
    ipAddressType: "IPV4",
});

// Add endpoints in both regions
const listener = new aws.globalaccelerator.Listener("listener", {
    acceleratorArn: accelerator.id,
    protocol: "TCP",
    portRanges: [{ fromPort: 443, toPort: 443 }],
});
```

## Summary

Cross-region routing is automatically enabled when you deploy both primary and secondary region stacks. The Transit Gateway component handles all the complexity of route propagation, ensuring that:

- ✅ VPCs in matching routing groups can communicate across regions
- ✅ Routing group isolation is maintained across regions
- ✅ Hub VPC is accessible from all groups in both regions
- ✅ Routes are automatically updated as VPCs are added or removed

For most use cases, the default configuration (all groups connected) provides the right balance of connectivity and isolation.
