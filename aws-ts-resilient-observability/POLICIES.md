# CrossGuard Policies - Automatic Enforcement

Policies are **automatically applied** when using the automation CLI commands.

## Quick Start

Just use your normal deployment commands - policies are automatically enforced:

```bash
# Deploy with policies automatically applied
npm run deploy

# Preview with policies automatically applied
npm run preview

# Deploy specific stacks with policies
npm run automation deploy -- --config deployment-config.json --stacks my-stack
```

## How It Works

The automation orchestrator automatically applies the policy pack from `./policies` directory to all deployments. Policies run in **advisory mode** by default, meaning:

- ✅ Violations are reported as warnings
- ✅ Deployments proceed even with violations
- ✅ You can see what needs to be fixed without blocking progress

## Policy Enforcement Levels

Enforcement automatically adjusts based on environment (detected from stack name or `NODE_ENV`):

### Development (dev)
- **Mode**: Advisory (warnings only)
- **Mandatory**: Only SSL and encryption

### Staging (staging/stg)
- **Mode**: Advisory with some mandatory policies
- **Mandatory**: Security, logging, and monitoring

### Production (prod)
- **Mode**: Strict enforcement
- **Mandatory**: All security, HA, logging, and monitoring policies

## Included Policies

### Security ✅
- EC2 instances without public IPs
- Encrypted EBS volumes
- Encrypted RDS storage
- S3 SSL-only requests
- IAM user policy restrictions

### Logging & Monitoring 📊
- ELB access logging
- CloudWatch log encryption

### High Availability 🔄
- RDS Multi-AZ deployment

### Custom Policies 🎯
- Required resource tags (Environment, Owner, Project)
- Naming conventions
- EKS logging
- VPC flow logs

## Viewing Policy Violations

When you run deployments, policy violations are shown in the output:

```bash
npm run automation deploy -- --config deployment-config.json

# Output will show:
# Policy Violations (1)
#   [advisory] ec2-instance-no-public-ip: EC2 instance should not have a public IP address
```

## Customization

### Adjust Enforcement Levels

Edit `policies/policy-config.ts`:

```typescript
export const prodConfig: PolicyConfig = {
    enforcementLevel: "mandatory",
    awsGuard: {
        all: "advisory",
        overrides: {
            ec2InstanceNoPublicIP: "mandatory",
            encryptedVolumes: "mandatory",
            // Add more...
        }
    }
};
```

### Add Custom Policies

Edit `policies/custom-policies.ts`:

```typescript
const myPolicy: policy.ResourceValidationPolicy = {
    name: "my-custom-policy",
    description: "Description",
    enforcementLevel: "mandatory",
    validateResource: (args, reportViolation) => {
        // Your validation logic
    },
};
```

### Test Policy Changes

```bash
# Preview to see policy violations
npm run automation preview -- --config deployment-config.json

# Test with different environments
NODE_ENV=prod npm run automation preview -- --config deployment-config.json
```

## Organization-Wide Enforcement (Optional)

If you have Pulumi Team/Enterprise, you can publish policies for organization-wide enforcement:

```bash
# Publish to Pulumi Cloud
npm run policy:publish

# Enable for organization
pulumi policy enable <org-name>/aws-infrastructure-governance latest
```

After enabling, policies apply to ALL deployments automatically, even outside this project.

## Disabling Policies

Policies are integrated into the automation orchestrator. To temporarily disable:

1. Comment out the `policyPacks` lines in `automation/deployment-orchestrator.ts`
2. Or set all policies to `"disabled"` in `policy-config.ts`

**Not recommended for production!**

## More Information

- Detailed policy documentation: `policies/README.md`
- Quick reference: `POLICIES_QUICKSTART.md`
