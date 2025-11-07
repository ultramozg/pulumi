# AWS Infrastructure Governance Policies

CrossGuard policy pack that enforces AWS best practices and organizational standards.

## Policy Pack Contents

This pack includes:
- **AWS Best Practices**: Security, logging, high availability policies
- **Custom Policies**: Organization-specific requirements (tagging, naming, etc.)
- **Environment-Based Enforcement**: Different strictness for dev/staging/prod

## Usage

### Local Policy Enforcement (Free)

Apply policies to any Pulumi command:

```bash
# From project root
pulumi up --policy-pack ./policies
pulumi preview --policy-pack ./policies
pulumi destroy --policy-pack ./policies
```

### Organization-Wide (Requires Pulumi Team/Enterprise)

Publish once for automatic enforcement:

```bash
# From project root
npm run policy:publish

# Enable for organization
pulumi policy enable <org-name>/aws-infrastructure-governance latest
```

## Policy List

### AWS Best Practices

| Policy | Description | Default Enforcement |
|--------|-------------|---------------------|
| `ec2-instance-no-public-ip` | EC2 instances should not have public IPs | Advisory |
| `ebs-volume-encrypted` | EBS volumes must be encrypted | Advisory |
| `rds-storage-encrypted` | RDS storage must be encrypted | Advisory |
| `s3-bucket-ssl-requests-only` | S3 buckets must require SSL | Advisory |
| `iam-user-no-policies` | IAM users should not have inline policies | Advisory |
| `elb-access-logging-enabled` | ELB/ALB must have access logging | Advisory |
| `cloudwatch-log-group-encrypted` | CloudWatch logs must be encrypted | Advisory |
| `rds-multi-az-enabled` | RDS instances must use Multi-AZ | Advisory |

### Custom Policies

| Policy | Description | Default Enforcement |
|--------|-------------|---------------------|
| `require-resource-tags` | Resources must have Environment, Owner, Project tags | Mandatory |
| `enforce-naming-convention` | Resources must follow naming pattern | Advisory |
| `require-rds-encryption` | RDS encryption enforcement | Mandatory |
| `require-eks-logging` | EKS control plane logging | Mandatory |
| `require-vpc-flow-logs` | VPC flow logs recommendation | Advisory |

## Environment-Based Enforcement

Enforcement levels automatically adjust based on environment:

### Development
```typescript
{
    enforcementLevel: "advisory",
    awsGuard: {
        all: "advisory",
        overrides: {
            s3BucketSSLRequestsOnly: "mandatory",
            rdsStorageEncrypted: "mandatory",
        }
    }
}
```

### Staging
```typescript
{
    enforcementLevel: "advisory",
    awsGuard: {
        all: "advisory",
        overrides: {
            ec2InstanceNoPublicIP: "mandatory",
            encryptedVolumes: "mandatory",
            rdsStorageEncrypted: "mandatory",
            s3BucketSSLRequestsOnly: "mandatory",
            elbAccessLoggingEnabled: "mandatory",
        }
    }
}
```

### Production
```typescript
{
    enforcementLevel: "mandatory",
    awsGuard: {
        all: "advisory",
        overrides: {
            // All security policies: mandatory
            ec2InstanceNoPublicIP: "mandatory",
            encryptedVolumes: "mandatory",
            rdsStorageEncrypted: "mandatory",
            s3BucketSSLRequestsOnly: "mandatory",
            iamUserNoPolicies: "mandatory",
            elbAccessLoggingEnabled: "mandatory",
            cloudWatchLogGroupEncrypted: "mandatory",
            rdsMultiAZEnabled: "mandatory",
        }
    }
}
```

Environment is detected from:
1. `PULUMI_STACK` environment variable
2. `NODE_ENV` environment variable  
3. Stack name (checks for "prod", "staging", etc.)

## Customization

### Add New Policy

Edit `custom-policies.ts`:

```typescript
const myPolicy: policy.ResourceValidationPolicy = {
    name: "my-policy-name",
    description: "What this policy enforces",
    enforcementLevel: "mandatory",
    validateResource: (args, reportViolation) => {
        if (args.type === "aws:s3/bucket:Bucket") {
            if (!args.props.versioning?.enabled) {
                reportViolation("S3 buckets must have versioning enabled");
            }
        }
    },
};

export const customPolicies = [
    // ... existing
    myPolicy,
];
```

### Modify Enforcement Levels

Edit `policy-config.ts`:

```typescript
export const prodConfig: PolicyConfig = {
    enforcementLevel: "mandatory",
    awsGuard: {
        all: "advisory",
        overrides: {
            myNewPolicy: "mandatory",
            // ...
        }
    }
};
```

### Test Changes

```bash
# Install dependencies
cd policies
npm install

# Test locally
cd ..
pulumi preview --policy-pack ./policies

# Test with different environments
NODE_ENV=prod pulumi preview --policy-pack ./policies
NODE_ENV=dev pulumi preview --policy-pack ./policies
```

## Policy Development

### Enforcement Levels

- **advisory**: Warns but allows deployment
- **mandatory**: Blocks deployment on violation
- **disabled**: Policy not evaluated

### Resource Validation

Policies receive:
- `args.type`: Resource type (e.g., "aws:s3/bucket:Bucket")
- `args.name`: Resource name
- `args.props`: Resource properties
- `reportViolation(message)`: Function to report violations

Example:

```typescript
validateResource: (args, reportViolation) => {
    if (args.type === "aws:ec2/instance:Instance") {
        if (args.props.instanceType?.startsWith("t2.")) {
            reportViolation("Use t3 instances instead of t2 for better performance");
        }
    }
}
```

## Troubleshooting

### Policy Violations

```bash
# See all violations
pulumi preview --policy-pack ./policies

# Verbose output
pulumi preview --policy-pack ./policies --verbose
```

### Policy Not Applied

Ensure you're using the `--policy-pack` flag or have organization-wide policies enabled.

### TypeScript Errors

```bash
cd policies
npm install
npx tsc --noEmit
```

## Resources

- [Pulumi CrossGuard Documentation](https://www.pulumi.com/docs/using-pulumi/crossguard/)
- [Policy Pack Authoring](https://www.pulumi.com/docs/using-pulumi/crossguard/core-concepts/)
- [AWS Best Practices](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)
