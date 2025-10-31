# Multi-Region Deployment Guide

This guide explains how to deploy the resilient observability platform across multiple AWS regions and accounts.

## Architecture Overview

The deployment creates infrastructure across two AWS accounts and two regions:

### Shared Services Account
- **Primary Region (us-east-1)**:
  - Transit Gateway (ASN: 64512)
  - Hub VPC (10.0.0.0/16)
  - Shared EKS Cluster for monitoring services
- **Secondary Region (us-west-2)**:
  - Transit Gateway (ASN: 64513)
  - Hub VPC (10.2.0.0/16)
  - Shared EKS Cluster for monitoring services

### Workloads Account
- **Primary Region (us-east-1)**:
  - Spoke VPC (10.1.0.0/16)
  - Transit Gateway Attachments
  - Workload EKS Cluster
  - RDS Aurora Global Database (Primary)
  - Route 53 Failover Records
- **Secondary Region (us-west-2)**:
  - Spoke VPC (10.3.0.0/16)
  - Transit Gateway Attachments
  - Workload EKS Cluster
  - RDS Aurora Global Database (Secondary)

## Prerequisites

### 1. AWS Accounts Setup
You need two AWS accounts:
- **Shared Services Account**: For centralized monitoring and networking
- **Workloads Account**: For application workloads

### 2. IAM Roles
Create IAM roles in each account that Pulumi can assume:

#### Shared Services Account Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR-DEPLOYMENT-ACCOUNT:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "pulumi-shared-services"
        }
      }
    }
  ]
}
```

#### Workloads Account Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR-DEPLOYMENT-ACCOUNT:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "pulumi-workloads"
        }
      }
    }
  ]
}
```

Both roles need the following managed policies:
- `PowerUserAccess`
- `IAMFullAccess` (for creating service roles)

### 3. Environment Variables
Set the following environment variables before deployment:

```bash
export SHARED_SERVICES_ROLE_ARN="arn:aws:iam::SHARED-SERVICES-ACCOUNT-ID:role/PulumiExecutionRole"
export WORKLOADS_ROLE_ARN="arn:aws:iam::WORKLOADS-ACCOUNT-ID:role/PulumiExecutionRole"
```

**Note**: Account IDs are automatically extracted from the role ARNs when needed using the built-in `extractAccountIdFromArn()` utility function. This eliminates the need for separate `SHARED_SERVICES_ACCOUNT_ID` and `WORKLOADS_ACCOUNT_ID` environment variables.

### 4. Dependencies
Install required dependencies:

```bash
npm install
```

## Deployment Steps

### 1. Preview the Deployment
Before deploying, preview what will be created:

```bash
npx ts-node deploy.ts preview
```

### 2. Deploy All Stacks
Deploy the entire infrastructure:

```bash
npx ts-node deploy.ts deploy
```

The deployment will proceed in the following order:
1. Shared Services Primary (us-east-1)
2. Shared Services Secondary (us-west-2)
3. Workloads Primary (us-east-1)
4. Workloads Secondary (us-west-2)

### 3. Verify Deployment
After deployment, verify the infrastructure:

```bash
# Check shared services stacks
pulumi stack ls --cwd ./shared-services
pulumi stack output --cwd ./shared-services

# Check workloads stacks
pulumi stack ls --cwd ./workloads
pulumi stack output --cwd ./workloads
```

## Configuration Customization

### Modifying Regions
To change the regions, update the configuration files:

- `shared-services/Pulumi.shared-services.yaml`
- `shared-services/Pulumi.shared-services-fallback.yaml`
- `workloads/Pulumi.workload.yaml`
- `workloads/Pulumi.workload-fallback.yaml`

### Modifying CIDR Blocks
Update the VPC CIDR blocks in the configuration files:

```yaml
config:
  shared-services:hubVpcCidr: 10.0.0.0/16      # Shared services primary
  shared-services:hubVpcCidr: 10.2.0.0/16      # Shared services secondary
  workloads:spokeVpcCidr: 10.1.0.0/16          # Workloads primary
  workloads:spokeVpcCidr: 10.3.0.0/16          # Workloads secondary
```

### Modifying EKS Configuration
Update EKS cluster settings in the implementation files:
- `shared-services/index.ts`
- `workloads/index.ts`

## Disaster Recovery Features

### Route 53 Failover
The deployment creates Route 53 health checks and failover records:
- Primary endpoint: Routes traffic to us-east-1
- Secondary endpoint: Routes traffic to us-west-2 if primary fails

### RDS Global Database
Aurora Global Database provides:
- Cross-region replication with < 1 second lag
- Automatic failover capabilities
- Read replicas in secondary region

### Transit Gateway Connectivity
Cross-region connectivity is established through:
- Transit Gateway peering (if configured)
- VPC-to-VPC connectivity within each region
- Centralized routing through hub VPCs

## Monitoring and Observability

### Shared EKS Clusters
The shared EKS clusters will host:
- Cortex (metrics collection)
- Grafana (dashboards and alerting)
- Loki (log aggregation)
- Tempo (distributed tracing)

### Workload EKS Clusters
The workload EKS clusters will host:
- Application services
- Strimzi Kafka clusters
- MirrorMaker 2.0 for cross-region replication

## Cleanup

To destroy all infrastructure:

```bash
npx ts-node deploy.ts destroy
```

**Warning**: This will destroy all resources in both accounts and regions. Make sure you have backups of any important data.

## Troubleshooting

### Common Issues

1. **Role Assumption Failures**
   - Verify IAM roles exist and have correct trust policies
   - Check environment variables are set correctly

2. **Cross-Account Resource Sharing**
   - Ensure RAM resource shares are accepted in the workloads account
   - Verify organization settings allow resource sharing

3. **VPC CIDR Conflicts**
   - Ensure all VPC CIDR blocks are unique
   - Check for conflicts with existing VPCs

4. **EKS Cluster Creation Timeouts**
   - EKS clusters can take 10-15 minutes to create
   - Check CloudFormation events for detailed error messages

### Getting Help

For issues with the deployment:
1. Check Pulumi logs: `pulumi logs --cwd ./shared-services`
2. Check AWS CloudFormation events in the AWS Console
3. Verify IAM permissions and role assumptions
4. Check VPC and subnet configurations

## Next Steps

After successful deployment:
1. Configure kubectl access to EKS clusters
2. Deploy monitoring applications to shared EKS clusters
3. Deploy workload applications to workload EKS clusters
4. Configure cross-region data replication
5. Set up monitoring and alerting