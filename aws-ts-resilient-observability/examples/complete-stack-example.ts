import * as pulumi from "@pulumi/pulumi";
import {
    IPAMComponent,
    VPCComponent,
    ECRComponent,
    Route53Component,
    ACMComponent,
    RDSGlobalComponent,
    EKSComponent
} from "../components";

/**
 * Complete Stack Example: Production-Ready Multi-Component Infrastructure
 * 
 * This example demonstrates how to create a complete production infrastructure
 * using all available components with proper integration and dependencies.
 */

// 1. Create IPAM for centralized IP management
const ipam = new IPAMComponent("production-ipam", {
    cidrBlocks: [
        "10.0.0.0/8",      // Primary private network
        "172.16.0.0/12"    // Secondary private network
    ],
    shareWithOrganization: true,
    operatingRegions: ["us-east-1", "us-west-2", "eu-west-1"],
    tags: {
        Environment: "production",
        Project: "complete-infrastructure",
        Team: "platform",
        CostCenter: "infrastructure"
    }
});

// 2. Create VPCs in multiple regions using IPAM
const primaryVpc = new VPCComponent("primary-vpc", {
    region: "us-east-1",
    ipamPoolArn: ipam.getPoolArn("us-east-1"),
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8, // /24 subnets
            availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"]
        },
        private: {
            type: 'private',
            cidrPrefix: 6, // /22 subnets (more IPs for workloads)
            availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"]
        },
        database: {
            type: 'private',
            cidrPrefix: 8, // /24 subnets
            availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"]
        }
    },
    tags: {
        Environment: "production",
        Region: "us-east-1",
        Purpose: "primary-workloads"
    }
});

const secondaryVpc = new VPCComponent("secondary-vpc", {
    region: "us-west-2",
    ipamPoolArn: ipam.getPoolArn("us-west-2"),
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8,
            availabilityZones: ["us-west-2a", "us-west-2b", "us-west-2c"]
        },
        private: {
            type: 'private',
            cidrPrefix: 6,
            availabilityZones: ["us-west-2a", "us-west-2b", "us-west-2c"]
        },
        database: {
            type: 'private',
            cidrPrefix: 8,
            availabilityZones: ["us-west-2a", "us-west-2b", "us-west-2c"]
        }
    },
    tags: {
        Environment: "production",
        Region: "us-west-2",
        Purpose: "secondary-workloads"
    }
});

// 3. Create ECR repositories for container images
const containerRegistry = new ECRComponent("production-ecr", {
    repositories: [
        {
            name: "web-frontend",
            shareWithOrganization: true,
            lifecyclePolicy: JSON.stringify({
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
            }),
            tags: {
                Application: "web-frontend",
                Team: "frontend"
            }
        },
        {
            name: "api-backend",
            shareWithOrganization: true,
            lifecyclePolicy: JSON.stringify({
                rules: [{
                    rulePriority: 1,
                    description: "Keep last 15 images",
                    selection: {
                        tagStatus: "any",
                        countType: "imageCountMoreThan",
                        countNumber: 15
                    },
                    action: { type: "expire" }
                }]
            }),
            tags: {
                Application: "api-backend",
                Team: "backend"
            }
        },
        {
            name: "data-processor",
            shareWithOrganization: false,
            tags: {
                Application: "data-processor",
                Team: "data-engineering"
            }
        }
    ],
    replicationEnabled: true,
    sourceRegion: "us-east-1",
    destinationRegion: "us-west-2",
    tags: {
        Environment: "production",
        Purpose: "container-registry"
    }
});

// 4. Create DNS infrastructure
const dns = new Route53Component("production-dns", {
    hostedZones: [
        {
            name: "example.com",
            comment: "Primary production domain"
        },
        {
            name: "api.example.com",
            comment: "API subdomain"
        },
        {
            name: "internal.example.com",
            private: true,
            vpcIds: [primaryVpc.vpcId, secondaryVpc.vpcId],
            comment: "Internal services domain"
        }
    ],
    records: [
        // Public DNS records
        {
            zoneName: "example.com",
            name: "www",
            type: "A",
            values: ["192.0.2.1", "192.0.2.2"],
            ttl: 300
        },
        {
            zoneName: "api.example.com",
            name: "",
            type: "A",
            values: ["192.0.2.10"],
            ttl: 300
        },
        // Internal DNS records
        {
            zoneName: "internal.example.com",
            name: "database",
            type: "CNAME",
            values: ["rds-cluster.internal.example.com"],
            ttl: 300
        }
    ],
    region: "us-east-1",
    tags: {
        Environment: "production",
        Purpose: "dns-management"
    }
});

// 5. Create SSL certificates
const certificates = new ACMComponent("production-certificates", {
    region: "us-east-1",
    certificates: [
        {
            domainName: "*.example.com",
            subjectAlternativeNames: ["example.com"],
            validationMethod: "DNS",
            hostedZoneId: dns.getHostedZoneId("example.com")
        },
        {
            domainName: "*.api.example.com",
            subjectAlternativeNames: ["api.example.com"],
            validationMethod: "DNS",
            hostedZoneId: dns.getHostedZoneId("api.example.com")
        }
    ],
    tags: {
        Environment: "production",
        Purpose: "ssl-certificates"
    }
});

// 6. Create RDS Global Database
const database = new RDSGlobalComponent("production-database", {
    globalClusterIdentifier: "production-global-db",
    engine: "aurora-postgresql",
    engineVersion: "15.4",
    databaseName: "productiondb",
    masterUsername: "dbadmin",
    masterPassword: pulumi.secret("SecureProductionPassword123!"),
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
                    cidrBlocks: [primaryVpc.cidrBlock],
                    description: "PostgreSQL access from primary VPC"
                }
            ],
            instanceClass: "db.r6g.xlarge",
            instanceCount: 2
        },
        {
            region: "us-west-2",
            isPrimary: false,
            subnetIds: secondaryVpc.getSubnetIdsByName("database"),
            createSecurityGroup: true,
            securityGroupRules: [
                {
                    type: "ingress",
                    fromPort: 5432,
                    toPort: 5432,
                    protocol: "tcp",
                    cidrBlocks: [secondaryVpc.cidrBlock],
                    description: "PostgreSQL access from secondary VPC"
                }
            ],
            instanceClass: "db.r6g.large",
            instanceCount: 1
        }
    ],
    backupRetentionPeriod: 30,
    deletionProtection: true,
    storageEncrypted: true,
    tags: {
        Environment: "production",
        Purpose: "global-database"
    }
});

// 7. Create EKS clusters in both regions
const primaryEks = new EKSComponent("primary-eks", {
    clusterName: "production-primary",
    version: "1.31",
    region: "us-east-1",
    subnetIds: primaryVpc.getSubnetIdsByName("private"),
    endpointConfig: {
        privateAccess: true,
        publicAccess: true,
        publicAccessCidrs: ["10.0.0.0/8"]
    },
    enableCloudWatchLogging: true,
    logTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"],
    nodeGroups: [
        {
            name: "system-nodes",
            instanceTypes: ["t3.medium"],
            scalingConfig: {
                minSize: 3,
                maxSize: 6,
                desiredSize: 3
            },
            diskSize: 50,
            capacityType: "ON_DEMAND"
        },
        {
            name: "application-nodes",
            instanceTypes: ["m5.large", "m5.xlarge"],
            scalingConfig: {
                minSize: 2,
                maxSize: 20,
                desiredSize: 5
            },
            diskSize: 100,
            capacityType: "SPOT"
        }
    ],
    addons: [
        "vpc-cni",
        "coredns",
        "kube-proxy",
        "aws-ebs-csi-driver",
        "aws-load-balancer-controller"
    ],
    tags: {
        Environment: "production",
        Region: "us-east-1",
        Purpose: "primary-kubernetes"
    }
});

const secondaryEks = new EKSComponent("secondary-eks", {
    clusterName: "production-secondary",
    version: "1.31",
    region: "us-west-2",
    subnetIds: secondaryVpc.getSubnetIdsByName("private"),
    endpointConfig: {
        privateAccess: true,
        publicAccess: true,
        publicAccessCidrs: ["10.0.0.0/8"]
    },
    enableCloudWatchLogging: true,
    nodeGroups: [
        {
            name: "system-nodes",
            instanceTypes: ["t3.medium"],
            scalingConfig: {
                minSize: 2,
                maxSize: 4,
                desiredSize: 2
            },
            capacityType: "ON_DEMAND"
        },
        {
            name: "application-nodes",
            instanceTypes: ["m5.large"],
            scalingConfig: {
                minSize: 1,
                maxSize: 10,
                desiredSize: 3
            },
            capacityType: "SPOT"
        }
    ],
    addons: [
        "vpc-cni",
        "coredns",
        "kube-proxy",
        "aws-ebs-csi-driver"
    ],
    tags: {
        Environment: "production",
        Region: "us-west-2",
        Purpose: "secondary-kubernetes"
    }
});

// Export all outputs for use by other stacks or applications
export const infrastructureOutputs = {
    // IPAM outputs
    ipam: {
        id: ipam.ipamId,
        arn: ipam.ipamArn,
        poolIds: ipam.poolIds,
        poolArns: ipam.poolArns
    },
    
    // VPC outputs
    networking: {
        primary: {
            vpcId: primaryVpc.vpcId,
            cidrBlock: primaryVpc.cidrBlock,
            publicSubnets: primaryVpc.getSubnetIdsByName("public"),
            privateSubnets: primaryVpc.getSubnetIdsByName("private"),
            databaseSubnets: primaryVpc.getSubnetIdsByName("database"),
            internetGatewayId: primaryVpc.internetGatewayId,
            natGatewayIds: primaryVpc.natGatewayIds
        },
        secondary: {
            vpcId: secondaryVpc.vpcId,
            cidrBlock: secondaryVpc.cidrBlock,
            publicSubnets: secondaryVpc.getSubnetIdsByName("public"),
            privateSubnets: secondaryVpc.getSubnetIdsByName("private"),
            databaseSubnets: secondaryVpc.getSubnetIdsByName("database"),
            internetGatewayId: secondaryVpc.internetGatewayId,
            natGatewayIds: secondaryVpc.natGatewayIds
        }
    },
    
    // Container registry outputs
    containerRegistry: {
        repositoryUrls: containerRegistry.repositoryUrls,
        repositoryArns: containerRegistry.repositoryArns,
        webFrontendUrl: containerRegistry.getRepositoryUrl("web-frontend"),
        apiBackendUrl: containerRegistry.getRepositoryUrl("api-backend"),
        dataProcessorUrl: containerRegistry.getRepositoryUrl("data-processor")
    },
    
    // DNS outputs
    dns: {
        hostedZoneIds: dns.hostedZoneIds,
        nameServers: dns.nameServers,
        exampleComZoneId: dns.getHostedZoneId("example.com"),
        apiZoneId: dns.getHostedZoneId("api.example.com"),
        internalZoneId: dns.getHostedZoneId("internal.example.com")
    },
    
    // Certificate outputs
    certificates: {
        certificateArns: certificates.certificateArns,
        validationRecords: certificates.validationRecords
    },
    
    // Database outputs
    database: {
        globalClusterArn: database.globalClusterArn,
        primaryEndpoint: database.primaryClusterEndpoint,
        readerEndpoint: database.primaryClusterReaderEndpoint,
        regionalClusters: database.regionalClusters,
        primaryClusterEndpoint: database.getClusterEndpoint("us-east-1"),
        secondaryClusterEndpoint: database.getClusterEndpoint("us-west-2")
    },
    
    // Kubernetes outputs
    kubernetes: {
        primary: {
            clusterName: primaryEks.clusterName,
            clusterEndpoint: primaryEks.clusterEndpoint,
            clusterArn: primaryEks.clusterArn,
            kubeconfig: primaryEks.kubeconfig,
            nodeGroupArns: primaryEks.nodeGroupArns
        },
        secondary: {
            clusterName: secondaryEks.clusterName,
            clusterEndpoint: secondaryEks.clusterEndpoint,
            clusterArn: secondaryEks.clusterArn,
            kubeconfig: secondaryEks.kubeconfig,
            nodeGroupArns: secondaryEks.nodeGroupArns
        }
    }
};

// Export individual component references for advanced usage
export {
    ipam,
    primaryVpc,
    secondaryVpc,
    containerRegistry,
    dns,
    certificates,
    database,
    primaryEks,
    secondaryEks
};