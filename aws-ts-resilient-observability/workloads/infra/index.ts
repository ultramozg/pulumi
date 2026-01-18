import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VPCComponent } from "../../components/aws/vpc";
import { EKSComponent } from "../../components/aws/eks";
import { RDSGlobalComponent } from "../../components/aws/rds";
import { Route53HostedZoneComponent, Route53RecordsComponent, Route53VpcAssociationComponent } from "../../components/aws/route53";

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

// Get shared services Transit Gateway ID, IPAM pool, routing configuration, and private hosted zone from stack reference
const org = pulumi.getOrganization();
const infraStackName = isPrimary ? "primary" : "secondary";
const sharedServicesStackRef = new pulumi.StackReference(`shared-services-infra-ref`, {
    name: `${org}/shared-services-infra/${infraStackName}`
});
const transitGatewayId = sharedServicesStackRef.getOutput("transitGatewayId");
const transitGatewayIsolationEnabled = sharedServicesStackRef.getOutput("transitGatewayIsolationEnabled");
const ipamPoolIds = sharedServicesStackRef.getOutput("ipamPoolIds");
const privateZoneId = sharedServicesStackRef.getOutput("privateZoneId");
const privateZoneName = sharedServicesStackRef.getOutput("privateZoneName");

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
    natGatewayStrategy: "regional", // Use single NAT Gateway for cost optimization
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

// ============================================================================
// PRIVATE HOSTED ZONE ASSOCIATION
// ============================================================================

// Associate workload VPC with shared-services private hosted zone
// This allows workloads to resolve internal service endpoints like:
// - loki.us-east-1.internal.srelog.dev
// - grafana.us-east-1.internal.srelog.dev
// - prometheus.us-east-1.internal.srelog.dev
const privateZoneAssociation = new Route53VpcAssociationComponent(`workload-zone-association-${currentRegion}`, {
    region: currentRegion,
    associations: [
        {
            zoneId: privateZoneId,
            vpcId: spokeVpc.vpcId,
            comment: `Associate workload VPC with shared-services private hosted zone for ${currentRegion}`
        }
    ],
    tags: {
        Name: `workload-zone-association-${currentRegion}`,
        Region: currentRegion,
        IsPrimary: isPrimary.toString(),
        Purpose: "dns-resolution"
    }
});

pulumi.all([privateZoneName, spokeVpc.vpcId]).apply(([zoneName, vpcId]) => {
    console.log(`${currentRegion}: Associating workload VPC ${vpcId} with private hosted zone ${zoneName}`);
});

// ============================================================================
// TRANSIT GATEWAY ATTACHMENT
// ============================================================================

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

// Get shared services role ARN from environment
const workloadsRoleArn = process.env.WORKLOADS_ROLE_ARN;

// Create EKS cluster for workloads with Auto Mode
const workloadEksCluster = new EKSComponent(`workload-eks-${currentRegion}`, {
    region: currentRegion,
    clusterName: eksClusterName,
    version: "1.34",
    vpcId: spokeVpc.vpcId,
    subnetIds: spokeVpc.getSubnetIdsByType("private"),
    autoMode: {
        enabled: true,
        nodePools: ["general-purpose", "system"]
    },
    addons: ["vpc-cni", "coredns", "kube-proxy", "aws-load-balancer-controller"],
    adminRoleArn: workloadsRoleArn, // Grant the deployment role cluster admin access
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
    const route53HostedZoneComponent = new Route53HostedZoneComponent(`route53-${currentRegion}`, {
        hostedZones: [
            {
                name: route53HostedZone,
                private: false
            }
        ]
    });

    // Create DNS records for the hosted zone
    const route53RecordsComponent = new Route53RecordsComponent(`route53-records-${currentRegion}`, {
        records: [
            {
                zoneId: route53HostedZoneComponent.getHostedZoneId(route53HostedZone),
                name: route53HostedZone,
                type: "A",
                values: ["1.2.3.4"], // Placeholder IP
                ttl: 300
            }
        ]
    });

    route53Resources = {
        hostedZoneIds: route53HostedZoneComponent.hostedZoneIds,
        nameServers: route53HostedZoneComponent.nameServers,
        recordFqdns: route53RecordsComponent.recordFqdns
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
export const workloadEksClusterCertificateAuthority = workloadEksCluster.kubeconfig.apply(kc => {
    const config = typeof kc === 'string' ? JSON.parse(kc) : kc;
    return config.clusters[0].cluster["certificate-authority-data"];
});
export const workloadEksOidcProviderArn = workloadEksCluster.oidcProviderArn;
export const workloadEksOidcProviderUrl = workloadEksCluster.oidcIssuerUrl;
export const workloadEksKubeconfig = workloadEksCluster.kubeconfig;
export const workloadRdsGlobalClusterIdentifier = rdsGlobalCluster.globalClusterIdentifier;
export const workloadRdsClusterEndpoint = rdsGlobalCluster.primaryClusterEndpoint;
export const transitGatewayAttachmentId = spokeVpcAttachment.id;
export const region = currentRegion;
export const isPrimaryRegion = isPrimary;
export const workloadRoute53Resources = route53Resources;

// Export private hosted zone association details
export const privateZoneAssociationIds = privateZoneAssociation.associationIds;
export const associatedPrivateZoneId = privateZoneId;
export const associatedPrivateZoneName = privateZoneName;
