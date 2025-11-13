import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { TransitGateway } from "../components/aws/transit-gateway";
import { VPCComponent } from "../components/aws/vpc";
import { IPAMComponent } from "../components/aws/ipam";
import { RAMShareComponent } from "../components/aws/ram-share";
// import { EKSComponent } from "../components/aws/eks";

// Get configuration from deployment config (set by automation)
const config = new pulumi.Config("shared-services");
const awsConfig = new pulumi.Config("aws");

const currentRegion = awsConfig.require("region");
const isPrimary = config.get("isprimary") === "true";

// All configuration comes from deployment-config.json via automation
const transitGatewayAsn = config.requireNumber("asn");
// const eksClusterName = config.require("clusterName");

// ============================================================================
// PRIMARY REGION RESOURCES
// ============================================================================
let ipam: IPAMComponent | undefined;
let ipamPoolId: pulumi.Output<string> | undefined;
let ipamPoolDependencies: pulumi.Resource[] = [];
let ramShare: aws.ram.ResourceShare | undefined;
let tgwResourceAssociation: aws.ram.ResourceAssociation | undefined;

// Check if cross-account sharing is needed
const workloadsRoleArn = process.env.WORKLOADS_ROLE_ARN;
const sharedServicesRoleArn = process.env.SHARED_SERVICES_ROLE_ARN;
const workloadsAccountId = workloadsRoleArn ? workloadsRoleArn.split(':')[4] : undefined;
const sharedServicesAccountId = sharedServicesRoleArn ? sharedServicesRoleArn.split(':')[4] : undefined;
const isCrossAccount = workloadsAccountId && sharedServicesAccountId && workloadsAccountId !== sharedServicesAccountId;
const enableRamSharing = config.getBoolean("enableRamSharing") ?? false;

// Secondary region: Create stack reference to primary (reused for IPAM and TGW peering)
let primaryStack: pulumi.StackReference | undefined;
let primaryRegion: string | undefined;

if (!isPrimary) {
    const org = pulumi.getOrganization();
    const project = pulumi.getProject();
    primaryStack = new pulumi.StackReference(`primary-stack-ref`, {
        name: `${org}/${project}/shared-services-primary`
    });
    primaryRegion = config.require("primaryRegion");
}

if (isPrimary) {
    // Get IPAM configuration from config
    const ipamCidrBlocks = config.getObject<string[]>("ipamCidrBlocks") ?? ["10.0.0.0/8"];
    const ipamOperatingRegions = config.getObject<string[]>("ipamOperatingRegions") ?? ["us-east-1", "us-west-2"];
    const ipamRegionalPoolNetmask = config.getNumber("ipamRegionalPoolNetmask") ?? 12;
    const ipamVpcAllocationNetmask = config.getNumber("ipamVpcAllocationNetmask") ?? 16;
    
    // Create IPAM only in primary region
    ipam = new IPAMComponent(`ipam-primary`, {
        region: currentRegion,
        cidrBlocks: ipamCidrBlocks,
        shareWithOrganization: false, // Set to true if using AWS Organizations
        operatingRegions: ipamOperatingRegions,
        regionalPoolNetmask: ipamRegionalPoolNetmask,
        vpcAllocationNetmask: ipamVpcAllocationNetmask,
        tags: {
            Name: `shared-services-ipam`,
            Purpose: "CentralizedIPManagement",
            IsPrimary: "true"
        }
    });

    // Get the IPAM pool resources (pool + CIDRs) for the current region
    const poolResources = ipam.getPoolResources(currentRegion);
    ipamPoolId = poolResources.pool.id;
    ipamPoolDependencies = [poolResources.pool, ...poolResources.cidrs];
    
    console.log(`Primary region ${currentRegion}: IPAM created for centralized IP management`);
} else {
    // Secondary region: Import IPAM pool ID from primary region stack
    const primaryIpamPoolIds = primaryStack!.getOutput("ipamPoolIds");
    
    // Extract the pool ID for the current (secondary) region
    ipamPoolId = pulumi.output(primaryIpamPoolIds).apply((pools: any) => {
        if (!pools || !pools[currentRegion]) {
            throw new Error(`IPAM pool not found for region ${currentRegion} in primary stack`);
        }
        return pools[currentRegion] as string;
    });
    
    console.log(`Secondary region ${currentRegion}: Using IPAM pool from primary region`);
}

// ============================================================================
// COMMON RESOURCES (Both Primary and Secondary)
// ============================================================================

// Get routing groups configuration from config (optional)
const enableRouteTableIsolation = config.getBoolean("enableRouteTableIsolation") ?? false;
const routingGroupsConfig = config.getObject<{ [key: string]: { allowedGroups?: string[]; description?: string; tags?: { [key: string]: string } } }>("routingGroups");

// Create Transit Gateway for network connectivity with routing groups
const transitGateway = new TransitGateway(`transit-gateway-${currentRegion}`, {
    description: `Transit Gateway for shared services in ${currentRegion}`,
    amazonSideAsn: transitGatewayAsn,
    enableRouteTableIsolation: enableRouteTableIsolation,
    routingGroups: routingGroupsConfig,
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
        IsPrimary: isPrimary.toString(),
        RoutingGroup: "hub"
    }
}, {
    // In primary region, VPC must wait for IPAM pool CIDRs to be provisioned
    dependsOn: ipamPoolDependencies.length > 0 ? ipamPoolDependencies : undefined
});

// Attach Hub VPC to Transit Gateway
// When routing groups are enabled, this attaches to the automatic "hub" routing group
// When disabled, this uses the default Transit Gateway route table
const hubVpcAttachment = transitGateway.attachVpc(`hub-vpc-attachment-${currentRegion}`, {
    vpcId: hubVpc.vpcId,
    subnetIds: hubVpc.getSubnetIdsByType('private'),
    routingGroup: "hub",
    tags: {
        Name: `hub-vpc-attachment-${currentRegion}`,
        Region: currentRegion,
        Purpose: "SharedServices"
    }
});

console.log(`${currentRegion}: Hub VPC attached to Transit Gateway${enableRouteTableIsolation ? ' with routing group isolation' : ' (default route table)'}`);

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

// ============================================================================
// PRIMARY REGION - RAM SHARING
// ============================================================================

if (isPrimary) {
    // Share Transit Gateway with workloads account via RAM (cross-account only)
    if (isCrossAccount && enableRamSharing) {
        console.log(`Primary region: Enabling RAM sharing - Shared Services (${sharedServicesAccountId}) -> Workloads (${workloadsAccountId})`);
        
        const ramShareComponent = new RAMShareComponent(`tgw-ram-${currentRegion}`, {
            name: `transit-gateway-share-${currentRegion}`,
            transitGatewayArn: transitGateway.transitGateway.arn,
            workloadsAccountId: workloadsAccountId,
            region: currentRegion,
            tags: {
                Environment: "production",
                ManagedBy: "Pulumi"
            }
        });
        
        ramShare = ramShareComponent.resourceShare;
        tgwResourceAssociation = ramShareComponent.resourceAssociation;
    } else if (isCrossAccount) {
        console.log(`Primary region: RAM sharing disabled. Set enableRamSharing=true to enable cross-account sharing.`);
    } else {
        console.log(`Primary region: Single-account deployment - Transit Gateway shared via stack outputs`);
    }
}

// ============================================================================
// SECONDARY REGION - TRANSIT GATEWAY PEERING
// ============================================================================
let tgwPeering: { 
    peeringAttachment: aws.ec2transitgateway.PeeringAttachment;
    peeringAccepter: aws.ec2transitgateway.PeeringAttachmentAccepter;
} | undefined;

if (!isPrimary) {
    // Create Transit Gateway peering to primary region using the component method
    const primaryTgwId = primaryStack!.getOutput("transitGatewayId");
    console.log(`Secondary region: Creating Transit Gateway peering to ${primaryRegion!}`);
    
    tgwPeering = transitGateway.createPeering(`tgw-${currentRegion}`, {
        peerTransitGatewayId: primaryTgwId,
        peerRegion: primaryRegion!,
        currentRegion: currentRegion,
        tags: {
            Environment: "production",
            ManagedBy: "Pulumi"
        }
    });
    
    console.log(`Secondary region: Transit Gateway peering established with ${primaryRegion!}`);
}

// Export important values for cross-stack references
export const transitGatewayId = transitGateway.transitGateway.id;
export const transitGatewayArn = transitGateway.transitGateway.arn;
export const transitGatewayIsolationEnabled = enableRouteTableIsolation;
export const transitGatewayRoutingGroups = enableRouteTableIsolation ? transitGateway.getRoutingGroups() : [];
export const hubVpcId = hubVpc.vpcId;
export const hubVpcCidrBlock = hubVpc.cidrBlock;
export const hubPrivateSubnetIds = hubVpc.getSubnetIdsByType('private');
export const hubPublicSubnetIds = hubVpc.getSubnetIdsByType('public');
export const hubVpcAttachmentId = hubVpcAttachment.id;
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

// Export Transit Gateway peering resources (only available in secondary region)
export const tgwPeeringAttachmentId = tgwPeering?.peeringAttachment.id;
export const tgwPeeringState = tgwPeering?.peeringAttachment.state;
