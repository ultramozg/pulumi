import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as namecheap from "pulumi-namecheap";
import * as k8s from "@pulumi/kubernetes";
import { TransitGateway } from "../components/aws/transit-gateway";
import { VPCComponent } from "../components/aws/vpc";
import { IPAMComponent } from "../components/aws/ipam";
import { RAMShareComponent } from "../components/aws/ram-share";
import { EKSComponent } from "../components/aws/eks";
import { Route53HostedZoneComponent, Route53VpcAssociationComponent } from "../components/aws/route53";
import { AcmCertificateComponent } from "../components/aws/acm";
import { CloudflareWarpComponent } from "../components/cloudflare/warp";
import { ObservabilityStackComponent } from "../components/observability";

// Get configuration from deployment config (set by automation)
const config = new pulumi.Config("shared-services");
const awsConfig = new pulumi.Config("aws");

const currentRegion = awsConfig.require("region");
const isPrimary = config.get("isprimary") === "true";

// All configuration comes from deployment-config.json via automation
const transitGatewayAsn = config.requireNumber("asn");
const eksClusterName = config.require("clusterName");

// ============================================================================
// PRIMARY REGION RESOURCES
// ============================================================================
let ipam: IPAMComponent | undefined;
let ipamPoolId: pulumi.Output<string> | undefined;
let ipamPoolDependencies: pulumi.Resource[] = [];
let ramShare: aws.ram.ResourceShare | undefined;

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
    // Get IPAM configuration from config - all values must be provided in deployment-config.json
    const ipamCidrBlocks = config.requireObject<string[]>("ipamCidrBlocks");
    const ipamOperatingRegions = config.requireObject<string[]>("ipamOperatingRegions");
    const ipamRegionalPoolNetmask = config.requireNumber("ipamRegionalPoolNetmask");
    const ipamVpcAllocationNetmask = config.requireNumber("ipamVpcAllocationNetmask");

    // Create IPAM only in primary region
    ipam = new IPAMComponent(`ipam-primary`, {
        region: currentRegion,
        cidrBlocks: ipamCidrBlocks,
        shareWithOrganization: false,
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
    ipamPoolId: ipamPoolId,
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: 3
        },
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: 3
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

// Collect all VPC CIDR blocks in this region for cross-region TGW peering
// This list is used to create static routes in peer regions
// As you add more VPCs (workload VPCs, etc.), add their CIDR blocks here
const allVpcCidrs = [hubVpc.cidrBlock];

// Create EKS cluster for shared monitoring services with Auto Mode
const sharedEksCluster = new EKSComponent(`shared-eks-${currentRegion}`, {
    region: currentRegion,
    clusterName: eksClusterName,
    version: "1.34",
    vpcId: hubVpc.vpcId,
    subnetIds: hubVpc.getSubnetIdsByType('private'),
    autoMode: {
        enabled: true,
        nodePools: ["general-purpose", "system"]
    },
    addons: ["vpc-cni", "coredns", "kube-proxy"],
    tags: {
        Name: eksClusterName,
        Region: currentRegion,
        IsPrimary: isPrimary.toString(),
        Purpose: "shared-monitoring"
    }
});

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
    // Create Transit Gateway peering to primary region with bidirectional static routes
    // Note: AWS does not support route propagation for peering attachments
    // This enables cross-region connectivity between routing groups using static routes
    const primaryTgwId = primaryStack!.getOutput("transitGatewayId");
    const primaryVpcCidrs = primaryStack!.getOutput("allVpcCidrBlocks");
    const primaryRouteTableIds = primaryStack!.getOutput("transitGatewayRouteTableIds");

    console.log(`Secondary region: Creating Transit Gateway peering to ${primaryRegion!}`);

    tgwPeering = transitGateway.createPeering(`tgw-${currentRegion}`, {
        peerTransitGatewayId: primaryTgwId,
        peerRegion: primaryRegion!,
        currentRegion: currentRegion,
        // Static routes are enabled by default for all routing groups
        // This allows VPCs in matching routing groups to communicate across regions
        // For example: production VPCs in us-east-1 can reach production VPCs in us-west-2
        enableCrossRegionRoutes: true,
        // IPAM-allocated CIDR blocks from the peer (primary) region
        // These are automatically collected from all VPCs using IPAM in the primary region
        // Routes to these CIDRs will be added to this region's route tables
        peerCidrs: primaryVpcCidrs as any,
        // IPAM-allocated CIDR blocks from the local (secondary) region
        // Routes to these CIDRs will be added to the peer region's route tables (bidirectional routing)
        localCidrs: allVpcCidrs,
        // Provide route table IDs in the peer region where routes to localCidrs should be added
        peerRouteTableIds: primaryRouteTableIds as any,
        // Optional: Specify which routing groups should have cross-region connectivity
        // If not specified, all routing groups will be connected
        // routeToGroups: ['hub', 'production'], // Uncomment to limit cross-region routing
        tags: {
            Environment: "production",
            ManagedBy: "Pulumi",
            CrossRegionRouting: "enabled"
        }
    });

    console.log(`Secondary region: Transit Gateway peering established with ${primaryRegion!} (bidirectional cross-region routing enabled)`);
}

// ============================================================================
// DNS AND CERTIFICATE SETUP
// ============================================================================

// DNS configuration from deployment-config.json (set by automation)
const baseDomain = config.require("baseDomain");
const parentDomain = config.require("parentDomain");
const enableCertificates = config.requireBoolean("enableCertificates");
const certificateValidationMethod = config.require("certificateValidationMethod");

// Get Namecheap credentials from Pulumi ESC (only if using Namecheap validation)
let namecheapProvider: namecheap.Provider | undefined;
if (certificateValidationMethod === "namecheap") {
    const apiUser = config.requireSecret("apiUser");
    const apiKey = config.requireSecret("apiKey");

    namecheapProvider = new namecheap.Provider("namecheap", {
        apiUser: apiUser,
        apiKey: apiKey,
        userName: apiUser,  // Same as apiUser (account that owns the domain)
        useSandbox: config.getBoolean("namecheapUseSandbox") ?? false,
    });
}

console.log(`${currentRegion}: Setting up DNS and certificates for ${baseDomain}`);

// Create shared private Route53 hosted zone for observability services
// This zone will be created once in the primary region and associated with VPCs in all regions
const sharedZoneName = baseDomain;

let privateZone: Route53HostedZoneComponent;

if (isPrimary) {
    // Primary region: Create the shared private hosted zone
    privateZone = new Route53HostedZoneComponent(`shared-internal-zone`, {
        region: currentRegion,
        hostedZones: [{
            name: sharedZoneName,
            private: true,
            vpcIds: [hubVpc.vpcId],
            comment: `Shared private zone for multi-region observability services (Loki, Tempo, Grafana, etc.)`,
        }],
        tags: {
            Environment: "production",
            Purpose: "observability-services",
            MultiRegion: "true",
            PrimaryRegion: currentRegion,
        },
    });

    console.log(`${currentRegion}: Shared private hosted zone created: ${sharedZoneName}`);
} else {
    // Secondary region: Import the hosted zone and associate it with this region's VPC
    // Reuse the primaryStack reference already created at the top of the file
    const hostedZoneId = primaryStack!.requireOutput("sharedHostedZoneId") as pulumi.Output<string>;

    // Use VPC Association component for cross-region zone association
    const vpcAssociation = new Route53VpcAssociationComponent(`${currentRegion}-zone-association`, {
        region: currentRegion,
        associations: [{
            zoneId: hostedZoneId,
            vpcId: hubVpc.vpcId,
            crossRegion: true,
            hostedZoneRegion: primaryRegion,
            comment: `Associate ${sharedZoneName} with ${currentRegion} VPC for cross-region observability services`
        }],
        tags: {
            Environment: "production",
            Purpose: "observability-cross-region-dns",
            SecondaryRegion: currentRegion,
            PrimaryRegion: primaryRegion!
        }
    });

    console.log(`${currentRegion}: Associated shared private hosted zone ${sharedZoneName} with VPC (via component)`);

    // Create a placeholder component to maintain the same structure
    privateZone = {} as Route53HostedZoneComponent;
}

// Create ACM wildcard certificate (if enabled)
let certificate: AcmCertificateComponent | undefined;
if (enableCertificates) {
    if (certificateValidationMethod === "namecheap" && !namecheapProvider) {
        throw new Error("Namecheap provider is required when certificateValidationMethod is 'namecheap'");
    }

    // Build certificate args based on validation method
    // Create region-specific wildcard certificate (e.g., *.us-east-1.internal.srelog.dev)
    // This allows each region to have its own certificate with unique DNS validation records
    const regionalDomain = `${currentRegion}.${sharedZoneName}`;
    const certArgs: any = {
        domainName: `*.${regionalDomain}`,  // Regional wildcard certificate
        validationMethod: certificateValidationMethod as "route53" | "namecheap" | "manual",
        region: currentRegion,
        tags: {
            Environment: "production",
            Purpose: "observability-services",
            Region: currentRegion,
            IsPrimary: isPrimary.toString(),
            MultiRegion: "true",
        },
    };

    // Add Namecheap validation config if using Namecheap
    if (certificateValidationMethod === "namecheap" && namecheapProvider) {
        certArgs.namecheapValidation = {
            provider: namecheapProvider,
            parentDomain: parentDomain,
        };
    }

    certificate = new AcmCertificateComponent(
        `${currentRegion}-wildcard-cert`,
        certArgs
    );

    console.log(`${currentRegion}: ACM certificate requested for *.${regionalDomain}`);
    console.log(`${currentRegion}: Validation method: ${certificateValidationMethod}`);
} else {
    console.log(`${currentRegion}: Certificate creation disabled`);
}

// ============================================================================
// CLOUDFLARE TUNNEL CONFIGURATION
// ============================================================================

// Cloudflare Tunnel configuration (optional)
// Deploys cloudflared into the EKS cluster to provide secure access to private services via WARP client
//
// SETUP:
// 1. Create tunnel in Cloudflare Dashboard (Zero Trust → Networks → Tunnels)
// 2. Configure Private Network routes in dashboard
// 3. Get tunnel token from dashboard
// 4. Store token in Pulumi ESC
// 5. Deploy this component with the token
//
// MULTI-REGION SUPPORT:
// - Both regions deploy cloudflared pods using the SAME tunnel token
// - Cloudflare automatically load balances between all active connections
// - Provides automatic failover if one region goes down
const enableCloudflareTunnel = config.getBoolean("enableCloudflareTunnel") ?? false;
let cloudflareTunnel: CloudflareWarpComponent | undefined;

if (enableCloudflareTunnel) {
    // Get tunnel token from Pulumi ESC (same token for both regions)
    const tunnelToken = config.requireSecret("cloudflareTunnelToken");

    // Create Kubernetes provider for EKS cluster
    const k8sProvider = new k8s.Provider(`${currentRegion}-k8s-provider`, {
        kubeconfig: sharedEksCluster.kubeconfig,
    });

    // Deploy cloudflared in this region
    cloudflareTunnel = new CloudflareWarpComponent(`${currentRegion}-tunnel`, {
        tunnelToken: tunnelToken,
        kubernetesProvider: k8sProvider,
        namespace: "cloudflare-tunnel",
        replicas: config.getNumber("cloudflareTunnelReplicas") ?? 2,
        cloudflaredImage: config.get("cloudflaredImage") ?? "cloudflare/cloudflared:latest",
        tags: {
            Region: currentRegion,
            Purpose: "secure-tunnel-access"
        }
    });

    console.log(`${currentRegion}: Cloudflared deployed with ${config.getNumber("cloudflareTunnelReplicas") ?? 2} replicas`);
    console.log(`${currentRegion}: Configure Private Network routes in Cloudflare Dashboard`);
} else {
    console.log(`${currentRegion}: Cloudflare Tunnel disabled`);
}

// ============================================================================
// OBSERVABILITY STACK CONFIGURATION
// ============================================================================

// Observability stack configuration (optional)
// Deploys Loki, Tempo, Mimir, Grafana, and OpenTelemetry Collector into the EKS cluster
//
// This provides a complete observability solution:
// - Loki: Log aggregation and querying
// - Tempo: Distributed tracing
// - Mimir: Metrics storage (Prometheus-compatible)
// - Grafana: Unified visualization dashboard
// - OTel Collector: Telemetry collection and forwarding
const enableObservability = config.getBoolean("enableObservability") ?? false;
let observabilityStack: ObservabilityStackComponent | undefined;

if (enableObservability) {
    // Get observability component configurations from config
    const lokiConfig = config.getObject("loki") as { enabled: boolean } | undefined;
    const tempoConfig = config.getObject("tempo") as { enabled: boolean } | undefined;
    const mimirConfig = config.getObject("mimir") as { enabled: boolean } | undefined;
    const grafanaConfig = config.getObject("grafana") as { enabled: boolean } | undefined;
    const otelCollectorConfig = config.getObject("otelCollector") as { enabled: boolean } | undefined;

    // Deploy observability stack
    // Note: ObservabilityStackComponent will create its own Kubernetes provider internally
    observabilityStack = new ObservabilityStackComponent(`${currentRegion}-observability`, {
        region: currentRegion,
        clusterName: sharedEksCluster.clusterName,
        clusterEndpoint: sharedEksCluster.clusterEndpoint,
        clusterCertificateAuthority: pulumi.output(""), // Placeholder - will be retrieved by component
        oidcProviderArn: pulumi.output(""), // Placeholder - will be retrieved by component
        oidcProviderUrl: sharedEksCluster.oidcIssuerUrl,
        stack: {
            loki: lokiConfig || { enabled: true },
            tempo: tempoConfig || { enabled: true },
            mimir: mimirConfig || { enabled: true },
            grafana: grafanaConfig || { enabled: true },
            otelCollector: otelCollectorConfig || { enabled: true }
        },
        commonS3LifecycleRules: {
            enabled: true,
            transitionToIA: 30,
            transitionToGlacier: 90,
            expiration: 365
        },
        tags: {
            Region: currentRegion,
            Purpose: "observability",
            IsPrimary: isPrimary.toString()
        }
    });

    console.log(`${currentRegion}: Observability stack deployment initiated`);
    if (lokiConfig?.enabled) console.log(`${currentRegion}: - Loki enabled (logs)`);
    if (tempoConfig?.enabled) console.log(`${currentRegion}: - Tempo enabled (traces)`);
    if (mimirConfig?.enabled) console.log(`${currentRegion}: - Mimir enabled (metrics)`);
    if (grafanaConfig?.enabled) console.log(`${currentRegion}: - Grafana enabled (visualization)`);
    if (otelCollectorConfig?.enabled) console.log(`${currentRegion}: - OTel Collector enabled (telemetry)`);
} else {
    console.log(`${currentRegion}: Observability stack disabled`);
}

// Export important values for cross-stack references
export const transitGatewayId = transitGateway.transitGateway.id;
export const transitGatewayArn = transitGateway.transitGateway.arn;
export const transitGatewayIsolationEnabled = enableRouteTableIsolation;
export const transitGatewayRoutingGroups = enableRouteTableIsolation ? transitGateway.getRoutingGroups() : [];
// Export route table IDs for cross-region peering
export const transitGatewayRouteTableIds = enableRouteTableIsolation
    ? pulumi.all(transitGateway.getRoutingGroups().map(group => transitGateway.getRouteTableId(group)))
    : pulumi.output([]);
export const hubVpcId = hubVpc.vpcId;
export const hubVpcCidrBlock = hubVpc.cidrBlock;
export const hubPrivateSubnetIds = hubVpc.getSubnetIdsByType('private');
export const hubPublicSubnetIds = hubVpc.getSubnetIdsByType('public');
export const hubVpcAttachmentId = hubVpcAttachment.id;

// Export all VPC CIDR blocks in this region for cross-region TGW peering
// These are IPAM-allocated CIDRs used to create static routes in peer regions
// As you add more VPCs (workload VPCs, etc.), add their CIDR blocks to allVpcCidrs array above
export const allVpcCidrBlocks = pulumi.all(allVpcCidrs);
export const eksClusterId = sharedEksCluster.clusterName;
export const eksClusterEndpoint = sharedEksCluster.clusterEndpoint;
export const eksClusterArn = sharedEksCluster.clusterArn;
export const ramShareArn = ramShare?.arn;
export const isCrossAccountDeployment = isCrossAccount;
export const region = currentRegion;
export const isPrimaryRegion = isPrimary;

// Export IPAM resources (only available in primary region)
export const ipamId = ipam?.ipamId;
export const ipamArn = ipam?.ipamArn;
export const ipamPoolIds = ipam?.poolIds;
export const ipamScopeId = ipam?.scopeId;
export const tgwPeeringAttachmentId = tgwPeering?.peeringAttachment.id;
export const tgwPeeringState = tgwPeering?.peeringAttachment.state;

// Export DNS and Certificate resources
export const sharedHostedZoneId = isPrimary ? privateZone.getHostedZoneId(sharedZoneName) : undefined;
export const sharedHostedZoneName = sharedZoneName;
export const certificateArn = certificate?.certificateArn;
export const internalDomain = `${currentRegion}.${baseDomain}`;

// Export service endpoints for geoproximity routing (examples for documentation)
export const lokiEndpoint = `loki.${sharedZoneName}`;
export const tempoQueryEndpoint = `tempo-query.${sharedZoneName}`;
export const tempoDistributorEndpoint = `tempo-distributor.${sharedZoneName}`;
export const grafanaEndpoint = `grafana.${sharedZoneName}`;

// Export validation records if using manual validation
export const certificateValidationRecords = certificate?.validationRecords;

// Export Cloudflare Tunnel resources
export const cloudflareTunnelEnabled = enableCloudflareTunnel;
export const cloudflareTunnelDeploymentName = cloudflareTunnel?.getDeploymentName();
export const cloudflareTunnelNamespace = cloudflareTunnel?.getNamespace();

// Export Observability Stack resources
export const observabilityEnabled = enableObservability;
export const observabilityLokiEndpoint = observabilityStack?.loki?.endpoint;
export const observabilityTempoQueryEndpoint = observabilityStack?.tempo?.queryEndpoint;
export const observabilityTempoDistributorEndpoint = observabilityStack?.tempo?.distributorEndpoint;
export const observabilityMimirQueryEndpoint = observabilityStack?.mimir?.queryEndpoint;
export const observabilityMimirDistributorEndpoint = observabilityStack?.mimir?.distributorEndpoint;
export const observabilityGrafanaEndpoint = observabilityStack?.grafana?.endpoint;
export const observabilityGrafanaPassword = observabilityStack?.grafana?.adminPassword;
export const observabilityOTelGrpcEndpoint = observabilityStack?.otelCollector?.otlpGrpcEndpoint;
export const observabilityOTelHttpEndpoint = observabilityStack?.otelCollector?.otlpHttpEndpoint;
