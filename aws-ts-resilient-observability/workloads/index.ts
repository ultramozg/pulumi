import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VPC } from "../components/vpc";
import { EKS } from "../components/eks";
import { RDS } from "../components/rds";
import { Route53 } from "../components/route53";

// Get configuration
const config = new pulumi.Config("workloads");
const awsConfig = new pulumi.Config("aws");

const primaryRegion = config.require("primaryRegion");
const secondaryRegion = config.require("secondaryRegion");
const currentRegion = awsConfig.require("region");
const isPrimary = config.getBoolean("isPrimary") ?? (currentRegion === primaryRegion);

const spokeVpcCidr = config.require("spokeVpcCidr");
const eksClusterName = config.require("eksClusterName");
const rdsGlobalClusterIdentifier = config.require("rdsGlobalClusterIdentifier");
const route53HostedZone = config.require("route53HostedZone");

// Get shared services Transit Gateway ID from stack reference or environment
const sharedServicesStackRef = new pulumi.StackReference(`shared-services-${currentRegion}`);
const transitGatewayId = sharedServicesStackRef.getOutput("transitGatewayId");

// Create Spoke VPC for workloads
const spokeVpc = new VPC(`spoke-vpc-${currentRegion}`, {
    region: currentRegion,
    cidrBlock: spokeVpcCidr,
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            cidrPrefix: 24
        },
        private: {
            type: "private",
            cidrPrefix: 24
        },
        database: {
            type: "private",
            cidrPrefix: 26
        }
    },
    tags: {
        Name: `workloads-spoke-vpc-${currentRegion}`,
        Region: currentRegion,
        IsPrimary: isPrimary.toString()
    }
});

// Create Transit Gateway attachment for spoke VPC
const spokeVpcAttachment = new aws.ec2transitgateway.VpcAttachment(`spoke-vpc-attachment-${currentRegion}`, {
    transitGatewayId: transitGatewayId,
    vpcId: spokeVpc.vpcId,
    subnetIds: spokeVpc.privateSubnetIds,
    tags: {
        Name: `spoke-vpc-attachment-${currentRegion}`,
        Region: currentRegion
    }
});

// Create EKS cluster for workloads
const workloadEksCluster = new EKS(`workload-eks-${currentRegion}`, {
    region: currentRegion,
    clusterName: eksClusterName,
    vpcId: spokeVpc.vpcId,
    subnetIds: spokeVpc.privateSubnetIds,
    autoModeEnabled: false,
    addons: ["vpc-cni", "coredns", "kube-proxy", "aws-load-balancer-controller"],
    nodeGroups: [
        {
            name: "workload-nodes",
            instanceTypes: ["m5.large", "m5.xlarge"],
            scalingConfig: {
                minSize: 2,
                maxSize: 20,
                desiredSize: 4
            },
            labels: {
                "node-type": "workload"
            }
        }
    ],
    tags: {
        Name: eksClusterName,
        Region: currentRegion,
        IsPrimary: isPrimary.toString(),
        Purpose: "workload-processing"
    }
});

// Create RDS Aurora Global Database
const rdsGlobalCluster = new RDS(`rds-global-${currentRegion}`, {
    globalClusterIdentifier: rdsGlobalClusterIdentifier,
    engine: "aurora-postgresql",
    regions: [
        {
            region: primaryRegion,
            isPrimary: true,
            vpcId: spokeVpc.vpcId,
            subnetIds: spokeVpc.databaseSubnetIds || spokeVpc.privateSubnetIds,
            createSecurityGroup: true,
            allowedCidrBlocks: [spokeVpcCidr]
        },
        {
            region: secondaryRegion,
            isPrimary: false,
            // Note: This will reference the secondary region's VPC
            createSecurityGroup: true
        }
    ],
    tags: {
        Name: rdsGlobalClusterIdentifier,
        Region: currentRegion,
        IsPrimary: isPrimary.toString()
    }
});

// Create Route 53 hosted zone and health checks (only in primary region)
let route53Resources: any = {};
if (isPrimary) {
    const route53 = new Route53(`route53-${currentRegion}`, {
        hostedZones: [
            {
                name: route53HostedZone,
                private: false
            }
        ],
        healthChecks: [
            {
                name: `workload-health-${primaryRegion}`,
                fqdn: `${primaryRegion}.${route53HostedZone}`,
                type: "HTTPS",
                resourcePath: "/healthz",
                port: 443
            },
            {
                name: `workload-health-${secondaryRegion}`,
                fqdn: `${secondaryRegion}.${route53HostedZone}`,
                type: "HTTPS", 
                resourcePath: "/healthz",
                port: 443
            }
        ],
        records: [
            {
                name: route53HostedZone,
                type: "A",
                setIdentifier: `primary-${primaryRegion}`,
                failoverRoutingPolicy: {
                    type: "PRIMARY"
                },
                healthCheckId: `workload-health-${primaryRegion}`,
                alias: {
                    // This would be populated with ALB DNS name
                    name: "primary-alb.example.com",
                    zoneId: "Z123456789"
                }
            },
            {
                name: route53HostedZone,
                type: "A", 
                setIdentifier: `secondary-${secondaryRegion}`,
                failoverRoutingPolicy: {
                    type: "SECONDARY"
                },
                healthCheckId: `workload-health-${secondaryRegion}`,
                alias: {
                    // This would be populated with ALB DNS name
                    name: "secondary-alb.example.com",
                    zoneId: "Z987654321"
                }
            }
        ]
    });
    
    route53Resources = {
        hostedZoneId: route53.hostedZoneIds,
        healthCheckIds: route53.healthCheckIds
    };
}

// Export important values for cross-stack references
export const spokeVpcId = spokeVpc.vpcId;
export const spokeVpcCidrBlock = spokeVpc.cidrBlock;
export const spokePrivateSubnetIds = spokeVpc.privateSubnetIds;
export const spokePublicSubnetIds = spokeVpc.publicSubnetIds;
export const spokeDatabaseSubnetIds = spokeVpc.databaseSubnetIds;
export const eksClusterId = workloadEksCluster.clusterId;
export const eksClusterEndpoint = workloadEksCluster.clusterEndpoint;
export const eksClusterArn = workloadEksCluster.clusterArn;
export const rdsClusterIdentifier = rdsGlobalCluster.clusterIdentifier;
export const rdsClusterEndpoint = rdsGlobalCluster.clusterEndpoint;
export const transitGatewayAttachmentId = spokeVpcAttachment.id;
export const region = currentRegion;
export const isPrimaryRegion = isPrimary;
export const route53Resources = route53Resources;

