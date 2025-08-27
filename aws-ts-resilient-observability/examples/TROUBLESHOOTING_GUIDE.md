# AWS Infrastructure Components Troubleshooting Guide

This guide helps you diagnose and resolve common issues when deploying AWS infrastructure components using Pulumi.

## Table of Contents

1. [General Troubleshooting](#general-troubleshooting)
2. [Component-Specific Issues](#component-specific-issues)
3. [Deployment Issues](#deployment-issues)
4. [Networking Issues](#networking-issues)
5. [Security and Permissions](#security-and-permissions)
6. [Performance Issues](#performance-issues)
7. [Cost Optimization Issues](#cost-optimization-issues)
8. [Monitoring and Debugging](#monitoring-and-debugging)

## General Troubleshooting

### Enable Detailed Logging

Add verbose logging to get more information about deployment issues:

```bash
# Enable Pulumi debug logging
export PULUMI_LOG_LEVEL=debug
export PULUMI_LOG_TO_STDERR=true

# Run deployment with verbose output
pulumi up --verbose
```

### Check AWS Credentials and Permissions

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Check current region
aws configure get region

# Test basic AWS access
aws ec2 describe-regions
```

### Validate Configuration

```typescript
// Add configuration validation
const config = new pulumi.Config();

// Validate required configuration
const requiredConfigs = ["domainName", "environment"];
requiredConfigs.forEach(key => {
    if (!config.get(key)) {
        throw new Error(`Required configuration '${key}' is missing`);
    }
});

// Validate region format
const region = config.get("region") || "us-east-1";
if (!/^[a-z]{2}-[a-z]+-\d+$/.test(region)) {
    throw new Error(`Invalid region format: ${region}`);
}
```

## Component-Specific Issues

### IPAM Component Issues

#### Issue: IPAM Pool Creation Fails

**Symptoms:**
- Error: "InvalidParameterValue: IPAM pool creation failed"
- IPAM pool not created in expected region

**Solutions:**

1. **Check Region Support:**
```typescript
// Verify IPAM is supported in the region
const supportedRegions = [
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "eu-west-1", "eu-west-2", "eu-central-1",
    "ap-southeast-1", "ap-southeast-2", "ap-northeast-1"
];

if (!supportedRegions.includes(region)) {
    throw new Error(`IPAM not supported in region: ${region}`);
}
```

2. **Validate CIDR Blocks:**
```typescript
// Ensure CIDR blocks don't overlap
const cidrBlocks = ["10.0.0.0/8", "172.16.0.0/12"];

// Check for overlaps (implement overlap detection)
function validateCidrBlocks(cidrs: string[]) {
    // Implementation to check for CIDR overlaps
    for (let i = 0; i < cidrs.length; i++) {
        for (let j = i + 1; j < cidrs.length; j++) {
            if (cidrOverlaps(cidrs[i], cidrs[j])) {
                throw new Error(`CIDR blocks overlap: ${cidrs[i]} and ${cidrs[j]}`);
            }
        }
    }
}
```

#### Issue: IPAM Organization Sharing Fails

**Symptoms:**
- Error: "AccessDenied: Not authorized to share IPAM"
- IPAM created but not shared with organization

**Solutions:**

1. **Check Organization Permissions:**
```bash
# Verify you're in an AWS Organization
aws organizations describe-organization

# Check if you have sharing permissions
aws ram get-resource-shares --resource-owner SELF
```

2. **Enable Resource Sharing:**
```typescript
// Add explicit resource sharing configuration
const ipam = new IPAMComponent("shared-ipam", {
    cidrBlocks: ["10.0.0.0/8"],
    shareWithOrganization: true,
    operatingRegions: ["us-east-1"],
    // Add explicit sharing configuration
    resourceShareName: "ipam-share",
    allowExternalPrincipals: false
});
```

### VPC Component Issues

#### Issue: VPC Creation with IPAM Fails

**Symptoms:**
- Error: "InvalidParameterValue: Invalid IPAM pool ARN"
- VPC created without IPAM integration

**Solutions:**

1. **Verify IPAM Pool ARN:**
```typescript
// Add validation for IPAM pool ARN
const ipamPoolArn = ipam.getPoolArn("us-east-1");

// Validate ARN format
if (!ipamPoolArn || !ipamPoolArn.startsWith("arn:aws:ec2:")) {
    throw new Error(`Invalid IPAM pool ARN: ${ipamPoolArn}`);
}

const vpc = new VPCComponent("ipam-vpc", {
    region: "us-east-1",
    ipamPoolArn: ipamPoolArn,
    // Add dependency to ensure IPAM is created first
}, { dependsOn: [ipam] });
```

2. **Check IPAM Pool Availability:**
```typescript
// Add explicit dependency and validation
const vpc = new VPCComponent("ipam-vpc", {
    region: "us-east-1",
    ipamPoolArn: pulumi.output(ipam.poolArns).apply(pools => {
        const poolArn = pools["us-east-1"];
        if (!poolArn) {
            throw new Error("IPAM pool not available for region us-east-1");
        }
        return poolArn;
    })
});
```

#### Issue: Subnet Creation Fails

**Symptoms:**
- Error: "InvalidParameterValue: Subnet CIDR block is invalid"
- Some subnets created, others fail

**Solutions:**

1. **Validate Subnet Configuration:**
```typescript
// Add subnet validation
function validateSubnetConfig(subnets: any, vpcCidr: string) {
    Object.entries(subnets).forEach(([name, config]: [string, any]) => {
        // Validate CIDR prefix
        if (config.cidrPrefix < 1 || config.cidrPrefix > 28) {
            throw new Error(`Invalid CIDR prefix for subnet ${name}: ${config.cidrPrefix}`);
        }
        
        // Validate availability zones
        if (!config.availabilityZones || config.availabilityZones.length === 0) {
            throw new Error(`No availability zones specified for subnet ${name}`);
        }
    });
}
```

2. **Check Availability Zone Limits:**
```typescript
// Verify AZ availability
const availableAZs = await aws.getAvailabilityZones({
    state: "available"
});

const requestedAZs = ["us-east-1a", "us-east-1b", "us-east-1c"];
const unavailableAZs = requestedAZs.filter(az => 
    !availableAZs.names.includes(az)
);

if (unavailableAZs.length > 0) {
    throw new Error(`Unavailable AZs: ${unavailableAZs.join(", ")}`);
}
```

### ECR Component Issues

#### Issue: Repository Creation Fails

**Symptoms:**
- Error: "RepositoryAlreadyExistsException"
- Error: "InvalidParameterException: Repository name is invalid"

**Solutions:**

1. **Validate Repository Names:**
```typescript
// Add repository name validation
function validateRepositoryName(name: string) {
    const validPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
    if (!validPattern.test(name)) {
        throw new Error(`Invalid repository name: ${name}. Must match pattern: ${validPattern}`);
    }
    
    if (name.length > 256) {
        throw new Error(`Repository name too long: ${name}. Maximum 256 characters.`);
    }
}

// Apply validation
const repositories = [
    { name: "web-app" }, // Valid
    { name: "api_service" }, // Valid
    { name: "Invalid-Name!" } // Invalid - will throw error
];

repositories.forEach(repo => validateRepositoryName(repo.name));
```

2. **Handle Existing Repositories:**
```typescript
// Add import option for existing repositories
const ecr = new ECRComponent("my-ecr", {
    repositories: [
        {
            name: "existing-repo",
            importExisting: true // Custom option to import existing
        }
    ]
});
```

#### Issue: Cross-Region Replication Fails

**Symptoms:**
- Error: "InvalidParameterException: Replication destination not supported"
- Replication configuration not applied

**Solutions:**

1. **Validate Region Support:**
```typescript
// Check if both regions support ECR replication
const replicationSupportedRegions = [
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "eu-west-1", "eu-west-2", "eu-central-1"
    // Add other supported regions
];

function validateReplicationRegions(source: string, destination: string) {
    if (!replicationSupportedRegions.includes(source)) {
        throw new Error(`ECR replication not supported in source region: ${source}`);
    }
    if (!replicationSupportedRegions.includes(destination)) {
        throw new Error(`ECR replication not supported in destination region: ${destination}`);
    }
    if (source === destination) {
        throw new Error("Source and destination regions cannot be the same");
    }
}
```

### Route53 Component Issues

#### Issue: Hosted Zone Creation Fails

**Symptoms:**
- Error: "HostedZoneAlreadyExists"
- Error: "InvalidDomainName"

**Solutions:**

1. **Validate Domain Names:**
```typescript
// Add domain name validation
function validateDomainName(domain: string) {
    const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    
    if (!domainPattern.test(domain)) {
        throw new Error(`Invalid domain name: ${domain}`);
    }
    
    if (domain.length > 253) {
        throw new Error(`Domain name too long: ${domain}. Maximum 253 characters.`);
    }
}
```

2. **Handle Existing Hosted Zones:**
```typescript
// Check for existing hosted zones
const existingZones = await aws.route53.getZone({
    name: "example.com"
});

if (existingZones) {
    console.log(`Using existing hosted zone: ${existingZones.zoneId}`);
    // Import existing zone instead of creating new one
}
```

#### Issue: DNS Record Creation Fails

**Symptoms:**
- Error: "InvalidChangeBatch: Record already exists"
- Error: "InvalidParameterValue: Invalid record type"

**Solutions:**

1. **Validate Record Configuration:**
```typescript
// Add record validation
function validateDnsRecord(record: any) {
    const validTypes = ["A", "AAAA", "CNAME", "MX", "NS", "PTR", "SOA", "SRV", "TXT"];
    
    if (!validTypes.includes(record.type)) {
        throw new Error(`Invalid record type: ${record.type}`);
    }
    
    if (record.type === "CNAME" && record.values.length > 1) {
        throw new Error("CNAME records can only have one value");
    }
    
    if (record.ttl && (record.ttl < 60 || record.ttl > 86400)) {
        throw new Error(`Invalid TTL: ${record.ttl}. Must be between 60 and 86400 seconds.`);
    }
}
```

### EKS Component Issues

#### Issue: Cluster Creation Fails

**Symptoms:**
- Error: "InvalidParameterException: Subnet subnet-xxx is not in a supported availability zone"
- Error: "AccessDenied: User is not authorized to perform eks:CreateCluster"

**Solutions:**

1. **Validate Subnet Configuration:**
```typescript
// Ensure subnets are in supported AZs
const cluster = new EKSComponent("my-cluster", {
    subnetIds: pulumi.output(vpc.getSubnetIdsByName("private")).apply(async (subnetIds) => {
        // Validate each subnet
        for (const subnetId of subnetIds) {
            const subnet = await aws.ec2.getSubnet({ id: subnetId });
            const az = await aws.getAvailabilityZone({ name: subnet.availabilityZone });
            
            if (az.state !== "available") {
                throw new Error(`Subnet ${subnetId} is in unavailable AZ: ${subnet.availabilityZone}`);
            }
        }
        return subnetIds;
    })
});
```

2. **Check IAM Permissions:**
```bash
# Verify EKS permissions
aws iam simulate-principal-policy \
    --policy-source-arn $(aws sts get-caller-identity --query Arn --output text) \
    --action-names eks:CreateCluster \
    --resource-arns "*"
```

#### Issue: Node Group Creation Fails

**Symptoms:**
- Error: "InvalidParameterException: Instance type t3.nano is not supported"
- Error: "NodeCreationFailure: Instances failed to join the kubernetes cluster"

**Solutions:**

1. **Validate Instance Types:**
```typescript
// Check instance type availability
const supportedInstanceTypes = [
    "t3.small", "t3.medium", "t3.large",
    "m5.large", "m5.xlarge", "m5.2xlarge",
    "c5.large", "c5.xlarge", "c5.2xlarge"
];

function validateInstanceTypes(instanceTypes: string[]) {
    const unsupported = instanceTypes.filter(type => 
        !supportedInstanceTypes.includes(type)
    );
    
    if (unsupported.length > 0) {
        throw new Error(`Unsupported instance types: ${unsupported.join(", ")}`);
    }
}
```

2. **Check Node Group Configuration:**
```typescript
// Add node group validation
function validateNodeGroup(nodeGroup: any) {
    if (nodeGroup.scalingConfig.minSize > nodeGroup.scalingConfig.maxSize) {
        throw new Error("minSize cannot be greater than maxSize");
    }
    
    if (nodeGroup.scalingConfig.desiredSize < nodeGroup.scalingConfig.minSize ||
        nodeGroup.scalingConfig.desiredSize > nodeGroup.scalingConfig.maxSize) {
        throw new Error("desiredSize must be between minSize and maxSize");
    }
    
    if (nodeGroup.diskSize && nodeGroup.diskSize < 20) {
        throw new Error("Minimum disk size is 20 GB");
    }
}
```

## Deployment Issues

### Issue: Stack Update Fails

**Symptoms:**
- Error: "Resource is in use and cannot be deleted"
- Error: "Update requires replacement but resource has DeletionPolicy Retain"

**Solutions:**

1. **Handle Resource Dependencies:**
```typescript
// Add explicit dependencies
const database = new RDSGlobalComponent("my-db", {
    // configuration
}, { dependsOn: [vpc, securityGroup] });

// Use protect option for critical resources
const criticalDatabase = new RDSGlobalComponent("critical-db", {
    // configuration
}, { protect: true }); // Prevents accidental deletion
```

2. **Implement Graceful Updates:**
```typescript
// Add update policies
const cluster = new EKSComponent("my-cluster", {
    // configuration
}, {
    customTimeouts: {
        create: "30m",
        update: "20m",
        delete: "10m"
    }
});
```

### Issue: Resource Limits Exceeded

**Symptoms:**
- Error: "LimitExceeded: You have reached the limit for VPCs"
- Error: "InsufficientCapacity: Insufficient capacity"

**Solutions:**

1. **Check Service Limits:**
```bash
# Check VPC limits
aws ec2 describe-account-attributes --attribute-names supported-platforms

# Check EKS limits
aws service-quotas get-service-quota \
    --service-code eks \
    --quota-code L-1194D53C
```

2. **Implement Resource Cleanup:**
```typescript
// Add cleanup logic
export async function cleanupUnusedResources() {
    // Identify and clean up unused VPCs, security groups, etc.
    const unusedVpcs = await findUnusedVpcs();
    
    for (const vpc of unusedVpcs) {
        console.log(`Cleaning up unused VPC: ${vpc.id}`);
        // Implement cleanup logic
    }
}
```

## Networking Issues

### Issue: Connectivity Problems

**Symptoms:**
- Services cannot communicate between subnets
- Internet access not working from private subnets
- DNS resolution failures

**Solutions:**

1. **Validate Route Tables:**
```typescript
// Add route table validation
function validateRouting(vpc: VPCComponent) {
    // Check that public subnets have route to Internet Gateway
    // Check that private subnets have route to NAT Gateway
    // Validate Transit Gateway routes if applicable
}
```

2. **Check Security Groups:**
```typescript
// Add security group validation
function validateSecurityGroups(rules: SecurityGroupRule[]) {
    rules.forEach(rule => {
        if (rule.type === "ingress" && rule.cidrBlocks?.includes("0.0.0.0/0")) {
            console.warn(`Warning: Security group rule allows access from anywhere: ${JSON.stringify(rule)}`);
        }
    });
}
```

### Issue: DNS Resolution Problems

**Symptoms:**
- Services cannot resolve internal DNS names
- External DNS resolution fails

**Solutions:**

1. **Validate DNS Configuration:**
```typescript
// Check VPC DNS settings
const vpc = new VPCComponent("my-vpc", {
    enableDnsHostnames: true,
    enableDnsSupport: true,
    // other configuration
});
```

2. **Test DNS Resolution:**
```bash
# Test DNS resolution from EC2 instance
nslookup internal.example.com
dig @169.254.169.253 internal.example.com
```

## Security and Permissions

### Issue: IAM Permission Errors

**Symptoms:**
- Error: "AccessDenied: User is not authorized to perform action"
- Error: "UnauthorizedOperation: You are not authorized to perform this operation"

**Solutions:**

1. **Create Deployment Role:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:*",
                "eks:*",
                "rds:*",
                "ecr:*",
                "route53:*",
                "acm:*",
                "iam:PassRole",
                "iam:CreateRole",
                "iam:AttachRolePolicy"
            ],
            "Resource": "*"
        }
    ]
}
```

2. **Use Least Privilege Principle:**
```typescript
// Create specific roles for each service
const eksServiceRole = new aws.iam.Role("eks-service-role", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "eks.amazonaws.com"
            }
        }]
    })
});
```

### Issue: Security Group Misconfigurations

**Symptoms:**
- Services cannot communicate
- Unexpected network access

**Solutions:**

1. **Implement Security Group Best Practices:**
```typescript
// Create restrictive security groups
const databaseSG = new aws.ec2.SecurityGroup("database-sg", {
    vpcId: vpc.vpcId,
    ingress: [{
        fromPort: 5432,
        toPort: 5432,
        protocol: "tcp",
        cidrBlocks: [vpc.cidrBlock], // Only allow VPC access
        description: "PostgreSQL access from VPC"
    }],
    egress: [], // No outbound access needed for database
    tags: {
        Name: "database-security-group"
    }
});
```

## Performance Issues

### Issue: Slow Deployment Times

**Symptoms:**
- Deployments take longer than expected
- Timeouts during resource creation

**Solutions:**

1. **Optimize Deployment Order:**
```typescript
// Create independent resources in parallel
const [vpc, ecr] = await Promise.all([
    new VPCComponent("my-vpc", { /* config */ }),
    new ECRComponent("my-ecr", { /* config */ })
]);

// Create dependent resources after
const cluster = new EKSComponent("my-cluster", {
    subnetIds: vpc.getSubnetIdsByName("private")
}, { dependsOn: [vpc] });
```

2. **Use Appropriate Timeouts:**
```typescript
const cluster = new EKSComponent("my-cluster", {
    // configuration
}, {
    customTimeouts: {
        create: "45m", // EKS clusters can take 15-20 minutes
        update: "30m",
        delete: "15m"
    }
});
```

### Issue: Resource Scaling Problems

**Symptoms:**
- Auto-scaling not working as expected
- Performance degradation under load

**Solutions:**

1. **Configure Proper Scaling:**
```typescript
const cluster = new EKSComponent("scalable-cluster", {
    nodeGroups: [{
        name: "scalable-nodes",
        scalingConfig: {
            minSize: 3,    // Ensure minimum capacity
            maxSize: 50,   // Allow for growth
            desiredSize: 5 // Start with reasonable size
        },
        instanceTypes: ["m5.large", "m5.xlarge", "c5.large"], // Multiple types for better availability
        capacityType: "SPOT" // Use spot for cost optimization
    }]
});
```

## Cost Optimization Issues

### Issue: Unexpected High Costs

**Symptoms:**
- AWS bill higher than expected
- Resources running when not needed

**Solutions:**

1. **Implement Cost Controls:**
```typescript
// Add cost allocation tags
const commonTags = {
    Environment: environment,
    Project: project,
    CostCenter: "engineering",
    Owner: "platform-team"
};

// Use cost-optimized configurations
const devCluster = new EKSComponent("dev-cluster", {
    nodeGroups: [{
        instanceTypes: ["t3.small", "t3.medium"], // Smaller instances for dev
        capacityType: "SPOT", // Use spot instances
        scalingConfig: {
            minSize: 1,
            maxSize: 3,
            desiredSize: 1
        }
    }],
    enableCloudWatchLogging: false, // Disable expensive logging for dev
    tags: { ...commonTags, CostOptimized: "true" }
});
```

2. **Monitor Resource Usage:**
```bash
# Set up cost alerts
aws budgets create-budget --account-id $(aws sts get-caller-identity --query Account --output text) \
    --budget file://budget.json \
    --notifications-with-subscribers file://notifications.json
```

## Monitoring and Debugging

### Enable Comprehensive Logging

```typescript
// Add logging to components
import * as pulumi from "@pulumi/pulumi";

export class DebuggableComponent extends pulumi.ComponentResource {
    constructor(name: string, args: any, opts?: pulumi.ComponentResourceOptions) {
        super("custom:DebuggableComponent", name, {}, opts);
        
        // Log component creation
        pulumi.log.info(`Creating ${name} with args: ${JSON.stringify(args)}`);
        
        // Add debug outputs
        this.registerOutputs({
            debug: {
                name: name,
                args: args,
                timestamp: new Date().toISOString()
            }
        });
    }
}
```

### Set Up Health Checks

```typescript
// Add health check endpoints
export const healthChecks = {
    vpc: vpc.vpcId.apply(id => `VPC ${id} created successfully`),
    cluster: cluster.clusterEndpoint.apply(endpoint => `Cluster available at ${endpoint}`),
    database: database.primaryClusterEndpoint.apply(endpoint => `Database available at ${endpoint}`)
};
```

### Use Pulumi Stack References

```typescript
// Reference outputs from other stacks
const networkingStack = new pulumi.StackReference("networking-stack");
const vpcId = networkingStack.getOutput("vpcId");

// Use in current stack
const cluster = new EKSComponent("my-cluster", {
    subnetIds: networkingStack.getOutput("privateSubnetIds")
});
```

This troubleshooting guide covers the most common issues you might encounter when deploying AWS infrastructure components. For additional help, check the Pulumi documentation and AWS service-specific troubleshooting guides.