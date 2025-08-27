# AWS Infrastructure Components Examples

This directory contains comprehensive examples and documentation for using the AWS infrastructure components library. These examples demonstrate real-world usage patterns, best practices, and common deployment scenarios.

## 📁 Directory Structure

```
examples/
├── README.md                           # This file
├── COMPONENT_USAGE_GUIDE.md           # Detailed component usage documentation
├── TROUBLESHOOTING_GUIDE.md           # Common issues and solutions
├── complete-stack-example.ts          # Full production infrastructure example
├── simple-web-app-stack.ts           # Simple web application stack
├── microservices-platform-stack.ts   # Comprehensive microservices platform
├── deployment-configs/               # YAML deployment configurations
│   ├── simple-web-app.yaml          # Simple web app deployment config
│   ├── microservices-platform.yaml  # Microservices platform config
│   └── development-environment.yaml # Cost-optimized dev environment
├── deployment-config.yaml           # Original comprehensive deployment config
├── ecr-example.ts                   # ECR component examples
├── eks-example.ts                   # EKS component examples
├── ipam-example.ts                  # IPAM component examples
├── rds-example.ts                   # RDS Global Database examples
├── route53-example.ts               # Route53 DNS examples
└── vpc-example.ts                   # VPC component examples
```

## 🚀 Quick Start

### 1. Choose Your Deployment Approach

#### Option A: Use Complete Stack Examples (Recommended for beginners)

```typescript
// Import and use a complete stack
import { infrastructureOutputs } from "./examples/complete-stack-example";

// All components are pre-configured and integrated
console.log("VPC ID:", infrastructureOutputs.networking.primary.vpcId);
console.log("EKS Cluster:", infrastructureOutputs.kubernetes.primary.clusterName);
```

#### Option B: Use Automation API with YAML Configuration

```bash
# Deploy using YAML configuration
npm run automation deploy --config examples/deployment-configs/simple-web-app.yaml

# Or for microservices platform
npm run automation deploy --config examples/deployment-configs/microservices-platform.yaml
```

#### Option C: Build Custom Stack with Individual Components

```typescript
// Use individual component examples as building blocks
import { VPCComponent, EKSComponent } from "../components";

// See individual component examples for detailed usage
```

### 2. Set Required Configuration

```bash
# Set required Pulumi configuration
pulumi config set domainName "myapp.example.com"
pulumi config set environment "production"
pulumi config set region "us-east-1"

# Set sensitive values as secrets
pulumi config set --secret databasePassword "MySecurePassword123!"
```

### 3. Deploy Infrastructure

```bash
# Preview changes
pulumi preview

# Deploy infrastructure
pulumi up

# Check outputs
pulumi stack output
```

## 📚 Example Categories

### Complete Infrastructure Examples

#### 1. **Complete Stack Example** (`complete-stack-example.ts`)
- **Use Case**: Production-ready multi-component infrastructure
- **Components**: IPAM, VPC (multi-region), ECR, Route53, ACM, RDS Global, EKS (multi-region)
- **Features**: 
  - Multi-region deployment
  - Cross-region replication
  - Global database with read replicas
  - SSL certificates with DNS validation
  - Container registry with lifecycle policies

```typescript
// Quick deployment
import { infrastructureOutputs } from "./examples/complete-stack-example";

// Access any component output
const primaryVpcId = infrastructureOutputs.networking.primary.vpcId;
const databaseEndpoint = infrastructureOutputs.database.primaryEndpoint;
```

#### 2. **Simple Web App Stack** (`simple-web-app-stack.ts`)
- **Use Case**: Simple but production-ready web application
- **Components**: VPC, ECR, Route53, ACM, EKS
- **Features**:
  - Single region deployment
  - Cost-optimized configuration
  - Kubernetes manifests included
  - SSL certificate automation

#### 3. **Microservices Platform** (`microservices-platform-stack.ts`)
- **Use Case**: Comprehensive microservices platform
- **Components**: IPAM, VPC (multi-region), ECR (multiple repos), Route53, ACM, RDS Global, EKS (multi-region)
- **Features**:
  - Service mesh ready
  - Multiple container repositories
  - Internal service discovery
  - Multi-region active-active setup

### Individual Component Examples

Each component has dedicated examples showing various configuration options:

- **IPAM**: Organization sharing, multi-region pools
- **VPC**: IPAM integration, Transit Gateway attachment, flexible subnets
- **ECR**: Cross-region replication, lifecycle policies, organization sharing
- **Route53**: Public/private zones, various record types, alias records
- **ACM**: DNS validation, multi-domain certificates
- **RDS**: Global databases, multi-region, security group automation
- **EKS**: Auto mode, managed node groups, multiple addons

### Deployment Configuration Examples

YAML-based deployment configurations for the automation API:

#### 1. **Simple Web App** (`deployment-configs/simple-web-app.yaml`)
```yaml
name: "simple-web-app-deployment"
parameters:
  domainName: "myapp.example.com"
  environment: "production"
stacks:
  - name: "networking"
    components:
      - type: "vpc"
        config:
          cidrBlock: "10.0.0.0/16"
```

#### 2. **Development Environment** (`deployment-configs/development-environment.yaml`)
- Cost-optimized configuration
- Spot instances
- Minimal logging
- Short resource retention

## 🛠️ Usage Patterns

### Pattern 1: Infrastructure as Code with TypeScript

```typescript
import { VPCComponent, EKSComponent } from "../components";

// Define infrastructure programmatically
const vpc = new VPCComponent("my-vpc", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    // ... configuration
});

const cluster = new EKSComponent("my-cluster", {
    subnetIds: vpc.getSubnetIdsByName("private"),
    // ... configuration
});

// Export outputs
export const vpcId = vpc.vpcId;
export const clusterEndpoint = cluster.clusterEndpoint;
```

### Pattern 2: Automation API with YAML

```yaml
# deployment.yaml
name: "my-infrastructure"
stacks:
  - name: "networking"
    components:
      - type: "vpc"
        config:
          cidrBlock: "10.0.0.0/16"
  - name: "compute"
    dependencies: ["networking"]
    components:
      - type: "eks"
        config:
          subnetIds: "${networking.vpc.privateSubnets}"
```

```bash
# Deploy with automation API
npm run automation deploy --config deployment.yaml
```

### Pattern 3: Component Composition

```typescript
// Create reusable infrastructure patterns
export function createWebAppInfrastructure(name: string, config: WebAppConfig) {
    const vpc = new VPCComponent(`${name}-vpc`, config.vpc);
    const ecr = new ECRComponent(`${name}-ecr`, config.ecr);
    const cluster = new EKSComponent(`${name}-cluster`, {
        ...config.eks,
        subnetIds: vpc.getSubnetIdsByName("private")
    });
    
    return { vpc, ecr, cluster };
}

// Use the pattern
const webApp = createWebAppInfrastructure("my-app", {
    vpc: { cidrBlock: "10.0.0.0/16" },
    ecr: { repositories: [{ name: "web-app" }] },
    eks: { nodeGroups: [{ name: "app-nodes" }] }
});
```

## 🏗️ Architecture Patterns

### Multi-Region Active-Active

```typescript
const regions = ["us-east-1", "us-west-2"];

// Create IPAM for all regions
const ipam = new IPAMComponent("global-ipam", {
    operatingRegions: regions
});

// Create VPCs in each region
const vpcs = regions.map(region => 
    new VPCComponent(`vpc-${region}`, {
        region,
        ipamPoolArn: ipam.getPoolArn(region)
    })
);

// Create EKS clusters in each region
const clusters = regions.map((region, index) => 
    new EKSComponent(`cluster-${region}`, {
        region,
        subnetIds: vpcs[index].getSubnetIdsByName("private")
    })
);
```

### Hub and Spoke with Transit Gateway

```typescript
// Hub VPC with shared services
const hubVpc = new VPCComponent("hub-vpc", {
    cidrBlock: "10.0.0.0/16",
    transitGatewayArn: transitGateway.arn
});

// Spoke VPCs for different environments
const spokeVpcs = ["dev", "staging", "prod"].map(env => 
    new VPCComponent(`${env}-vpc`, {
        cidrBlock: `10.${env === "dev" ? 1 : env === "staging" ? 2 : 3}.0.0/16`,
        transitGatewayArn: transitGateway.arn
    })
);
```

### Microservices with Service Mesh

```typescript
// Platform infrastructure
const platform = new VPCComponent("platform-vpc", {
    subnets: {
        private: { type: 'private', cidrPrefix: 6 }, // Large subnets for many services
        public: { type: 'public', cidrPrefix: 8 }
    }
});

// Service mesh ready EKS
const cluster = new EKSComponent("service-mesh-cluster", {
    nodeGroups: [
        { name: "system", /* system services */ },
        { name: "services", /* microservices */ },
        { name: "data", /* data services */ }
    ],
    addons: ["vpc-cni", "coredns", "aws-load-balancer-controller"]
});
```

## 🔧 Configuration Management

### Environment-Specific Configuration

```typescript
const config = new pulumi.Config();
const environment = config.require("environment");

const environmentConfigs = {
    development: {
        instanceTypes: ["t3.small"],
        minSize: 1,
        maxSize: 3,
        enableLogging: false
    },
    production: {
        instanceTypes: ["m5.large", "m5.xlarge"],
        minSize: 3,
        maxSize: 20,
        enableLogging: true
    }
};

const cluster = new EKSComponent("app-cluster", {
    nodeGroups: [{
        name: "app-nodes",
        ...environmentConfigs[environment]
    }]
});
```

### Parameterized Deployments

```typescript
// Use Pulumi configuration
const config = new pulumi.Config();
const domainName = config.require("domainName");
const region = config.get("region") || "us-east-1";
const enableMultiRegion = config.getBoolean("enableMultiRegion") || false;

// Conditional resource creation
const secondaryVpc = enableMultiRegion ? 
    new VPCComponent("secondary-vpc", { region: "us-west-2" }) : 
    undefined;
```

## 📊 Monitoring and Observability

### Built-in Outputs

All examples include comprehensive outputs for monitoring:

```typescript
export const monitoringOutputs = {
    // Infrastructure health
    vpcId: vpc.vpcId,
    clusterEndpoint: cluster.clusterEndpoint,
    databaseEndpoint: database.primaryEndpoint,
    
    // Connectivity information
    publicSubnets: vpc.getSubnetIdsByName("public"),
    privateSubnets: vpc.getSubnetIdsByName("private"),
    
    // Security information
    securityGroups: cluster.nodeGroupSecurityGroups,
    
    // Application endpoints
    containerRepositories: ecr.repositoryUrls,
    dnsNameServers: dns.nameServers
};
```

### Health Checks

```typescript
// Add health check outputs
export const healthChecks = {
    vpc: vpc.vpcId.apply(id => `VPC ${id} is healthy`),
    cluster: cluster.clusterEndpoint.apply(endpoint => 
        `Cluster is accessible at ${endpoint}`
    ),
    database: database.primaryEndpoint.apply(endpoint => 
        `Database is accessible at ${endpoint}`
    )
};
```

## 🔍 Troubleshooting

### Common Issues and Solutions

1. **Permission Errors**: See [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md#security-and-permissions)
2. **Networking Issues**: See [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md#networking-issues)
3. **Component-Specific Problems**: See [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md#component-specific-issues)

### Debug Mode

```bash
# Enable debug logging
export PULUMI_LOG_LEVEL=debug
export PULUMI_LOG_TO_STDERR=true

# Run with verbose output
pulumi up --verbose
```

### Validation

```typescript
// Add validation to your stacks
function validateConfiguration(config: any) {
    if (!config.domainName) {
        throw new Error("domainName is required");
    }
    
    if (!config.region || !/^[a-z]{2}-[a-z]+-\d+$/.test(config.region)) {
        throw new Error("Invalid region format");
    }
}
```

## 📈 Best Practices

### 1. Resource Naming

```typescript
const environment = "production";
const project = "myapp";

const vpc = new VPCComponent(`${project}-${environment}-vpc`, {
    tags: {
        Environment: environment,
        Project: project,
        ManagedBy: "pulumi"
    }
});
```

### 2. Tag Management

```typescript
const commonTags = {
    Environment: environment,
    Project: project,
    Team: "platform",
    CostCenter: "engineering"
};

// Apply to all resources
const vpc = new VPCComponent("my-vpc", {
    tags: commonTags
});
```

### 3. Security

```typescript
// Use least privilege security groups
const databaseSG = new aws.ec2.SecurityGroup("database-sg", {
    ingress: [{
        fromPort: 5432,
        toPort: 5432,
        protocol: "tcp",
        cidrBlocks: [vpc.cidrBlock], // Only VPC access
        description: "PostgreSQL access from VPC"
    }]
});
```

### 4. Cost Optimization

```typescript
// Use appropriate instance types and spot instances
const cluster = new EKSComponent("cost-optimized-cluster", {
    nodeGroups: [{
        instanceTypes: ["t3.medium", "t3.large"],
        capacityType: "SPOT",
        scalingConfig: {
            minSize: 1,
            maxSize: 10,
            desiredSize: 3
        }
    }]
});
```

## 🚀 Getting Started Checklist

- [ ] Choose your deployment approach (TypeScript, YAML, or hybrid)
- [ ] Review the appropriate example for your use case
- [ ] Set required Pulumi configuration values
- [ ] Customize the example for your specific needs
- [ ] Review security and networking configurations
- [ ] Test deployment in a development environment
- [ ] Set up monitoring and alerting
- [ ] Document your customizations
- [ ] Deploy to production

## 📖 Additional Resources

- [Component Usage Guide](./COMPONENT_USAGE_GUIDE.md) - Detailed documentation for each component
- [Troubleshooting Guide](./TROUBLESHOOTING_GUIDE.md) - Common issues and solutions
- [Automation API Documentation](../automation/README.md) - Multi-stack deployment automation
- [Pulumi Documentation](https://www.pulumi.com/docs/) - Official Pulumi documentation
- [AWS Documentation](https://docs.aws.amazon.com/) - AWS service documentation

## 🤝 Contributing

To add new examples or improve existing ones:

1. Follow the established patterns and naming conventions
2. Include comprehensive documentation and comments
3. Add appropriate error handling and validation
4. Include outputs for monitoring and integration
5. Test thoroughly in multiple environments
6. Update this README with your new example

## 📝 License

These examples are provided under the same license as the main project. See the project root for license details.