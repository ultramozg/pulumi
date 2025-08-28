import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { TransitGateway } from "../components/transitGateway";
import { VPC } from "../components/vpc";
import { EKS } from "../components/eks";

// Get configuration
const config = new pulumi.Config("shared-services");
const awsConfig = new pulumi.Config("aws");

const primaryRegion = config.require("primaryRegion");
const secondaryRegion = config.require("secondaryRegion");
const currentRegion = awsConfig.require("region");
const isPrimary = config.getBoolean("isPrimary") ?? (currentRegion === primaryRegion);

const transitGatewayAsn = config.getNumber("transitGatewayAsn") || 64512;
const hubVpcCidr = config.require("hubVpcCidr");
const eksClusterName = config.require("eksClusterName");

// Create Transit Gateway for network connectivity
const transitGateway = new TransitGateway(`transit-gateway-${currentRegion}`, {
    description: `Transit Gateway for shared services in ${currentRegion}`,
    amazonSideAsn: transitGatewayAsn,
    tags: {
        Name: `shared-services-tgw-${currentRegion}`,
        Region: currentRegion,
        IsPrimary: isPrimary.toString()
    },
});

// Create Hub VPC for shared services
const hubVpc = new VPC(`hub-vpc-${currentRegion}`, {
    region: currentRegion,
    cidrBlock: hubVpcCidr,
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
        }
    },
    tags: {
        Name: `shared-services-hub-vpc-${currentRegion}`,
        Region: currentRegion,
        IsPrimary: isPrimary.toString()
    }
});

// Attach Hub VPC to Transit Gateway
const hubVpcAttachment = new aws.ec2transitgateway.VpcAttachment(`hub-vpc-attachment-${currentRegion}`, {
    transitGatewayId: transitGateway.id,
    vpcId: hubVpc.vpcId,
    subnetIds: hubVpc.privateSubnetIds,
    tags: {
        Name: `hub-vpc-attachment-${currentRegion}`,
        Region: currentRegion
    }
});

// Create EKS cluster for shared monitoring services
const sharedEksCluster = new EKS(`shared-eks-${currentRegion}`, {
    region: currentRegion,
    clusterName: eksClusterName,
    vpcId: hubVpc.vpcId,
    subnetIds: hubVpc.privateSubnetIds,
    autoModeEnabled: false,
    addons: ["vpc-cni", "coredns", "kube-proxy", "aws-load-balancer-controller"],
    nodeGroups: [
        {
            name: "monitoring-nodes",
            instanceTypes: ["m5.large", "m5.xlarge"],
            scalingConfig: {
                minSize: 2,
                maxSize: 10,
                desiredSize: 3
            },
            labels: {
                "node-type": "monitoring"
            }
        }
    ],
    tags: {
        Name: eksClusterName,
        Region: currentRegion,
        IsPrimary: isPrimary.toString(),
        Purpose: "shared-monitoring"
    }
});

// Share Transit Gateway with workloads account via RAM (only in primary region)
let ramShare: aws.ram.ResourceShare | undefined;
if (isPrimary) {
    ramShare = new aws.ram.ResourceShare(`tgw-share-${currentRegion}`, {
        name: `transit-gateway-share-${currentRegion}`,
        allowExternalPrincipals: true,
        tags: {
            Name: `tgw-share-${currentRegion}`,
            Purpose: "cross-account-networking"
        }
    });

    new aws.ram.ResourceAssociation(`tgw-resource-association-${currentRegion}`, {
        resourceArn: transitGateway.arn,
        resourceShareArn: ramShare.arn
    });

    // Associate with workloads account for cross-account resource sharing
    const workloadsAccountId = process.env.WORKLOADS_ACCOUNT_ID;
    if (workloadsAccountId) {
        new aws.ram.PrincipalAssociation(`tgw-principal-association-${currentRegion}`, {
            principal: workloadsAccountId,
            resourceShareArn: ramShare.arn
        });
    } else {
        console.warn("WORKLOADS_ACCOUNT_ID not set - RAM principal association skipped");
    }
}

// Export important values for cross-stack references
export const transitGatewayId = transitGateway.id;
export const transitGatewayArn = transitGateway.arn;
export const hubVpcId = hubVpc.vpcId;
export const hubVpcCidrBlock = hubVpc.cidrBlock;
export const hubPrivateSubnetIds = hubVpc.privateSubnetIds;
export const hubPublicSubnetIds = hubVpc.publicSubnetIds;
export const eksClusterId = sharedEksCluster.clusterId;
export const eksClusterEndpoint = sharedEksCluster.clusterEndpoint;
export const eksClusterArn = sharedEksCluster.clusterArn;
export const ramShareArn = ramShare?.arn;
export const region = currentRegion;
export const isPrimaryRegion = isPrimary;
