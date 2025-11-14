import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VPCComponent } from "../components/aws/vpc";
import { EKSComponent } from "../components/aws/eks";
import { RDSGlobalComponent } from "../components/aws/rds";
import { Route53Component } from "../components/aws/route53";

// Get configuration
const config = new pulumi.Config("workloads");
const awsConfig = new pulumi.Config("aws");

const primaryRegion = config.require("primaryRegion");
const secondaryRegion = config.require("secondaryRegion");
const currentRegion = awsConfig.require("region");
const isPrimary = config.getBoolean("isPrimary") ?? (currentRegion === primaryRegion);

const eksClusterName = config.require("eksClusterName");
const rdsGlobalClusterIdentifier = config.require("rdsGlobalClusterIdentifier");
const route53HostedZone = config.require("route53HostedZone");

// Get shared services Transit Gateway ID, IPAM pool, and routing configuration from stack reference
const sharedServicesStackRef = new pulumi.StackReference(`shared-services-${currentRegion}`);
const transitGatewayId = sharedServicesStackRef.getOutput("transitGatewayId");
const transitGatewayIsolationEnabled = sharedServicesStackRef.getOutput("transitGatewayIsolationEnabled");
const ipamPoolIds = sharedServicesStackRef.getOutput("ipamPoolIds");

// Extract IPAM pool ID for current region
const ipamPoolId = pulumi.output(ipamPoolIds).apply((pools: any) => {
    if (!pools || !pools[currentRegion]) {
        throw new Error(`IPAM pool not found for region ${currentRegion} in shared services stack`);
    }
    return pools[currentRegion] as string;
});

// Get routing group for this workload VPC (default to "production" if not specified)
const workloadRoutingGroup = config.get("routingGroup") ?? "production";

// Create Spoke VPC for workloads using IPAM for automatic CIDR allocation
const spokeVpc = new VPCComponent(`spoke-vpc-${currentRegion}`, {
    region: currentRegion,
    ipamPoolId: ipamPoolId, // Use IPAM pool from shared services
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: 3  // Create 3 subnets (one per AZ)
        },
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: 3  // Create 3 subnets (one per AZ)
        },
        database: {
            type: "private",
            subnetPrefix: 26,
            availabilityZones: 3  // Create 3 subnets (one per AZ)
        }
    },
    tags: {
        Name: `workloads-spoke-vpc-${currentRegion}`,
        Region: currentRegion,
        IsPrimary: isPrimary.toString(),
        RoutingGroup: workloadRoutingGroup
    }
});

// Create Transit Gateway attachment for spoke VPC
// Check if routing groups are enabled in shared services
let spokeVpcAttachment: aws.ec2transitgateway.VpcAttachment;

pulumi.output(transitGatewayIsolationEnabled).apply(isolationEnabled => {
    if (isolationEnabled) {
        console.log(`${currentRegion}: Routing groups enabled - attaching workload VPC to '${workloadRoutingGroup}' routing group`);
    } else {
        console.log(`${currentRegion}: Using default Transit Gateway route table`);
    }
});

// Create VPC attachment with routing group support
spokeVpcAttachment = new aws.ec2transitgateway.VpcAttachment(`spoke-vpc-attachment-${currentRegion}`, {
    transitGatewayId: transitGatewayId,
    vpcId: spokeVpc.vpcId,
    subnetIds: spokeVpc.getSubnetIdsByType("private"),
    // Disable default route table when using routing groups
    transitGatewayDefaultRouteTableAssociation: false,
    transitGatewayDefaultRouteTablePropagation: false,
    tags: {
        Name: `spoke-vpc-attachment-${currentRegion}`,
        Region: currentRegion,
        RoutingGroup: workloadRoutingGroup
    }
});

// Create EKS cluster for workloads
const workloadEksCluster = new EKSComponent(`workload-eks-${currentRegion}`, {
    region: currentRegion,
    clusterName: eksClusterName,
    version: "1.33",
    vpcId: spokeVpc.vpcId,
    subnetIds: spokeVpc.getSubnetIdsByType("private"),
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
            tags: {
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
const rdsGlobalCluster = new RDSGlobalComponent(`rds-global-${currentRegion}`, {
    globalClusterIdentifier: rdsGlobalClusterIdentifier,
    engine: "aurora-postgresql",
    regions: [
        {
            region: primaryRegion,
            isPrimary: true,
            subnetIds: ["subnet-placeholder1", "subnet-placeholder2"],
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
    const route53Component = new Route53Component(`route53-${currentRegion}`, {
        hostedZones: [
            {
                name: route53HostedZone,
                private: false
            }
        ],
        records: [
            {
                zoneName: route53HostedZone,
                name: route53HostedZone,
                type: "A",
                values: ["1.2.3.4"], // Placeholder IP
                ttl: 300
            }
        ]
    });
    
    route53Resources = {
        hostedZoneIds: route53Component.hostedZoneIds,
        nameServers: route53Component.nameServers,
        recordFqdns: route53Component.recordFqdns
    };
}

// Export important values for cross-stack references
export const spokeVpcId = spokeVpc.vpcId;
export const spokeVpcCidrBlock = spokeVpc.cidrBlock;
export const spokePrivateSubnetIds = spokeVpc.getSubnetIdsByType("private");
export const spokePublicSubnetIds = spokeVpc.getSubnetIdsByType("public");
export const spokeDatabaseSubnetIds = spokeVpc.getSubnetIdsByName("database");
export const workloadEksClusterName = workloadEksCluster.clusterName;
export const workloadEksClusterEndpoint = workloadEksCluster.clusterEndpoint;
export const workloadEksClusterArn = workloadEksCluster.clusterArn;
export const workloadRdsGlobalClusterIdentifier = rdsGlobalCluster.globalClusterIdentifier;
export const workloadRdsClusterEndpoint = rdsGlobalCluster.primaryClusterEndpoint;
export const transitGatewayAttachmentId = spokeVpcAttachment.id;
export const region = currentRegion;
export const isPrimaryRegion = isPrimary;
export const workloadRoute53Resources = route53Resources;

