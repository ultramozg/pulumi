# AWS Infrastructure Components Usage Guide

This guide provides comprehensive documentation on how to use each AWS infrastructure component in the library, including code examples, configuration options, and best practices.

## Table of Contents

1. [IPAM Component](#ipam-component)
2. [VPC Component](#vpc-component)
3. [ECR Component](#ecr-component)
4. [Route53 Component](#route53-component)
5. [ACM Component](#acm-component)
6. [RDS Global Database Component](#rds-global-database-component)
7. [EKS Component](#eks-component)
8. [Component Integration Patterns](#component-integration-patterns)
9. [Best Practices](#best-practices)

## IPAM Component

The IPAM (IP Address Management) component provides centralized IP address allocation and management across multiple AWS regions and accounts.

### Basic Usage

```typescript
import { IPAMComponent } from "../components/ipam";

const ipam = new IPAMComponent("my-ipam", {
    cidrBlocks: ["10.0.0.0/8", "172.16.0.0/12"],
    shareWithOrganization: true,
    operatingRegions: ["us-east-1", "us-west-2"],
    tags: {
        Environment: "production",
        Team: "platform"
    }
});
```

### Configuration Options

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cidrBlocks` | `string[]` | Yes | CIDR blocks to manage |
| `shareWithOrganization` | `boolean` | Yes | Whether to share with AWS organization |
| `operatingRegions` | `string[]` | Yes | Regions where IPAM operates |
| `tags` | `object` | No | Resource tags |

### Helper Methods

```typescript
// Get pool ID for a specific region
const poolId = ipam.getPoolId("us-east-1");

// Get pool ARN for a specific region
const poolArn = ipam.getPoolArn("us-east-1");

// Check if region is supported
const isSupported = ipam.supportsRegion("eu-west-1");

// Get all available regions
const regions = ipam.getAvailableRegions();
```

### Outputs

- `ipamId`: The IPAM resource ID
- `ipamArn`: The IPAM resource ARN
- `poolIds`: Map of region to pool ID
- `poolArns`: Map of region to pool ARN
- `scopeId`: The IPAM scope ID

## VPC Component

The VPC component creates a Virtual Private Cloud with flexible subnet configuration, IPAM integration, and Transit Gateway support.

### Basic Usage

```typescript
import { VPCComponent } from "../components/vpc";

const vpc = new VPCComponent("my-vpc", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8,
            availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"]
        },
        private: {
            type: 'private',
            cidrPrefix: 6,
            availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"]
        }
    },
    tags: {
        Environment: "production"
    }
});
```

### IPAM Integration

```typescript
// Use IPAM for automatic CIDR allocation
const vpcWithIPAM = new VPCComponent("ipam-vpc", {
    region: "us-east-1",
    ipamPoolArn: ipam.getPoolArn("us-east-1"), // Use IPAM instead of manual CIDR
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 2,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8,
            availabilityZones: ["us-east-1a", "us-east-1b"]
        }
    }
});
```

### Transit Gateway Integration

```typescript
// Attach VPC to Transit Gateway
const transitVpc = new VPCComponent("transit-vpc", {
    region: "us-east-1",
    cidrBlock: "172.16.0.0/16",
    transitGatewayArn: transitGateway.transitGateway.arn,
    subnets: {
        private: {
            type: 'private',
            cidrPrefix: 8,
            availabilityZones: ["us-east-1a", "us-east-1b"]
        },
        transit: {
            type: 'transit-gateway',
            cidrPrefix: 8,
            availabilityZones: ["us-east-1a", "us-east-1b"]
        }
    }
});
```

### Configuration Options

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | `string` | Yes | AWS region |
| `cidrBlock` | `string` | No* | VPC CIDR block (*required if no IPAM) |
| `ipamPoolArn` | `string` | No* | IPAM pool ARN (*required if no CIDR) |
| `transitGatewayArn` | `string` | No | Transit Gateway ARN for attachment |
| `internetGatewayEnabled` | `boolean` | Yes | Enable Internet Gateway |
| `natGatewayEnabled` | `boolean` | Yes | Enable NAT Gateway |
| `availabilityZoneCount` | `number` | Yes | Number of AZs to use |
| `subnets` | `object` | Yes | Subnet configuration |

### Subnet Configuration

```typescript
subnets: {
    [subnetName: string]: {
        type: 'public' | 'private' | 'transit-gateway';
        cidrPrefix: number; // Number of host bits for subnet size
        availabilityZones: string[];
    }
}
```

### Helper Methods

```typescript
// Get subnet IDs by name
const publicSubnets = vpc.getSubnetIdsByName("public");

// Get subnet IDs by type
const privateSubnets = vpc.getSubnetIdsByType("private");

// Get specific subnet ID
const firstPublicSubnet = vpc.getSubnetId("public", 0);
```

### Outputs

- `vpcId`: VPC ID
- `cidrBlock`: VPC CIDR block
- `internetGatewayId`: Internet Gateway ID (if enabled)
- `natGatewayIds`: NAT Gateway IDs (if enabled)
- `transitGatewayAttachmentId`: Transit Gateway attachment ID (if attached)
- `availabilityZones`: List of availability zones used

## ECR Component

The ECR component manages container registries with cross-region replication and organization sharing capabilities.

### Basic Usage

```typescript
import { ECRComponent } from "../components/ecr";

const ecr = new ECRComponent("my-ecr", {
    repositories: [
        {
            name: "web-app",
            shareWithOrganization: true,
            lifecyclePolicy: JSON.stringify({
                rules: [{
                    rulePriority: 1,
                    description: "Keep last 10 images",
                    selection: {
                        tagStatus: "any",
                        countType: "imageCountMoreThan",
                        countNumber: 10
                    },
                    action: { type: "expire" }
                }]
            }),
            tags: {
                Application: "web-app",
                Team: "frontend"
            }
        }
    ],
    replicationEnabled: true,
    sourceRegion: "us-east-1",
    destinationRegion: "us-west-2",
    tags: {
        Environment: "production"
    }
});
```

### Repository Specification

```typescript
interface ECRRepositorySpec {
    name: string;
    lifecyclePolicy?: string; // JSON string
    shareWithOrganization?: boolean;
    tags?: { [key: string]: string };
}
```

### Lifecycle Policy Examples

```typescript
// Keep last N images
const keepLastN = {
    rules: [{
        rulePriority: 1,
        description: "Keep last 10 images",
        selection: {
            tagStatus: "any",
            countType: "imageCountMoreThan",
            countNumber: 10
        },
        action: { type: "expire" }
    }]
};

// Keep production images longer
const productionPolicy = {
    rules: [{
        rulePriority: 1,
        description: "Keep last 20 production images",
        selection: {
            tagStatus: "tagged",
            tagPrefixList: ["v", "release"],
            countType: "imageCountMoreThan",
            countNumber: 20
        },
        action: { type: "expire" }
    }, {
        rulePriority: 2,
        description: "Keep last 5 development images",
        selection: {
            tagStatus: "tagged",
            tagPrefixList: ["dev", "feature"],
            countType: "imageCountMoreThan",
            countNumber: 5
        },
        action: { type: "expire" }
    }]
};
```

### Helper Methods

```typescript
// Get repository URL
const repoUrl = ecr.getRepositoryUrl("web-app");

// Get repository ARN
const repoArn = ecr.getRepositoryArn("web-app");
```

### Outputs

- `repositoryUrls`: Map of repository name to URL
- `repositoryArns`: Map of repository name to ARN
- `replicationConfiguration`: Replication configuration details

## Route53 Component

The Route53 component manages DNS hosted zones and records with support for both public and private zones.

### Basic Usage

```typescript
import { Route53Component } from "../components/route53";

const dns = new Route53Component("my-dns", {
    hostedZones: [
        {
            name: "example.com",
            comment: "Primary domain"
        },
        {
            name: "internal.example.com",
            private: true,
            vpcIds: ["vpc-12345678"],
            comment: "Internal services"
        }
    ],
    records: [
        {
            zoneName: "example.com",
            name: "www",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300
        },
        {
            zoneName: "example.com",
            name: "api",
            type: "CNAME",
            values: ["api-lb.us-east-1.elb.amazonaws.com"],
            ttl: 300
        }
    ],
    region: "us-east-1"
});
```

### Record Types

```typescript
// A record
{
    zoneName: "example.com",
    name: "www",
    type: "A",
    values: ["192.0.2.1", "192.0.2.2"],
    ttl: 300
}

// CNAME record
{
    zoneName: "example.com",
    name: "blog",
    type: "CNAME",
    values: ["www.example.com"],
    ttl: 300
}

// MX record
{
    zoneName: "example.com",
    name: "",
    type: "MX",
    values: ["10 mail.example.com", "20 mail2.example.com"],
    ttl: 3600
}

// Alias record (for AWS resources)
{
    zoneName: "example.com",
    name: "cdn",
    type: "A",
    values: [],
    aliasTarget: {
        name: "d123456789.cloudfront.net",
        zoneId: "Z2FDTNDATAQYW2",
        evaluateTargetHealth: false
    }
}
```

### Helper Methods

```typescript
// Get hosted zone ID
const zoneId = dns.getHostedZoneId("example.com");

// Get name servers
const nameServers = dns.getNameServers("example.com");

// Create additional records
const newRecord = dns.createRecord("additional-record", {
    zoneName: "example.com",
    name: "service",
    type: "A",
    values: ["192.0.2.99"],
    ttl: 300
});
```

### Outputs

- `hostedZoneIds`: Map of zone name to hosted zone ID
- `nameServers`: Map of zone name to name servers
- `recordFqdns`: Map of record names to FQDNs

## ACM Component

The ACM component manages SSL/TLS certificates with DNS validation support.

### Basic Usage

```typescript
import { ACMComponent } from "../components/acm";

const certificates = new ACMComponent("my-certificates", {
    region: "us-east-1",
    certificates: [
        {
            domainName: "*.example.com",
            subjectAlternativeNames: ["example.com"],
            validationMethod: "DNS",
            hostedZoneId: dns.getHostedZoneId("example.com")
        }
    ],
    tags: {
        Environment: "production"
    }
});
```

### Certificate Configuration

```typescript
interface CertificateSpec {
    domainName: string;
    subjectAlternativeNames?: string[];
    validationMethod: 'DNS' | 'EMAIL';
    hostedZoneId?: string; // Required for DNS validation
}
```

### Multi-Domain Certificates

```typescript
const multiDomainCert = new ACMComponent("multi-domain-cert", {
    region: "us-east-1",
    certificates: [
        {
            domainName: "example.com",
            subjectAlternativeNames: [
                "www.example.com",
                "api.example.com",
                "app.example.com"
            ],
            validationMethod: "DNS",
            hostedZoneId: dns.getHostedZoneId("example.com")
        }
    ]
});
```

### Helper Methods

```typescript
// Get certificate ARN
const certArn = certificates.getCertificateArn("*.example.com");
```

### Outputs

- `certificateArns`: Map of domain name to certificate ARN
- `validationRecords`: DNS validation records created

## RDS Global Database Component

The RDS Global Database component creates Aurora global databases with multi-region support.

### Basic Usage

```typescript
import { RDSGlobalComponent } from "../components/rds";

const database = new RDSGlobalComponent("my-global-db", {
    globalClusterIdentifier: "my-global-cluster",
    engine: "aurora-postgresql",
    engineVersion: "15.4",
    databaseName: "mydb",
    masterUsername: "admin",
    masterPassword: pulumi.secret("MySecurePassword123!"),
    regions: [
        {
            region: "us-east-1",
            isPrimary: true,
            subnetIds: primaryVpc.getSubnetIdsByName("database"),
            createSecurityGroup: true,
            securityGroupRules: [
                {
                    type: "ingress",
                    fromPort: 5432,
                    toPort: 5432,
                    protocol: "tcp",
                    cidrBlocks: ["10.0.0.0/16"],
                    description: "PostgreSQL access from VPC"
                }
            ],
            instanceClass: "db.r6g.large",
            instanceCount: 2
        }
    ],
    backupRetentionPeriod: 14,
    deletionProtection: true,
    storageEncrypted: true
});
```

### Regional Configuration

```typescript
interface RegionalConfig {
    region: string;
    isPrimary: boolean;
    subnetIds?: string[];           // Use existing subnets
    subnetGroupName?: string;       // Or use existing subnet group
    securityGroupIds?: string[];    // Use existing security groups
    createSecurityGroup?: boolean;  // Or create new security group
    securityGroupRules?: SecurityGroupRule[];
    instanceClass: string;
    instanceCount: number;
}
```

### Security Group Rules

```typescript
interface SecurityGroupRule {
    type: "ingress" | "egress";
    fromPort: number;
    toPort: number;
    protocol: string;
    cidrBlocks?: string[];
    securityGroupIds?: string[];
    description?: string;
}
```

### Helper Methods

```typescript
// Get cluster endpoint for specific region
const primaryEndpoint = database.getClusterEndpoint("us-east-1");

// Get reader endpoint for specific region
const readerEndpoint = database.getClusterReaderEndpoint("us-east-1");
```

### Outputs

- `globalClusterArn`: Global cluster ARN
- `primaryClusterEndpoint`: Primary cluster endpoint
- `primaryClusterReaderEndpoint`: Primary cluster reader endpoint
- `regionalClusters`: Map of region to cluster details

## EKS Component

The EKS component creates managed Kubernetes clusters with support for auto mode, managed node groups, and various addons.

### Basic Usage

```typescript
import { EKSComponent } from "../components/eks";

const cluster = new EKSComponent("my-cluster", {
    clusterName: "my-eks-cluster",
    version: "1.31",
    region: "us-east-1",
    subnetIds: vpc.getSubnetIdsByName("private"),
    endpointConfig: {
        privateAccess: true,
        publicAccess: true,
        publicAccessCidrs: ["0.0.0.0/0"]
    },
    enableCloudWatchLogging: true,
    logTypes: ["api", "audit"],
    nodeGroups: [
        {
            name: "general",
            instanceTypes: ["t3.medium"],
            scalingConfig: {
                minSize: 2,
                maxSize: 10,
                desiredSize: 3
            },
            diskSize: 50,
            capacityType: "ON_DEMAND"
        }
    ],
    addons: [
        "vpc-cni",
        "coredns",
        "kube-proxy",
        "aws-load-balancer-controller"
    ]
});
```

### Auto Mode Configuration

```typescript
const autoModeCluster = new EKSComponent("auto-mode-cluster", {
    clusterName: "auto-mode-cluster",
    version: "1.31",
    region: "us-west-2",
    autoModeEnabled: true,
    subnetIds: vpc.getSubnetIdsByName("private"),
    ec2NodeClasses: [{
        name: "default-nodeclass",
        amiFamily: "AL2023",
        instanceStorePolicy: "RAID0",
        subnetSelectorTerms: [{
            tags: { "karpenter.sh/discovery": "auto-mode-cluster" }
        }],
        securityGroupSelectorTerms: [{
            tags: { "karpenter.sh/discovery": "auto-mode-cluster" }
        }]
    }],
    nodePools: [{
        name: "general-pool",
        nodeClassRef: "default-nodeclass",
        requirements: [{
            key: "kubernetes.io/arch",
            operator: "In",
            values: ["amd64"]
        }],
        limits: {
            cpu: "1000",
            memory: "1000Gi"
        }
    }]
});
```

### Node Group Configuration

```typescript
interface NodeGroupConfig {
    name: string;
    instanceTypes: string[];
    scalingConfig: {
        minSize: number;
        maxSize: number;
        desiredSize: number;
    };
    diskSize?: number;
    capacityType?: "ON_DEMAND" | "SPOT";
    labels?: { [key: string]: string };
    taints?: Array<{
        key: string;
        value: string;
        effect: "NO_SCHEDULE" | "NO_EXECUTE" | "PREFER_NO_SCHEDULE";
    }>;
}
```

### Available Addons

- `vpc-cni`: Amazon VPC CNI plugin
- `coredns`: CoreDNS for DNS resolution
- `kube-proxy`: Kubernetes network proxy
- `aws-ebs-csi-driver`: EBS CSI driver for persistent volumes
- `aws-efs-csi-driver`: EFS CSI driver for shared storage
- `aws-load-balancer-controller`: AWS Load Balancer Controller

### Outputs

- `clusterName`: EKS cluster name
- `clusterEndpoint`: Cluster API endpoint
- `clusterArn`: Cluster ARN
- `kubeconfig`: Kubeconfig for cluster access
- `nodeGroupArns`: Map of node group names to ARNs

## Component Integration Patterns

### VPC + IPAM Integration

```typescript
// Create IPAM first
const ipam = new IPAMComponent("shared-ipam", {
    cidrBlocks: ["10.0.0.0/8"],
    shareWithOrganization: true,
    operatingRegions: ["us-east-1", "us-west-2"]
});

// Use IPAM in VPC
const vpc = new VPCComponent("ipam-vpc", {
    region: "us-east-1",
    ipamPoolArn: ipam.getPoolArn("us-east-1"),
    // ... other configuration
});
```

### DNS + ACM Integration

```typescript
// Create DNS first
const dns = new Route53Component("app-dns", {
    hostedZones: [{ name: "example.com" }]
});

// Use DNS zone for certificate validation
const certificates = new ACMComponent("app-certificates", {
    certificates: [{
        domainName: "*.example.com",
        validationMethod: "DNS",
        hostedZoneId: dns.getHostedZoneId("example.com")
    }]
});
```

### VPC + RDS Integration

```typescript
// Create VPC with database subnets
const vpc = new VPCComponent("db-vpc", {
    subnets: {
        database: {
            type: 'private',
            cidrPrefix: 8,
            availabilityZones: ["us-east-1a", "us-east-1b"]
        }
    }
});

// Use VPC subnets for RDS
const database = new RDSGlobalComponent("app-db", {
    regions: [{
        region: "us-east-1",
        isPrimary: true,
        subnetIds: vpc.getSubnetIdsByName("database"),
        securityGroupRules: [{
            type: "ingress",
            fromPort: 5432,
            toPort: 5432,
            protocol: "tcp",
            cidrBlocks: [vpc.cidrBlock]
        }]
    }]
});
```

## Best Practices

### 1. Resource Naming

Use consistent naming conventions:

```typescript
const environment = "production";
const project = "myapp";
const region = "us-east-1";

const vpc = new VPCComponent(`${project}-${environment}-vpc`, {
    tags: {
        Environment: environment,
        Project: project,
        Region: region
    }
});
```

### 2. Tag Management

Apply consistent tags across all resources:

```typescript
const commonTags = {
    Environment: "production",
    Project: "myapp",
    Team: "platform",
    CostCenter: "engineering",
    ManagedBy: "pulumi"
};

// Apply to all components
const vpc = new VPCComponent("my-vpc", {
    tags: commonTags
});
```

### 3. Security Best Practices

- Use private subnets for workloads
- Implement least-privilege security groups
- Enable encryption at rest and in transit
- Use secrets management for sensitive data

```typescript
// Secure RDS configuration
const database = new RDSGlobalComponent("secure-db", {
    masterPassword: pulumi.secret("SecurePassword123!"),
    storageEncrypted: true,
    deletionProtection: true,
    backupRetentionPeriod: 30,
    regions: [{
        securityGroupRules: [{
            type: "ingress",
            fromPort: 5432,
            toPort: 5432,
            protocol: "tcp",
            cidrBlocks: ["10.0.0.0/16"], // Restrict to VPC only
            description: "PostgreSQL access from VPC"
        }]
    }]
});
```

### 4. Cost Optimization

- Use appropriate instance sizes
- Implement lifecycle policies for ECR
- Use spot instances where appropriate
- Enable cost allocation tags

```typescript
// Cost-optimized EKS configuration
const cluster = new EKSComponent("cost-optimized-cluster", {
    nodeGroups: [{
        name: "spot-nodes",
        instanceTypes: ["t3.medium", "t3.large"], // Multiple types for better spot availability
        capacityType: "SPOT",
        scalingConfig: {
            minSize: 1,
            maxSize: 10,
            desiredSize: 3
        }
    }],
    enableCloudWatchLogging: false, // Disable if not needed
    tags: {
        CostOptimized: "true"
    }
});
```

### 5. Multi-Region Deployment

Plan for multi-region deployments from the start:

```typescript
const regions = ["us-east-1", "us-west-2"];

// Create IPAM for all regions
const ipam = new IPAMComponent("global-ipam", {
    operatingRegions: regions
});

// Create VPCs in each region
const vpcs = regions.map(region => 
    new VPCComponent(`vpc-${region}`, {
        region: region,
        ipamPoolArn: ipam.getPoolArn(region)
    })
);
```

### 6. Environment Separation

Use different configurations for different environments:

```typescript
const config = new pulumi.Config();
const environment = config.require("environment");

const instanceConfig = {
    development: {
        instanceTypes: ["t3.small"],
        minSize: 1,
        maxSize: 3
    },
    production: {
        instanceTypes: ["m5.large"],
        minSize: 3,
        maxSize: 20
    }
};

const cluster = new EKSComponent("app-cluster", {
    nodeGroups: [{
        name: "app-nodes",
        ...instanceConfig[environment]
    }]
});
```

This guide provides comprehensive documentation for using all AWS infrastructure components. For more specific examples, see the example stack implementations in the `examples/` directory.