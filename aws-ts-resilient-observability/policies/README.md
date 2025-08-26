# AWS Infrastructure Governance Policies

This directory contains Pulumi CrossGuard policies for enforcing security, compliance, and organizational standards across AWS infrastructure deployments.

## Policy Pack Structure

- `index.ts` - Main policy pack entry point that combines AWS Guard policies with custom rules
- `custom-policies.ts` - Organization-specific custom policies
- `PulumiPolicy.yaml` - Policy pack configuration

## Custom Policies

### Mandatory Policies

1. **require-resource-tags** - Ensures all resources have required tags (Environment, Owner, Project)
2. **require-rds-encryption** - Requires encryption at rest for RDS instances and clusters
3. **require-eks-logging** - Mandates control plane logging for EKS clusters

### Advisory Policies

1. **enforce-naming-convention** - Suggests following naming convention: {environment}-{project}-{resource-type}-{identifier}
2. **require-vpc-flow-logs** - Recommends enabling VPC Flow Logs for network monitoring

## Usage

### Running Policy Validation

```bash
# Install dependencies
npm install

# Run policy tests
npm test

# Apply policies to a stack
pulumi preview --policy-pack ./policies
```

### Policy Testing

The policies include comprehensive unit tests located in `../tests/unit/policies.test.ts`. Tests use mock violation reporters to validate policy behavior without actual AWS resources.

### Customization

To add new custom policies:

1. Add the policy implementation to `custom-policies.ts`
2. Export it in the `customPolicies` array
3. Add corresponding unit tests in the test file
4. Update this README with policy documentation

## AWS Guard Integration

This policy pack is designed to work alongside AWS Guard policies. AWS Guard policies can be enabled separately using:

```bash
# Enable AWS Guard policies
pulumi policy enable awsguard
```

AWS Guard provides:

- Security best practices enforcement
- Compliance with AWS Well-Architected Framework
- Common security misconfigurations prevention

For more information on AWS Guard policies, see the [AWS Guard documentation](https://github.com/pulumi/pulumi-awsguard).