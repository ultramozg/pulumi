# IPAM Implementation Fixes

## Issues Fixed

### 1. IPAM Pool CIDR Not Provisioned

**Problem**: 
VPC creation was failing because the IPAM pool didn't have CIDRs provisioned yet:
```
error: creating EC2 VPC: The pool ipam-pool-xxx does not have any pool cidrs provisioned
```

**Root Cause**:
The VPC was trying to use the IPAM pool immediately after pool creation, but before the CIDR blocks were added to the pool. IPAM pools need to have at least one CIDR block provisioned before they can allocate IP addresses to VPCs.

**Solution**:
1. Track IPAM pool CIDR resources in the component
2. Add explicit dependencies so VPC waits for CIDRs to be provisioned
3. Use `getPoolResources()` method to get both pool and CIDRs

```typescript
// In IPAM Component
private readonly poolCidrs: { [region: string]: aws.ec2.VpcIpamPoolCidr[] } = {};

public getPoolResources(region: string): { 
    pool: aws.ec2.VpcIpamPool; 
    cidrs: aws.ec2.VpcIpamPoolCidr[] 
} {
    return { pool: this.pools[region], cidrs: this.poolCidrs[region] };
}

// In shared-services
const poolResources = ipam.getPoolResources(currentRegion);
ipamPoolId = poolResources.pool.id;
ipamPoolDependencies = [poolResources.pool, ...poolResources.cidrs];

// VPC waits for pool + CIDRs
const hubVpc = new VPCComponent(..., {
    dependsOn: ipamPoolDependencies
});
```

**Files Changed**: 
- `components/ipam/index.ts`
- `shared-services/index.ts`

### 2. IPAM Scope Race Condition

**Problem**: 
The us-west-2 IPAM pool was trying to read the IPAM scope before it was fully created, causing:
```
error: reading IPAM Scope (ipam-scope-xxx): couldn't find resource
```

**Root Cause**:
When creating IPAM pools in multiple regions with regional providers, the pools were being created in parallel without waiting for the scope to be fully available.

**Solution**:
Added explicit dependency on the scope for all IPAM pools:

```typescript
const pool = new aws.ec2.VpcIpamPool(
    `${resourceName}-pool-${region}`,
    {
        ipamScopeId: this.scope.id,
        // ...
    },
    {
        parent: this,
        provider: regionProvider,
        dependsOn: [this.scope]  // ✅ Ensures scope is fully created first
    }
);
```

**File Changed**: `components/ipam/index.ts`

### 2. Output Value in String Template

**Problem**:
Trying to use Pulumi Output values directly in string templates:
```
Transit Gateway ID will be shared via stack outputs: Calling [toString] on an [Output<T>] is not supported.
```

**Root Cause**:
Console.log was trying to convert `transitGateway.transitGateway.id` (an Output<string>) to a string directly.

**Solution**:
Use `.apply()` to unwrap the Output value:

```typescript
// ❌ Before (incorrect)
console.log(`Transit Gateway ID: ${transitGateway.transitGateway.id}`);

// ✅ After (correct)
transitGateway.transitGateway.id.apply(id => 
    console.log(`Transit Gateway ID will be shared via stack outputs: ${id}`)
);
```

**File Changed**: `shared-services/index.ts`

## Why These Fixes Work

### IPAM Resource Lifecycle
The correct order for IPAM resources is:
1. **IPAM Instance** → Created first
2. **IPAM Scope** → Created after IPAM
3. **IPAM Pool** → Created after scope
4. **IPAM Pool CIDR** → Added to pool
5. **VPC** → Can now use pool (after CIDRs are provisioned)

Without proper dependencies, resources try to use each other before they're ready.

### Dependency Management
By adding `dependsOn: [this.scope]` and tracking pool CIDRs, we ensure:
1. IPAM scope is fully created and available in AWS
2. Scope ID is registered in Pulumi state
3. Regional pools can safely reference the scope
4. No race conditions between parallel resource creation

### Output Handling
Pulumi Outputs are lazy-evaluated promises. To use their values:
- **For resource properties**: Pass Output directly (Pulumi handles it)
- **For logging/debugging**: Use `.apply()` to unwrap the value
- **For string interpolation**: Use `pulumi.interpolate` or `.apply()`

## Testing the Fix

### 1. Clean Up Previous Failed Deployment
```bash
# If the previous deployment partially succeeded, clean it up
pulumi destroy -s shared-services-primary --yes

# Or refresh state if resources are stuck
pulumi refresh -s shared-services-primary
pulumi up -s shared-services-primary --yes
```

### 2. Deploy Primary Stack
```bash
pulumi up -s shared-services-primary --yes
```

**Expected Result**:
- IPAM instance created successfully
- IPAM scope created successfully
- Both IPAM pools (us-east-1 and us-west-2) created successfully
- IPAM pool CIDRs provisioned to both pools
- VPC created with CIDR allocated from IPAM pool
- No race condition errors
- Transit Gateway ID logged correctly

### 3. Verify IPAM Resources
```bash
# Check stack outputs
pulumi stack output -s shared-services-primary

# Should show:
# ipamId: ipam-xxx
# ipamPoolIds: {"us-east-1": "ipam-pool-xxx", "us-west-2": "ipam-pool-yyy"}
```

### 4. Deploy Secondary Stack
```bash
pulumi up -s shared-services-secondary --yes
```

**Expected Result**:
- Imports IPAM pool IDs from primary
- Creates VPC using us-west-2 pool
- No errors

## Additional Best Practices Applied

### 1. Explicit Dependencies
Always specify dependencies when:
- Resources in different regions reference each other
- Child resources depend on parent being fully available
- Cross-provider resources are involved

### 2. Output Handling
```typescript
// ✅ Good: Pass Output to resource properties
new aws.ec2.Vpc("vpc", {
    ipv4IpamPoolId: ipamPoolId  // Output<string> is fine here
});

// ✅ Good: Use apply() for logging
output.apply(value => console.log(value));

// ✅ Good: Use interpolate for strings
pulumi.interpolate`Value: ${output}`;

// ❌ Bad: Direct string conversion
console.log(`Value: ${output}`);  // Will error
```

### 3. Regional Provider Management
When creating resources in multiple regions:
- Create regional providers explicitly
- Pass provider to resource options
- Add dependencies to ensure proper ordering

## Verification Checklist

After deployment, verify:

- [ ] IPAM instance exists in us-east-1
- [ ] IPAM scope exists and is active
- [ ] us-east-1 pool exists and is active
- [ ] us-west-2 pool exists and is active
- [ ] Primary VPC created with CIDR from us-east-1 pool
- [ ] Secondary VPC created with CIDR from us-west-2 pool
- [ ] No error messages in deployment logs
- [ ] Stack outputs include all IPAM resources

## AWS Console Verification

1. **IPAM Instance**:
   - Go to: VPC Console → IP Address Manager
   - Verify: One IPAM instance in us-east-1
   - Status: Should be "create-complete"

2. **IPAM Scope**:
   - Click on IPAM instance → Scopes tab
   - Verify: One private scope exists
   - Status: Should be active

3. **IPAM Pools**:
   - Click on scope → Pools tab
   - Verify: Two pools (us-east-1 and us-west-2)
   - Locale: Each pool should show correct region
   - Status: Both should be "create-complete"

4. **VPC Allocations**:
   - Click on each pool → Allocations tab
   - Verify: VPCs are listed with allocated CIDRs
   - CIDR: Should be from 10.0.0.0/8 range

## Troubleshooting

### If IPAM Scope Error Still Occurs

1. **Check AWS Provider Version**:
   ```bash
   # Ensure using compatible version
   npm list @pulumi/aws
   ```

2. **Increase Timeouts**:
   ```typescript
   const pool = new aws.ec2.VpcIpamPool(
       // ...
       {
           customTimeouts: {
               create: "10m",
               update: "10m",
               delete: "10m"
           }
       }
   );
   ```

3. **Check AWS Permissions**:
   - Ensure IAM role has `ec2:CreateIpamScope` permission
   - Ensure IAM role has `ec2:CreateIpamPool` permission
   - Check for any SCP restrictions

### If Output Error Still Occurs

1. **Find All Output Usage**:
   ```bash
   grep -r "console.log.*\${.*\.id}" shared-services/
   ```

2. **Replace with apply()**:
   ```typescript
   // For any Output value in string template
   output.apply(value => console.log(`Message: ${value}`));
   ```

3. **Use pulumi.interpolate**:
   ```typescript
   // Alternative approach
   pulumi.interpolate`Message: ${output}`.apply(msg => console.log(msg));
   ```

## Performance Impact

These fixes have minimal performance impact:

- **dependsOn**: Adds explicit ordering but doesn't slow down deployment (resources would wait anyway)
- **.apply()**: No performance impact, just proper async handling
- **Overall**: Deployment time should be similar or slightly more predictable

## Related Documentation

- [Pulumi Inputs and Outputs](https://www.pulumi.com/docs/concepts/inputs-outputs/)
- [Resource Dependencies](https://www.pulumi.com/docs/concepts/options/dependson/)
- [AWS IPAM Documentation](https://docs.aws.amazon.com/vpc/latest/ipam/)

---

**Status**: ✅ Fixes Applied  
**Tested**: Ready for deployment  
**Version**: 1.1
