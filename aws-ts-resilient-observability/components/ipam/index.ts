import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs, validateRequired, validateRegion } from "../base";
import { NetworkingOutputs } from "../interfaces";

/**
 * Arguments for IPAM Component
 */
export interface IPAMComponentArgs extends BaseComponentArgs {
    cidrBlocks: string[];
    shareWithOrganization: boolean;
    operatingRegions: string[];
}

/**
 * Outputs from IPAM Component
 */
export interface IPAMComponentOutputs extends NetworkingOutputs {
    ipamId: pulumi.Output<string>;
    ipamArn: pulumi.Output<string>;
    poolIds: pulumi.Output<{ [region: string]: string }>;
    poolArns: pulumi.Output<{ [region: string]: string }>;
    scopeId: pulumi.Output<string>;
}

/**
 * IPAM Component for centralized IP address management
 * Provides organization-wide IP address allocation and management across multiple regions
 */
export class IPAMComponent extends BaseAWSComponent implements IPAMComponentOutputs {
    public readonly ipamId: pulumi.Output<string>;
    public readonly ipamArn: pulumi.Output<string>;
    public readonly poolIds: pulumi.Output<{ [region: string]: string }>;
    public readonly poolArns: pulumi.Output<{ [region: string]: string }>;
    public readonly scopeId: pulumi.Output<string>;

    private readonly ipam: aws.ec2.VpcIpam;
    private readonly scope: aws.ec2.VpcIpamScope;
    private readonly pools: { [region: string]: aws.ec2.VpcIpamPool } = {};
    private readonly poolCidrs: { [region: string]: aws.ec2.VpcIpamPoolCidr[] } = {};

    constructor(
        name: string,
        args: IPAMComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:IPAM", name, args, opts);

        // Validate required arguments
        validateRequired(args.cidrBlocks, "cidrBlocks", "IPAMComponent");
        validateRequired(args.operatingRegions, "operatingRegions", "IPAMComponent");

        if (args.cidrBlocks.length === 0) {
            throw new Error("IPAMComponent: At least one CIDR block must be specified");
        }

        if (args.operatingRegions.length === 0) {
            throw new Error("IPAMComponent: At least one operating region must be specified");
        }

        // Validate regions
        args.operatingRegions.forEach(region => {
            validateRegion(region, "IPAMComponent");
        });

        // Validate CIDR blocks
        this.validateCidrBlocks(args.cidrBlocks);

        // Create IPAM instance
        this.ipam = this.createIPAM(args);

        // Create IPAM scope for organization sharing
        this.scope = this.createIPAMScope(args);

        // Create IPAM pools for each operating region
        this.createIPAMPools(args);

        // Set up organization sharing if enabled
        if (args.shareWithOrganization) {
            this.setupOrganizationSharing(args);
        }

        // Create outputs
        const poolIds: { [region: string]: pulumi.Output<string> } = {};
        const poolArns: { [region: string]: pulumi.Output<string> } = {};

        Object.entries(this.pools).forEach(([region, pool]) => {
            poolIds[region] = pool.id;
            poolArns[region] = pool.arn;
        });

        this.ipamId = this.ipam.id;
        this.ipamArn = this.ipam.arn;
        this.poolIds = pulumi.output(poolIds);
        this.poolArns = pulumi.output(poolArns);
        this.scopeId = this.scope.id;

        // Register outputs
        this.registerOutputs({
            ipamId: this.ipamId,
            ipamArn: this.ipamArn,
            poolIds: this.poolIds,
            poolArns: this.poolArns,
            scopeId: this.scopeId
        });
    }

    /**
     * Create the main IPAM instance
     */
    private createIPAM(args: IPAMComponentArgs): aws.ec2.VpcIpam {
        const resourceName = this.getResourceName();
        return new aws.ec2.VpcIpam(
            `${resourceName}-ipam`,
            {
                description: `IPAM managed by ${resourceName}`,
                operatingRegions: args.operatingRegions.map(region => ({ regionName: region })),
                tags: this.mergeTags({
                    Name: `${resourceName}-ipam`,
                    Purpose: "CentralizedIPManagement"
                })
            },
            {
                parent: this
            }
        );
    }

    /**
     * Create IPAM scope for organization-level resource sharing
     */
    private createIPAMScope(args: IPAMComponentArgs): aws.ec2.VpcIpamScope {
        const resourceName = this.getResourceName();
        return new aws.ec2.VpcIpamScope(
            `${resourceName}-scope`,
            {
                ipamId: this.ipam.id,
                description: `IPAM scope for ${resourceName}`,
                tags: this.mergeTags({
                    Name: `${resourceName}-scope`,
                    Purpose: "OrganizationSharing"
                })
            },
            {
                parent: this
            }
        );
    }

    /**
     * Create IPAM pools for each operating region
     */
    private createIPAMPools(args: IPAMComponentArgs): void {
        // IMPORTANT: IPAM pools must be created in the IPAM's home region (args.region)
        // The 'locale' parameter specifies which region the pool serves
        // Do NOT use regional providers for pool creation
        
        args.operatingRegions.forEach(region => {
            // Create pool for this region
            const resourceName = this.getResourceName();
            const pool = new aws.ec2.VpcIpamPool(
                `${resourceName}-pool-${region}`,
                {
                    ipamScopeId: this.scope.id,
                    description: `IPAM pool for region ${region}`,
                    addressFamily: "ipv4",
                    locale: region,  // This specifies which region the pool serves
                    tags: this.mergeTags({
                        Name: `${resourceName}-pool-${region}`,
                        Region: region,
                        Purpose: "RegionalIPAllocation"
                    })
                },
                {
                    parent: this,
                    // Use IPAM's home region provider, not the locale region
                    dependsOn: [this.scope]  // Ensure scope is fully created first
                }
            );

            // Add CIDR blocks to the pool
            const poolCidrs: aws.ec2.VpcIpamPoolCidr[] = [];
            args.cidrBlocks.forEach((cidr, index) => {
                const poolCidr = new aws.ec2.VpcIpamPoolCidr(
                    `${resourceName}-pool-cidr-${region}-${index}`,
                    {
                        ipamPoolId: pool.id,
                        cidr: cidr
                    },
                    {
                        parent: this,
                        // Pool CIDRs also created in IPAM's home region
                        dependsOn: [pool]
                    }
                );
                poolCidrs.push(poolCidr);
            });

            this.pools[region] = pool;
            this.poolCidrs[region] = poolCidrs;
        });
    }

    /**
     * Set up organization sharing for IPAM resources
     */
    private setupOrganizationSharing(args: IPAMComponentArgs): void {
        const resourceName = this.getResourceName();
        // Share IPAM with organization
        const resourceShare = new aws.ram.ResourceShare(
            `${resourceName}-ipam-share`,
            {
                name: `${resourceName}-ipam-share`,
                allowExternalPrincipals: false,
                tags: this.mergeTags({
                    Name: `${resourceName}-ipam-share`,
                    Purpose: "OrganizationSharing"
                })
            },
            {
                parent: this
            }
        );

        // Associate IPAM with the resource share
        new aws.ram.ResourceAssociation(
            `${resourceName}-ipam-association`,
            {
                resourceArn: this.ipam.arn,
                resourceShareArn: resourceShare.arn
            },
            {
                parent: this
            }
        );

        // Share with organization
        const organizationId = pulumi.output(aws.organizations.getOrganization()).id;
        new aws.ram.PrincipalAssociation(
            `${resourceName}-org-association`,
            {
                principal: organizationId,
                resourceShareArn: resourceShare.arn
            },
            {
                parent: this
            }
        );
    }

    /**
     * Validate CIDR block format and ensure no overlaps
     */
    private validateCidrBlocks(cidrBlocks: string[]): void {
        const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
        
        cidrBlocks.forEach(cidr => {
            if (!cidrRegex.test(cidr)) {
                throw new Error(`IPAMComponent: Invalid CIDR block format: ${cidr}`);
            }

            // Basic validation for CIDR range
            const [ip, prefix] = cidr.split('/');
            const prefixNum = parseInt(prefix, 10);
            
            if (prefixNum < 8 || prefixNum > 28) {
                throw new Error(`IPAMComponent: CIDR prefix must be between 8 and 28: ${cidr}`);
            }

            // Validate IP address format
            const ipParts = ip.split('.').map(part => parseInt(part, 10));
            if (ipParts.some(part => part < 0 || part > 255)) {
                throw new Error(`IPAMComponent: Invalid IP address in CIDR block: ${cidr}`);
            }
        });

        // Check for obvious overlaps (simplified check)
        for (let i = 0; i < cidrBlocks.length; i++) {
            for (let j = i + 1; j < cidrBlocks.length; j++) {
                if (cidrBlocks[i] === cidrBlocks[j]) {
                    throw new Error(`IPAMComponent: Duplicate CIDR blocks found: ${cidrBlocks[i]}`);
                }
            }
        }
    }

    /**
     * Get IPAM pool ID for a specific region
     */
    public getPoolId(region: string): pulumi.Output<string> {
        const pool = this.pools[region];
        if (!pool) {
            throw new Error(`IPAMComponent: No pool found for region ${region}`);
        }
        return pool.id;
    }

    /**
     * Get IPAM pool resources (pool + CIDRs) for a specific region
     * Use this when you need to ensure CIDRs are provisioned before using the pool
     */
    public getPoolResources(region: string): { pool: aws.ec2.VpcIpamPool; cidrs: aws.ec2.VpcIpamPoolCidr[] } {
        const pool = this.pools[region];
        const cidrs = this.poolCidrs[region];
        if (!pool || !cidrs) {
            throw new Error(`IPAMComponent: No pool resources found for region ${region}`);
        }
        return { pool, cidrs };
    }

    /**
     * Get IPAM pool ARN for a specific region
     */
    public getPoolArn(region: string): pulumi.Output<string> {
        const pool = this.pools[region];
        if (!pool) {
            throw new Error(`IPAMComponent: No pool found for region ${region}`);
        }
        return pool.arn;
    }

    /**
     * Get all available regions for this IPAM
     */
    public getAvailableRegions(): string[] {
        return Object.keys(this.pools);
    }

    /**
     * Check if a region is supported by this IPAM
     */
    public supportsRegion(region: string): boolean {
        return region in this.pools;
    }
}