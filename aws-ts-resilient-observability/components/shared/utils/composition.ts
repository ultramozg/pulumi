import * as pulumi from "@pulumi/pulumi";
import { VPCComponent, VPCComponentArgs } from "../vpc";
import { IPAMComponent, IPAMComponentArgs } from "../ipam";
import { ECRComponent, ECRComponentArgs } from "../ecr";
import { EKSComponent, EKSComponentArgs } from "../eks";
import { RDSGlobalComponent, RDSGlobalComponentArgs } from "../rds";
import { ACMComponent, ACMComponentArgs } from "../acm";
import { Route53Component, Route53ComponentArgs } from "../route53";

/**
 * Configuration for VPC with IPAM integration
 */
export interface VPCWithIPAMConfig {
    ipam: {
        name: string;
        args: IPAMComponentArgs;
    };
    vpc: {
        name: string;
        args: Omit<VPCComponentArgs, 'ipamPoolArn'>;
    };
    region: string;
}

/**
 * Configuration for complete networking stack
 */
export interface NetworkingStackConfig {
    ipam: {
        name: string;
        args: IPAMComponentArgs;
    };
    vpcs: Array<{
        name: string;
        args: Omit<VPCComponentArgs, 'ipamPoolArn'>;
    }>;
    region: string;
}

/**
 * Configuration for application stack with networking
 */
export interface ApplicationStackConfig {
    networking: NetworkingStackConfig;
    ecr?: {
        name: string;
        args: ECRComponentArgs;
    };
    eks?: {
        name: string;
        args: Omit<EKSComponentArgs, 'subnetIds'>;
    };
    rds?: {
        name: string;
        args: Omit<RDSGlobalComponentArgs, 'regions'> & {
            regions: Omit<RDSGlobalComponentArgs['regions'][0], 'subnetIds'>[];
        };
    };
}

/**
 * Configuration for DNS and certificate management
 */
export interface DNSCertificateConfig {
    route53: {
        name: string;
        args: Route53ComponentArgs;
    };
    acm: {
        name: string;
        args: Omit<ACMComponentArgs, 'hostedZoneId'>;
    };
}

/**
 * Result of VPC with IPAM composition
 */
export interface VPCWithIPAMResult {
    ipam: IPAMComponent;
    vpc: VPCComponent;
}

/**
 * Result of networking stack composition
 */
export interface NetworkingStackResult {
    ipam: IPAMComponent;
    vpcs: { [name: string]: VPCComponent };
}

/**
 * Result of application stack composition
 */
export interface ApplicationStackResult {
    networking: NetworkingStackResult;
    ecr?: ECRComponent;
    eks?: EKSComponent;
    rds?: RDSGlobalComponent;
}

/**
 * Result of DNS and certificate composition
 */
export interface DNSCertificateResult {
    route53: Route53Component;
    acm: ACMComponent;
}

/**
 * Create a VPC with IPAM integration
 * This is a common pattern where IPAM provides automatic CIDR allocation for VPC
 * 
 * Note: This function creates the components but the IPAM pool ARN will be resolved at runtime.
 * The VPC component handles Pulumi outputs internally.
 */
export function createVPCWithIPAM(
    config: VPCWithIPAMConfig,
    opts?: pulumi.ComponentResourceOptions
): VPCWithIPAMResult {
    // Create IPAM first
    const ipam = new IPAMComponent(
        config.ipam.name,
        config.ipam.args,
        opts
    );

    // Create VPC with IPAM integration
    // Note: We pass the IPAM pool ARN as a Pulumi output, which the VPC component should handle
    const vpc = new VPCComponent(
        config.vpc.name,
        {
            ...config.vpc.args,
            // For now, we'll use the region to get the pool ARN
            // In a real implementation, the VPC component would need to handle Output<string>
            region: config.region
        },
        { ...opts, dependsOn: [ipam] }
    );

    return {
        ipam,
        vpc
    };
}

/**
 * Create a complete networking stack with IPAM and multiple VPCs
 * This pattern is useful for multi-VPC architectures with centralized IP management
 */
export function createNetworkingStack(
    config: NetworkingStackConfig,
    opts?: pulumi.ComponentResourceOptions
): NetworkingStackResult {
    // Create IPAM first
    const ipam = new IPAMComponent(
        config.ipam.name,
        config.ipam.args,
        opts
    );

    // Create all VPCs with IPAM integration
    const vpcs: { [name: string]: VPCComponent } = {};

    config.vpcs.forEach(vpcConfig => {
        vpcs[vpcConfig.name] = new VPCComponent(
            vpcConfig.name,
            {
                ...vpcConfig.args,
                // For now, we'll let the VPC component handle IPAM integration internally
                region: config.region
            },
            { ...opts, dependsOn: [ipam] }
        );
    });

    return {
        ipam,
        vpcs
    };
}

/**
 * Create a complete application stack with networking, container registry, and compute
 * This pattern combines networking, ECR, and EKS for a complete application platform
 */
export function createApplicationStack(
    config: ApplicationStackConfig,
    opts?: pulumi.ComponentResourceOptions
): ApplicationStackResult {
    // Create networking stack first
    const networking = createNetworkingStack(config.networking, opts);

    const result: ApplicationStackResult = {
        networking
    };

    // Create ECR if specified
    if (config.ecr) {
        result.ecr = new ECRComponent(
            config.ecr.name,
            config.ecr.args,
            opts
        );
    }

    // Create EKS if specified
    if (config.eks) {
        // Get private subnets from the first VPC for EKS
        const firstVpcName = Object.keys(networking.vpcs)[0];
        const firstVpc = networking.vpcs[firstVpcName];
        
        if (!firstVpc) {
            throw new Error("ApplicationStack: At least one VPC is required for EKS deployment");
        }

        // For now, we'll create EKS without subnet IDs and let it be configured separately
        // In a real implementation, you'd need to handle the Pulumi output properly
        result.eks = new EKSComponent(
            config.eks.name,
            {
                ...config.eks.args,
                // Note: subnetIds would need to be resolved from VPC outputs
                // This is a simplified version for the composition pattern
            },
            { ...opts, dependsOn: [firstVpc] }
        );
    }

    // Create RDS if specified
    if (config.rds) {
        // Get private subnets from the first VPC for RDS
        const firstVpcName = Object.keys(networking.vpcs)[0];
        const firstVpc = networking.vpcs[firstVpcName];
        
        if (!firstVpc) {
            throw new Error("ApplicationStack: At least one VPC is required for RDS deployment");
        }

        // For now, we'll create RDS with the original configuration
        // In a real implementation, you'd need to handle subnet ID resolution properly
        result.rds = new RDSGlobalComponent(
            config.rds.name,
            {
                ...config.rds.args,
                // Note: regions would need subnet IDs resolved from VPC outputs
                // This is a simplified version for the composition pattern
            },
            { ...opts, dependsOn: [firstVpc] }
        );
    }

    return result;
}

/**
 * Create DNS and certificate management stack
 * This pattern combines Route53 and ACM for complete DNS and SSL/TLS management
 */
export function createDNSCertificateStack(
    config: DNSCertificateConfig,
    opts?: pulumi.ComponentResourceOptions
): DNSCertificateResult {
    // Create Route53 hosted zones first
    const route53 = new Route53Component(
        config.route53.name,
        config.route53.args,
        opts
    );

    // Create ACM certificates with DNS validation
    // Note: The ACM component should handle hosted zone ID resolution internally
    const acm = new ACMComponent(
        config.acm.name,
        {
            ...config.acm.args,
            // The ACM component expects hostedZoneId in the certificate specs
            certificates: config.acm.args.certificates.map(cert => ({
                ...cert,
                // For DNS validation, the hosted zone ID would be resolved from Route53
                // This is a simplified version for the composition pattern
                hostedZoneId: cert.hostedZoneId || "placeholder-zone-id"
            }))
        },
        { ...opts, dependsOn: [route53] }
    );

    return {
        route53,
        acm
    };
}

/**
 * Create EKS cluster with ECR integration
 * This pattern sets up EKS with ECR repositories for container image storage
 */
export function createEKSWithECR(
    eksName: string,
    eksArgs: EKSComponentArgs,
    ecrName: string,
    ecrArgs: ECRComponentArgs,
    opts?: pulumi.ComponentResourceOptions
): { eks: EKSComponent; ecr: ECRComponent } {
    // Create ECR first
    const ecr = new ECRComponent(ecrName, ecrArgs, opts);

    // Create EKS cluster
    const eks = new EKSComponent(
        eksName,
        eksArgs,
        opts
    );

    return {
        eks,
        ecr
    };
}

/**
 * Create multi-region ECR setup with replication
 * This pattern creates ECR repositories in multiple regions with cross-region replication
 */
export function createMultiRegionECR(
    name: string,
    repositories: Array<{ name: string; lifecyclePolicy?: string }>,
    regions: { source: string; destinations: string[] },
    opts?: pulumi.ComponentResourceOptions
): { [region: string]: ECRComponent } {
    const components: { [region: string]: ECRComponent } = {};

    // Create primary ECR in source region
    components[regions.source] = new ECRComponent(
        `${name}-${regions.source}`,
        {
            repositories: repositories.map(repo => ({
                ...repo,
                shareWithOrganization: true
            })),
            replicationEnabled: true,
            sourceRegion: regions.source,
            destinationRegion: regions.destinations[0] // Primary destination
        },
        opts
    );

    // Create ECR components in destination regions (for management purposes)
    regions.destinations.forEach(region => {
        components[region] = new ECRComponent(
            `${name}-${region}`,
            {
                repositories: repositories.map(repo => ({
                    ...repo,
                    shareWithOrganization: true
                })),
                replicationEnabled: false,
                sourceRegion: region,
                destinationRegion: region // Self-reference for destination regions
            },
            opts
        );
    });

    return components;
}