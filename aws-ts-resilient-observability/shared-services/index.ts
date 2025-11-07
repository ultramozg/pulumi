import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { TransitGateway } from "../components/transitGateway";
import { VPCComponent } from "../components/vpc";
import { IPAMComponent } from "../components/ipam";
// import { EKSComponent } from "../components/eks";

// Get configuration from deployment config (set by automation)
const config = new pulumi.Config("shared-services");
const awsConfig = new pulumi.Config("aws");

const currentRegion = awsConfig.require("region");
const isPrimary = config.get("isprimary") === "true";

// All configuration comes from deployment-config.json via automation
const transitGatewayAsn = config.requireNumber("asn");
const hubVpcCidr = config.require("cidrBlock");
// const eksClusterName = config.require("clusterName");

// Create IPAM in primary region for centralized IP address management
let ipam: IPAMComponent | undefined;
let ipamPoolId: pulumi.Output<string> | undefined;
let ipamPoolDependencies: pulumi.Resource[] = [];

if (isPrimary) {
    // Create IPAM only in primary region
    ipam = new IPAMComponent(`ipam-primary`, {
        region: currentRegion,
        cidrBlocks: ["10.0.0.0/8"], // Large CIDR block for all VPCs across regions
        shareWithOrganization: false, // Set to true if using AWS Organizations
        operatingRegions: ["us-east-1", "us-west-2"], // Primary and secondary regions
        tags: {
            Name: `shared-services-ipam`,
            Purpose: "CentralizedIPManagement",
            IsPrimary: "true"
        }
    });

    // Get the IPAM pool resources (pool + CIDRs) for the current region
    const poolResources = ipam.getPoolResources(currentRegion);
    ipamPoolId = poolResources.pool.id;
    
    // VPC must wait for IPAM pool CIDRs to be provisioned
    ipamPoolDependencies = [poolResources.pool, ...poolResources.cidrs];
} else {
    // Secondary region: Import IPAM pool ID from primary region stack
    const primaryStack = new pulumi.StackReference("shared-services-primary");
    const primaryIpamPoolIds = primaryStack.getOutput("ipamPoolIds");
    
    // Extract the pool ID for the current (secondary) region
    ipamPoolId = pulumi.output(primaryIpamPoolIds).apply((pools: any) => {
        if (!pools || !pools[currentRegion]) {
            throw new Error(`IPAM pool not found for region ${currentRegion} in primary stack`);
        }
        return pools[currentRegion] as string;
    });
    
    console.log(`Secondary region ${currentRegion} will use IPAM pool from primary region`);
    // Secondary region doesn't need explicit dependencies since it imports from primary
}

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
// Both primary and secondary regions use IPAM for automatic CIDR allocation
const hubVpc = new VPCComponent(`hub-vpc-${currentRegion}`, {
    region: currentRegion,
    ipamPoolId: ipamPoolId, // Use IPAM pool from primary region (works for both regions)
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        },
        private: {
            type: "private", 
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        }
    },
    tags: {
        Name: `shared-services-hub-vpc-${currentRegion}`,
        Region: currentRegion,
        IsPrimary: isPrimary.toString()
    }
}, {
    // In primary region, VPC must wait for IPAM pool CIDRs to be provisioned
    dependsOn: ipamPoolDependencies.length > 0 ? ipamPoolDependencies : undefined
});

// Attach Hub VPC to Transit Gateway
const hubVpcAttachment = new aws.ec2transitgateway.VpcAttachment(`hub-vpc-attachment-${currentRegion}`, {
    transitGatewayId: transitGateway.transitGateway.id,
    vpcId: hubVpc.vpcId,
    subnetIds: hubVpc.getSubnetIdsByType('private'),
    tags: {
        Name: `hub-vpc-attachment-${currentRegion}`,
        Region: currentRegion
    }
}, {
    // Ensure proper deletion order
    deleteBeforeReplace: true,
    customTimeouts: {
        create: "10m",
        delete: "10m"
    }
});

// Create EKS cluster for shared monitoring services
// const sharedEksCluster = new EKSComponent(`shared-eks-${currentRegion}`, {
//     region: currentRegion,
//     clusterName: eksClusterName,
//     vpcId: hubVpc.vpcId,
//     subnetIds: hubVpc.getSubnetIdsByType('private'),
//     autoModeEnabled: false,
//     addons: ["vpc-cni", "coredns", "kube-proxy", "aws-load-balancer-controller"],
//     nodeGroups: [
//         {
//             name: "monitoring-nodes",
//             instanceTypes: ["m5.large", "m5.xlarge"],
//             scalingConfig: {
//                 minSize: 2,
//                 maxSize: 10,
//                 desiredSize: 3
//             },
//             tags: {
//                 "node-type": "monitoring"
//             }
//         }
//     ],
//     tags: {
//         Name: eksClusterName,
//         Region: currentRegion,
//         IsPrimary: isPrimary.toString(),
//         Purpose: "shared-monitoring"
//     }
// });

// Share Transit Gateway with workloads account via RAM (only for cross-account scenarios)
let ramShare: aws.ram.ResourceShare | undefined;
let tgwResourceAssociation: aws.ram.ResourceAssociation | undefined;

// Check if cross-account sharing is needed
const workloadsRoleArn = process.env.WORKLOADS_ROLE_ARN;
const sharedServicesRoleArn = process.env.SHARED_SERVICES_ROLE_ARN;

let workloadsAccountId: string | undefined;
let sharedServicesAccountId: string | undefined;

if (workloadsRoleArn) {
    const arnParts = workloadsRoleArn.split(':');
    if (arnParts.length >= 5) {
        workloadsAccountId = arnParts[4];
    }
}

if (sharedServicesRoleArn) {
    const arnParts = sharedServicesRoleArn.split(':');
    if (arnParts.length >= 5) {
        sharedServicesAccountId = arnParts[4];
    }
}

// Only create RAM resources if we have different accounts and we're in primary region
const isCrossAccount = workloadsAccountId && sharedServicesAccountId && workloadsAccountId !== sharedServicesAccountId;

// For now, disable RAM sharing to avoid deletion issues
// TODO: Re-enable once RAM resources are properly cleaned up
const enableRamSharing = config.getBoolean("enableRamSharing") ?? false;

if (isPrimary && isCrossAccount && enableRamSharing) {
    console.log(`Cross-account deployment detected: Shared Services (${sharedServicesAccountId}) -> Workloads (${workloadsAccountId})`);
    
    ramShare = new aws.ram.ResourceShare(`tgw-share-${currentRegion}`, {
        name: `transit-gateway-share-${currentRegion}`,
        allowExternalPrincipals: true,
        tags: {
            Name: `tgw-share-${currentRegion}`,
            Purpose: "cross-account-networking"
        }
    });

    tgwResourceAssociation = new aws.ram.ResourceAssociation(`tgw-resource-association-${currentRegion}`, {
        resourceArn: transitGateway.transitGateway.arn,
        resourceShareArn: ramShare.arn
    }, {
        dependsOn: [ramShare],
        deleteBeforeReplace: true,
        customTimeouts: {
            delete: "10m"
        }
    });

    // Associate with workloads account
    new aws.ram.PrincipalAssociation(`tgw-principal-association-${currentRegion}`, {
        principal: workloadsAccountId!,
        resourceShareArn: ramShare.arn
    }, {
        dependsOn: [ramShare, tgwResourceAssociation],
        deleteBeforeReplace: true,
        customTimeouts: {
            create: "10m",
            delete: "15m"
        }
    });
} else if (isPrimary && isCrossAccount) {
    console.log(`Cross-account deployment detected but RAM sharing disabled. Set enableRamSharing=true to enable.`);
    console.log(`Shared Services (${sharedServicesAccountId}) -> Workloads (${workloadsAccountId})`);
    transitGateway.transitGateway.id.apply(id => 
        console.log(`Transit Gateway ID will be shared via stack outputs: ${id}`)
    );
} else if (isPrimary) {
    console.log("Single-account deployment detected - Transit Gateway will be shared directly without RAM");
} else {
    console.log("Secondary region - no RAM sharing needed");
}

// Export important values for cross-stack references
export const transitGatewayId = transitGateway.transitGateway.id;
export const transitGatewayArn = transitGateway.transitGateway.arn;
export const hubVpcId = hubVpc.vpcId;
export const hubVpcCidrBlock = hubVpc.cidrBlock;
export const hubPrivateSubnetIds = hubVpc.getSubnetIdsByType('private');
export const hubPublicSubnetIds = hubVpc.getSubnetIdsByType('public');
// export const eksClusterId = sharedEksCluster.clusterName;
// export const eksClusterEndpoint = sharedEksCluster.clusterEndpoint;
// export const eksClusterArn = sharedEksCluster.clusterArn;
export const ramShareArn = ramShare?.arn;
export const isCrossAccountDeployment = isCrossAccount;
export const region = currentRegion;
export const isPrimaryRegion = isPrimary;

// Export IPAM resources (only available in primary region)
export const ipamId = ipam?.ipamId;
export const ipamArn = ipam?.ipamArn;
export const ipamPoolIds = ipam?.poolIds;
export const ipamScopeId = ipam?.scopeId;
