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
 * Microservices Platform Stack Example
 * 
 * This example demonstrates how to create a comprehensive microservices
 * platform with:
 * - Multi-region networking with IPAM
 * - Service mesh ready EKS clusters
 * - Shared container registry
 * - Global database with read replicas
 * - Service discovery with Route 53
 * - SSL certificates for secure communication
 */

// Configuration
const config = new pulumi.Config();
const platformName = config.get("platformName") || "microservices-platform";
const environment = config.get("environment") || "production";
const primaryRegion = config.get("primaryRegion") || "us-east-1";
const secondaryRegion = config.get("secondaryRegion") || "us-west-2";
const domainName = config.require("domainName"); // e.g., "platform.company.com"

// 1. Create IPAM for centralized IP management across regions
const platformIPAM = new IPAMComponent("platform-ipam", {
    cidrBlocks: [
        "10.0.0.0/8",      // Large address space for microservices
        "172.16.0.0/12"    // Additional space for future expansion
    ],
    shareWithOrganization: true,
    operatingRegions: [primaryRegion, secondaryRegion],
    tags: {
        Environment: environment,
        Platform: platformName,
        Purpose: "microservices-networking"
    }
});

// 2. Create VPCs in both regions with service mesh considerations
const primaryVpc = new VPCComponent("primary-platform-vpc", {
    region: primaryRegion,
    ipamPoolArn: platformIPAM.getPoolArn(primaryRegion),
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8, // /24 subnets for load balancers
            availabilityZones: [`${primaryRegion}a`, `${primaryRegion}b`, `${primaryRegion}c`]
        },
        private: {
            type: 'private',
            cidrPrefix: 6, // /22 subnets for microservices (more IPs)
            availabilityZones: [`${primaryRegion}a`, `${primaryRegion}b`, `${primaryRegion}c`]
        },
        database: {
            type: 'private',
            cidrPrefix: 8, // /24 subnets for databases
            availabilityZones: [`${primaryRegion}a`, `${primaryRegion}b`, `${primaryRegion}c`]
        }
    },
    tags: {
        Environment: environment,
        Platform: platformName,
        Region: primaryRegion,
        Purpose: "primary-microservices"
    }
});

const secondaryVpc = new VPCComponent("secondary-platform-vpc", {
    region: secondaryRegion,
    ipamPoolArn: platformIPAM.getPoolArn(secondaryRegion),
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8,
            availabilityZones: [`${secondaryRegion}a`, `${secondaryRegion}b`, `${secondaryRegion}c`]
        },
        private: {
            type: 'private',
            cidrPrefix: 6,
            availabilityZones: [`${secondaryRegion}a`, `${secondaryRegion}b`, `${secondaryRegion}c`]
        },
        database: {
            type: 'private',
            cidrPrefix: 8,
            availabilityZones: [`${secondaryRegion}a`, `${secondaryRegion}b`, `${secondaryRegion}c`]
        }
    },
    tags: {
        Environment: environment,
        Platform: platformName,
        Region: secondaryRegion,
        Purpose: "secondary-microservices"
    }
});

// 3. Create shared container registry for all microservices
const microservicesRegistry = new ECRComponent("microservices-registry", {
    repositories: [
        // API Gateway service
        {
            name: "api-gateway",
            shareWithOrganization: true,
            lifecyclePolicy: JSON.stringify({
                rules: [{
                    rulePriority: 1,
                    description: "Keep last 30 production images",
                    selection: {
                        tagStatus: "tagged",
                        tagPrefixList: ["v", "release"],
                        countType: "imageCountMoreThan",
                        countNumber: 30
                    },
                    action: { type: "expire" }
                }]
            }),
            tags: { Service: "api-gateway", Team: "platform" }
        },
        // User service
        {
            name: "user-service",
            shareWithOrganization: true,
            lifecyclePolicy: JSON.stringify({
                rules: [{
                    rulePriority: 1,
                    description: "Keep last 20 images",
                    selection: {
                        tagStatus: "any",
                        countType: "imageCountMoreThan",
                        countNumber: 20
                    },
                    action: { type: "expire" }
                }]
            }),
            tags: { Service: "user-service", Team: "identity" }
        },
        // Order service
        {
            name: "order-service",
            shareWithOrganization: true,
            tags: { Service: "order-service", Team: "commerce" }
        },
        // Payment service
        {
            name: "payment-service",
            shareWithOrganization: true,
            tags: { Service: "payment-service", Team: "commerce" }
        },
        // Notification service
        {
            name: "notification-service",
            shareWithOrganization: true,
            tags: { Service: "notification-service", Team: "communications" }
        },
        // Analytics service
        {
            name: "analytics-service",
            shareWithOrganization: true,
            tags: { Service: "analytics-service", Team: "data" }
        }
    ],
    replicationEnabled: true,
    sourceRegion: primaryRegion,
    destinationRegion: secondaryRegion,
    tags: {
        Environment: environment,
        Platform: platformName,
        Purpose: "microservices-registry"
    }
});

// 4. Create DNS infrastructure for service discovery
const platformDns = new Route53Component("platform-dns", {
    hostedZones: [
        {
            name: domainName,
            comment: "Public API domain for microservices platform"
        },
        {
            name: `api.${domainName}`,
            comment: "API services subdomain"
        },
        {
            name: `internal.${domainName}`,
            private: true,
            vpcIds: [primaryVpc.vpcId, secondaryVpc.vpcId],
            comment: "Internal service discovery domain"
        }
    ],
    records: [
        // Public API records
        {
            zoneName: domainName,
            name: "api",
            type: "A",
            values: ["192.0.2.100"], // Placeholder for API Gateway load balancer
            ttl: 300
        },
        // Internal service discovery records
        {
            zoneName: `internal.${domainName}`,
            name: "user-service",
            type: "A",
            values: ["10.0.1.100"],
            ttl: 60
        },
        {
            zoneName: `internal.${domainName}`,
            name: "order-service",
            type: "A",
            values: ["10.0.1.101"],
            ttl: 60
        },
        {
            zoneName: `internal.${domainName}`,
            name: "payment-service",
            type: "A",
            values: ["10.0.1.102"],
            ttl: 60
        }
    ],
    region: primaryRegion,
    tags: {
        Environment: environment,
        Platform: platformName,
        Purpose: "service-discovery"
    }
});

// 5. Create SSL certificates for secure communication
const platformCertificates = new ACMComponent("platform-certificates", {
    region: primaryRegion,
    certificates: [
        {
            domainName: `*.${domainName}`,
            subjectAlternativeNames: [domainName],
            validationMethod: "DNS",
            hostedZoneId: platformDns.getHostedZoneId(domainName)
        },
        {
            domainName: `*.api.${domainName}`,
            subjectAlternativeNames: [`api.${domainName}`],
            validationMethod: "DNS",
            hostedZoneId: platformDns.getHostedZoneId(`api.${domainName}`)
        }
    ],
    tags: {
        Environment: environment,
        Platform: platformName,
        Purpose: "ssl-certificates"
    }
});

// 6. Create global database for shared data
const platformDatabase = new RDSGlobalComponent("platform-database", {
    globalClusterIdentifier: `${platformName}-global-db`,
    engine: "aurora-postgresql",
    engineVersion: "15.4",
    databaseName: "platformdb",
    masterUsername: "platformadmin",
    masterPassword: pulumi.secret("SecurePlatformPassword123!"),
    regions: [
        {
            region: primaryRegion,
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
            region: secondaryRegion,
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
        Environment: environment,
        Platform: platformName,
        Purpose: "shared-database"
    }
});

// 7. Create EKS clusters optimized for microservices
const primaryCluster = new EKSComponent("primary-microservices-cluster", {
    clusterName: `${platformName}-primary`,
    version: "1.31",
    region: primaryRegion,
    subnetIds: primaryVpc.getSubnetIdsByName("private"),
    endpointConfig: {
        privateAccess: true,
        publicAccess: true,
        publicAccessCidrs: ["10.0.0.0/8"] // Restrict to private networks
    },
    enableCloudWatchLogging: true,
    logTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"],
    nodeGroups: [
        {
            name: "system-services",
            instanceTypes: ["t3.medium"],
            scalingConfig: {
                minSize: 3,
                maxSize: 6,
                desiredSize: 3
            },
            diskSize: 50,
            capacityType: "ON_DEMAND",
            labels: {
                "node-type": "system"
            },
            taints: [{
                key: "system-services",
                value: "true",
                effect: "NO_SCHEDULE"
            }]
        },
        {
            name: "microservices",
            instanceTypes: ["m5.large", "m5.xlarge", "c5.large"],
            scalingConfig: {
                minSize: 5,
                maxSize: 50,
                desiredSize: 10
            },
            diskSize: 100,
            capacityType: "SPOT",
            labels: {
                "node-type": "microservices"
            }
        },
        {
            name: "data-services",
            instanceTypes: ["r5.large", "r5.xlarge"],
            scalingConfig: {
                minSize: 2,
                maxSize: 10,
                desiredSize: 3
            },
            diskSize: 200,
            capacityType: "ON_DEMAND",
            labels: {
                "node-type": "data-services"
            }
        }
    ],
    addons: [
        "vpc-cni",
        "coredns",
        "kube-proxy",
        "aws-ebs-csi-driver",
        "aws-load-balancer-controller",
        "aws-efs-csi-driver"
    ],
    tags: {
        Environment: environment,
        Platform: platformName,
        Region: primaryRegion,
        Purpose: "microservices-cluster"
    }
});

const secondaryCluster = new EKSComponent("secondary-microservices-cluster", {
    clusterName: `${platformName}-secondary`,
    version: "1.31",
    region: secondaryRegion,
    subnetIds: secondaryVpc.getSubnetIdsByName("private"),
    endpointConfig: {
        privateAccess: true,
        publicAccess: true,
        publicAccessCidrs: ["10.0.0.0/8"]
    },
    enableCloudWatchLogging: true,
    nodeGroups: [
        {
            name: "system-services",
            instanceTypes: ["t3.medium"],
            scalingConfig: {
                minSize: 2,
                maxSize: 4,
                desiredSize: 2
            },
            capacityType: "ON_DEMAND"
        },
        {
            name: "microservices",
            instanceTypes: ["m5.large", "c5.large"],
            scalingConfig: {
                minSize: 3,
                maxSize: 20,
                desiredSize: 5
            },
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
        Environment: environment,
        Platform: platformName,
        Region: secondaryRegion,
        Purpose: "microservices-cluster"
    }
});

// Export comprehensive outputs for microservices deployment
export const microservicesPlatformOutputs = {
    // Platform configuration
    platform: {
        name: platformName,
        environment: environment,
        primaryRegion: primaryRegion,
        secondaryRegion: secondaryRegion,
        domainName: domainName
    },
    
    // IPAM outputs
    ipam: {
        id: platformIPAM.ipamId,
        arn: platformIPAM.ipamArn,
        poolIds: platformIPAM.poolIds
    },
    
    // Networking outputs
    networking: {
        primary: {
            vpcId: primaryVpc.vpcId,
            cidrBlock: primaryVpc.cidrBlock,
            publicSubnets: primaryVpc.getSubnetIdsByName("public"),
            privateSubnets: primaryVpc.getSubnetIdsByName("private"),
            databaseSubnets: primaryVpc.getSubnetIdsByName("database")
        },
        secondary: {
            vpcId: secondaryVpc.vpcId,
            cidrBlock: secondaryVpc.cidrBlock,
            publicSubnets: secondaryVpc.getSubnetIdsByName("public"),
            privateSubnets: secondaryVpc.getSubnetIdsByName("private"),
            databaseSubnets: secondaryVpc.getSubnetIdsByName("database")
        }
    },
    
    // Container registry outputs
    containerRegistry: {
        repositoryUrls: microservicesRegistry.repositoryUrls,
        services: {
            apiGateway: microservicesRegistry.getRepositoryUrl("api-gateway"),
            userService: microservicesRegistry.getRepositoryUrl("user-service"),
            orderService: microservicesRegistry.getRepositoryUrl("order-service"),
            paymentService: microservicesRegistry.getRepositoryUrl("payment-service"),
            notificationService: microservicesRegistry.getRepositoryUrl("notification-service"),
            analyticsService: microservicesRegistry.getRepositoryUrl("analytics-service")
        }
    },
    
    // DNS and service discovery
    dns: {
        hostedZoneIds: platformDns.hostedZoneIds,
        publicZoneId: platformDns.getHostedZoneId(domainName),
        apiZoneId: platformDns.getHostedZoneId(`api.${domainName}`),
        internalZoneId: platformDns.getHostedZoneId(`internal.${domainName}`),
        nameServers: platformDns.nameServers
    },
    
    // SSL certificates
    certificates: {
        certificateArns: platformCertificates.certificateArns,
        mainCertificateArn: platformCertificates.getCertificateArn(`*.${domainName}`),
        apiCertificateArn: platformCertificates.getCertificateArn(`*.api.${domainName}`)
    },
    
    // Database outputs
    database: {
        globalClusterArn: platformDatabase.globalClusterArn,
        primaryEndpoint: platformDatabase.primaryClusterEndpoint,
        readerEndpoint: platformDatabase.primaryClusterReaderEndpoint,
        connectionStrings: {
            primary: pulumi.interpolate`postgresql://platformadmin:${platformDatabase.masterPassword}@${platformDatabase.primaryClusterEndpoint}:5432/platformdb`,
            secondary: pulumi.interpolate`postgresql://platformadmin:${platformDatabase.masterPassword}@${platformDatabase.getClusterEndpoint(secondaryRegion)}:5432/platformdb`
        }
    },
    
    // Kubernetes clusters
    kubernetes: {
        primary: {
            clusterName: primaryCluster.clusterName,
            clusterEndpoint: primaryCluster.clusterEndpoint,
            clusterArn: primaryCluster.clusterArn,
            kubeconfig: primaryCluster.kubeconfig
        },
        secondary: {
            clusterName: secondaryCluster.clusterName,
            clusterEndpoint: secondaryCluster.clusterEndpoint,
            clusterArn: secondaryCluster.clusterArn,
            kubeconfig: secondaryCluster.kubeconfig
        }
    }
};

// Export individual components for advanced usage
export {
    platformIPAM,
    primaryVpc,
    secondaryVpc,
    microservicesRegistry,
    platformDns,
    platformCertificates,
    platformDatabase,
    primaryCluster,
    secondaryCluster
};

// Example service deployment templates
export const serviceTemplates = {
    // API Gateway deployment
    apiGateway: {
        replicas: 3,
        image: pulumi.interpolate`${microservicesRegistry.getRepositoryUrl("api-gateway")}:latest`,
        resources: {
            requests: { cpu: "200m", memory: "256Mi" },
            limits: { cpu: "1000m", memory: "1Gi" }
        },
        nodeSelector: { "node-type": "microservices" }
    },
    
    // User service deployment
    userService: {
        replicas: 2,
        image: pulumi.interpolate`${microservicesRegistry.getRepositoryUrl("user-service")}:latest`,
        resources: {
            requests: { cpu: "100m", memory: "128Mi" },
            limits: { cpu: "500m", memory: "512Mi" }
        },
        nodeSelector: { "node-type": "microservices" }
    },
    
    // Data service deployment (analytics)
    analyticsService: {
        replicas: 2,
        image: pulumi.interpolate`${microservicesRegistry.getRepositoryUrl("analytics-service")}:latest`,
        resources: {
            requests: { cpu: "500m", memory: "1Gi" },
            limits: { cpu: "2000m", memory: "4Gi" }
        },
        nodeSelector: { "node-type": "data-services" }
    }
};