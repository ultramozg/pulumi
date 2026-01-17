import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs, validateRequired, validateRegion } from "../../shared/base";
import { NetworkingOutputs, SubnetSpec } from "../../shared/interfaces";

/**
 * Arguments for VPC Component
 */
export interface VPCComponentArgs extends BaseComponentArgs {
    /** AWS region for VPC deployment */
    region: string;
    /** IPAM pool ID for automatic CIDR allocation */
    ipamPoolId?: pulumi.Input<string>;
    /** Manual CIDR block if IPAM is not used */
    cidrBlock?: string;
    /** Base subnet CIDR for subnet calculation (e.g., "10.0.0.0/16") */
    baseSubnet?: string;
    /** Transit Gateway ARN for attachment */
    transitGatewayArn?: string;
    /** Enable Internet Gateway */
    internetGatewayEnabled: boolean;
    /** Enable NAT Gateway */
    natGatewayEnabled: boolean;
    /**
     * NAT Gateway strategy:
     * - 'zonal': One NAT Gateway per AZ (high availability, higher cost)
     * - 'regional': Single NAT Gateway for all AZs (lower cost, single point of failure)
     * @default 'zonal'
     */
    natGatewayStrategy?: 'zonal' | 'regional';
    /** Number of Availability Zones to use */
    availabilityZoneCount: number;
    /** Subnet specifications */
    subnets: { [name: string]: SubnetSpec };
    /** Enable S3 Gateway Endpoint for private S3 access via AWS backbone */
    enableS3GatewayEndpoint?: boolean;
    /** Enable DynamoDB Gateway Endpoint for private DynamoDB access via AWS backbone */
    enableDynamoDBGatewayEndpoint?: boolean;
}

/**
 * Outputs from VPC Component
 */
export interface VPCComponentOutputs extends NetworkingOutputs {
    vpcId: pulumi.Output<string>;
    vpcArn: pulumi.Output<string>;
    cidrBlock: pulumi.Output<string>;
    internetGatewayId?: pulumi.Output<string>;
    natGatewayIds?: pulumi.Output<string[]>;
    transitGatewayAttachmentId?: pulumi.Output<string>;
    availabilityZones: pulumi.Output<string[]>;
    subnetsByType: pulumi.Output<{ [type: string]: string[] }>;
    s3GatewayEndpointId?: pulumi.Output<string>;
    dynamodbGatewayEndpointId?: pulumi.Output<string>;
}

/**
 * VPC Component with IPAM and Transit Gateway integration
 * Provides flexible VPC deployment with automatic IP management and connectivity options
 */
export class VPCComponent extends BaseAWSComponent implements VPCComponentOutputs {
    public readonly vpcId: pulumi.Output<string>;
    public readonly vpcArn: pulumi.Output<string>;
    public readonly cidrBlock: pulumi.Output<string>;
    public readonly internetGatewayId?: pulumi.Output<string>;
    public readonly natGatewayIds?: pulumi.Output<string[]>;
    public readonly transitGatewayAttachmentId?: pulumi.Output<string>;
    public readonly availabilityZones: pulumi.Output<string[]>;
    public readonly subnetIds: pulumi.Output<string[]>;
    public readonly subnetsByType: pulumi.Output<{ [type: string]: string[] }>;
    public readonly routeTableIds: pulumi.Output<string[]>;
    public readonly s3GatewayEndpointId?: pulumi.Output<string>;
    public readonly dynamodbGatewayEndpointId?: pulumi.Output<string>;

    private readonly vpc: aws.ec2.Vpc;
    private readonly internetGateway?: aws.ec2.InternetGateway;
    private readonly natGateways: aws.ec2.NatGateway[] = [];
    private readonly transitGatewayAttachment?: aws.ec2transitgateway.VpcAttachment;
    private readonly subnets: { [name: string]: aws.ec2.Subnet } = {};
    private readonly routeTables: { [name: string]: aws.ec2.RouteTable } = {};
    private s3GatewayEndpoint?: aws.ec2.VpcEndpoint;
    private dynamodbGatewayEndpoint?: aws.ec2.VpcEndpoint;

    constructor(
        name: string,
        args: VPCComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:VPC", name, args, opts);

        // Validate required arguments
        validateRequired(args.region, "region", "VPCComponent");
        validateRegion(args.region, "VPCComponent");
        validateRequired(args.subnets, "subnets", "VPCComponent");

        // Validate that either IPAM pool ID, CIDR block, or base subnet is provided
        if (!args.ipamPoolId && !args.cidrBlock && !args.baseSubnet) {
            throw new Error("VPCComponent: Either ipamPoolId, cidrBlock, or baseSubnet must be provided");
        }

        const providedOptions = [args.ipamPoolId, args.cidrBlock, args.baseSubnet].filter(Boolean).length;
        if (providedOptions > 1) {
            throw new Error("VPCComponent: Cannot specify more than one of ipamPoolId, cidrBlock, or baseSubnet");
        }

        // Validate availability zone count
        if (args.availabilityZoneCount < 1 || args.availabilityZoneCount > 6) {
            throw new Error("VPCComponent: availabilityZoneCount must be between 1 and 6");
        }

        // Validate subnet specifications
        this.validateSubnetSpecs(args.subnets, args.availabilityZoneCount);

        // Use provided provider or create regional provider
        const provider = opts?.provider as aws.Provider || this.createProvider(args.region);

        // Get availability zones for the region
        const azs = this.getAvailabilityZones(args.region, args.availabilityZoneCount, provider);

        // Create VPC with IPAM or manual CIDR
        this.vpc = this.createVPC(args, provider);

        // Create Internet Gateway if enabled
        if (args.internetGatewayEnabled) {
            this.internetGateway = this.createInternetGateway(provider);
        }

        // Create subnets based on specifications
        this.createSubnets(args, azs, provider);

        // Create route tables and routes
        this.createRouteTables(args, provider);

        // Create NAT Gateways if enabled
        if (args.natGatewayEnabled) {
            this.createNATGateways(args, provider);
        }

        // Create Transit Gateway attachment if specified
        if (args.transitGatewayArn) {
            this.transitGatewayAttachment = this.createTransitGatewayAttachment(args, provider);
        }

        // Create VPC Gateway Endpoints for S3 and DynamoDB (free, route traffic via AWS backbone)
        if (args.enableS3GatewayEndpoint) {
            this.s3GatewayEndpoint = this.createS3GatewayEndpoint(provider);
        }

        if (args.enableDynamoDBGatewayEndpoint) {
            this.dynamodbGatewayEndpoint = this.createDynamoDBGatewayEndpoint(provider);
        }

        // Set up outputs
        this.vpcId = this.vpc.id;
        this.vpcArn = this.vpc.arn;
        this.cidrBlock = this.vpc.cidrBlock;
        this.availabilityZones = azs;

        if (this.internetGateway) {
            this.internetGatewayId = this.internetGateway.id;
        }

        if (this.natGateways.length > 0) {
            this.natGatewayIds = pulumi.output(this.natGateways.map(ng => ng.id));
        }

        if (this.transitGatewayAttachment) {
            this.transitGatewayAttachmentId = this.transitGatewayAttachment.id;
        }

        // Create subnet outputs
        const allSubnetIds = Object.values(this.subnets).map(subnet => subnet.id);
        this.subnetIds = pulumi.all(allSubnetIds);

        // Group subnets by type
        const subnetsByType: { [type: string]: pulumi.Output<string>[] } = {};
        Object.entries(args.subnets).forEach(([subnetName, spec]) => {
            if (!subnetsByType[spec.type]) {
                subnetsByType[spec.type] = [];
            }
            // Add all subnets of this type (one per AZ)
            for (let index = 0; index < spec.availabilityZones; index++) {
                const subnetKey = `${subnetName}-${index}`;
                if (this.subnets[subnetKey]) {
                    subnetsByType[spec.type].push(this.subnets[subnetKey].id);
                }
            }
        });

        this.subnetsByType = pulumi.output(
            Object.fromEntries(
                Object.entries(subnetsByType).map(([type, ids]) => [
                    type,
                    pulumi.all(ids)
                ])
            )
        );

        // Route table outputs
        const allRouteTableIds = Object.values(this.routeTables).map(rt => rt.id);
        this.routeTableIds = pulumi.all(allRouteTableIds);

        // Gateway endpoint outputs
        if (this.s3GatewayEndpoint) {
            this.s3GatewayEndpointId = this.s3GatewayEndpoint.id;
        }

        if (this.dynamodbGatewayEndpoint) {
            this.dynamodbGatewayEndpointId = this.dynamodbGatewayEndpoint.id;
        }

        // Register outputs
        this.registerOutputs({
            vpcId: this.vpcId,
            vpcArn: this.vpcArn,
            cidrBlock: this.cidrBlock,
            internetGatewayId: this.internetGatewayId,
            natGatewayIds: this.natGatewayIds,
            transitGatewayAttachmentId: this.transitGatewayAttachmentId,
            availabilityZones: this.availabilityZones,
            subnetIds: this.subnetIds,
            subnetsByType: this.subnetsByType,
            routeTableIds: this.routeTableIds,
            s3GatewayEndpointId: this.s3GatewayEndpointId,
            dynamodbGatewayEndpointId: this.dynamodbGatewayEndpointId
        });
    }

    /**
     * Create VPC with IPAM, manual CIDR allocation, or base subnet
     */
    private createVPC(args: VPCComponentArgs, provider: aws.Provider): aws.ec2.Vpc {
        const vpcArgs: aws.ec2.VpcArgs = {
            enableDnsHostnames: true,
            enableDnsSupport: true,
            tags: this.mergeTags({
                Name: `${this.getResourceName()}-vpc`,
                Purpose: "NetworkingFoundation"
            })
        };

        if (args.ipamPoolId) {
            // Use IPAM for automatic CIDR allocation
            vpcArgs.ipv4IpamPoolId = args.ipamPoolId;
            vpcArgs.ipv4NetmaskLength = 16; // Default to /16 for VPC, can be made configurable
        } else if (args.baseSubnet) {
            // Use base subnet as VPC CIDR
            vpcArgs.cidrBlock = args.baseSubnet;
        } else {
            // Use manual CIDR block
            vpcArgs.cidrBlock = args.cidrBlock!;
        }

        return new aws.ec2.Vpc(
            `${this.getResourceName()}-vpc`,
            vpcArgs,
            {
                parent: this,
                provider: provider
            }
        );
    }

    /**
     * Get availability zones for the specified region
     */
    private getAvailabilityZones(region: string, count: number, provider: aws.Provider): pulumi.Output<string[]> {
        return pulumi.output(aws.getAvailabilityZones({
            state: "available"
        }, { provider })).apply(azs => {
            const names = azs.names || [];
            return names.slice(0, count);
        });
    }

    /**
     * Create Internet Gateway
     */
    private createInternetGateway(provider: aws.Provider): aws.ec2.InternetGateway {
        const igw = new aws.ec2.InternetGateway(
            `${this.getResourceName()}-igw`,
            {
                vpcId: this.vpc.id,
                tags: this.mergeTags({
                    Name: `${this.getResourceName()}-igw`,
                    Purpose: "InternetAccess"
                })
            },
            {
                parent: this,
                provider: provider
            }
        );

        return igw;
    }

    /**
     * Create subnets based on specifications
     */
    private createSubnets(
        args: VPCComponentArgs,
        azs: pulumi.Output<string[]>,
        provider: aws.Provider
    ): void {
        // Calculate subnet offsets to avoid overlapping CIDRs
        let subnetOffset = 0;

        Object.entries(args.subnets).forEach(([subnetName, spec]) => {
            for (let azIndex = 0; azIndex < spec.availabilityZones; azIndex++) {
                const subnetKey = `${subnetName}-${azIndex}`;

                // Calculate CIDR block for this subnet with proper offset
                const cidrBlock = this.calculateSubnetCidrWithOffset(spec, subnetOffset + azIndex);

                const resourceName = this.getResourceName();
                const subnet = new aws.ec2.Subnet(
                    `${resourceName}-subnet-${subnetKey}`,
                    {
                        vpcId: this.vpc.id,
                        cidrBlock: cidrBlock,
                        availabilityZone: azs.apply(zones => zones[azIndex]),
                        mapPublicIpOnLaunch: spec.type === 'public',
                        tags: this.mergeTags({
                            Name: `${resourceName}-subnet-${subnetKey}`,
                            Type: spec.type,
                            Purpose: `${spec.type}Networking`
                        })
                    },
                    {
                        parent: this,
                        provider: provider
                    }
                );

                this.subnets[subnetKey] = subnet;
            }

            // Increment offset for next subnet type
            subnetOffset += spec.availabilityZones;
        });
    }

    /**
     * Calculate CIDR block for subnet based on specification with offset
     */
    private calculateSubnetCidrWithOffset(spec: SubnetSpec, offset: number): pulumi.Output<string> {
        return this.vpc.cidrBlock.apply(vpcCidr => {
            // Handle case where vpcCidr might be undefined
            if (!vpcCidr) {
                // For testing purposes, return a default CIDR
                return `10.0.${offset}.0/24`;
            }

            // Parse VPC CIDR
            const [vpcBaseIp, vpcPrefixStr] = vpcCidr.split('/');
            const vpcPrefix = parseInt(vpcPrefixStr, 10);

            // Use subnetPrefix if provided, otherwise fall back to legacy cidrPrefix calculation
            const subnetPrefix = spec.subnetPrefix || (vpcPrefix + (spec.cidrPrefix || 8));

            // Calculate how many subnets we can fit
            const subnetBits = subnetPrefix - vpcPrefix;
            if (subnetBits <= 0) {
                throw new Error(`Subnet prefix ${subnetPrefix} must be larger than VPC prefix ${vpcPrefix}`);
            }

            // Calculate subnet base IP
            const vpcIpParts = vpcBaseIp.split('.').map(part => parseInt(part, 10));
            const vpcIpInt = (vpcIpParts[0] << 24) + (vpcIpParts[1] << 16) + (vpcIpParts[2] << 8) + vpcIpParts[3];

            // Calculate subnet offset (increment based on offset to avoid overlaps)
            const subnetSize = Math.pow(2, 32 - subnetPrefix);
            const subnetIpInt = vpcIpInt + (offset * subnetSize);

            // Convert back to IP address
            const subnetIpParts = [
                (subnetIpInt >>> 24) & 0xFF,
                (subnetIpInt >>> 16) & 0xFF,
                (subnetIpInt >>> 8) & 0xFF,
                subnetIpInt & 0xFF
            ];

            return `${subnetIpParts.join('.')}/${subnetPrefix}`;
        });
    }

    /**
     * Create route tables and routes
     */
    private createRouteTables(args: VPCComponentArgs, provider: aws.Provider): void {
        // Create public route table if we have public subnets and IGW
        const hasPublicSubnets = Object.values(args.subnets).some(spec => spec.type === 'public');

        if (hasPublicSubnets && this.internetGateway) {
            const resourceName = this.getResourceName();
            const publicRouteTable = new aws.ec2.RouteTable(
                `${resourceName}-rt-public`,
                {
                    vpcId: this.vpc.id,
                    tags: this.mergeTags({
                        Name: `${resourceName}-rt-public`,
                        Type: "public"
                    })
                },
                {
                    parent: this,
                    provider: provider
                }
            );

            // Add route to Internet Gateway
            new aws.ec2.Route(
                `${resourceName}-route-public-igw`,
                {
                    routeTableId: publicRouteTable.id,
                    destinationCidrBlock: "0.0.0.0/0",
                    gatewayId: this.internetGateway.id
                },
                {
                    parent: this,
                    provider: provider
                }
            );

            this.routeTables['public'] = publicRouteTable;

            // Associate public subnets with public route table
            Object.entries(this.subnets).forEach(([subnetKey, subnet]) => {
                const subnetName = subnetKey.split('-')[0];
                const spec = args.subnets[subnetName];

                if (spec && spec.type === 'public') {
                    const resourceName = this.getResourceName();
                    new aws.ec2.RouteTableAssociation(
                        `${resourceName}-rta-${subnetKey}`,
                        {
                            subnetId: subnet.id,
                            routeTableId: publicRouteTable.id
                        },
                        {
                            parent: this,
                            provider: provider
                        }
                    );
                }
            });
        }

        // Create private route tables (one per AZ if NAT gateways are enabled)
        const hasPrivateSubnets = Object.values(args.subnets).some(spec => spec.type === 'private');

        if (hasPrivateSubnets) {
            if (args.natGatewayEnabled && hasPublicSubnets) {
                // Create one route table per AZ for NAT gateway routing
                for (let azIndex = 0; azIndex < args.availabilityZoneCount; azIndex++) {
                    const resourceName = this.getResourceName();
                    const privateRouteTable = new aws.ec2.RouteTable(
                        `${resourceName}-rt-private-${azIndex}`,
                        {
                            vpcId: this.vpc.id,
                            tags: this.mergeTags({
                                Name: `${resourceName}-rt-private-${azIndex}`,
                                Type: "private",
                                AvailabilityZone: azIndex.toString()
                            })
                        },
                        {
                            parent: this,
                            provider: provider
                        }
                    );

                    this.routeTables[`private-${azIndex}`] = privateRouteTable;
                }
            } else {
                // Create single private route table
                const resourceName = this.getResourceName();
                const privateRouteTable = new aws.ec2.RouteTable(
                    `${resourceName}-rt-private`,
                    {
                        vpcId: this.vpc.id,
                        tags: this.mergeTags({
                            Name: `${resourceName}-rt-private`,
                            Type: "private"
                        })
                    },
                    {
                        parent: this,
                        provider: provider
                    }
                );

                this.routeTables['private'] = privateRouteTable;
            }
        }
    }

    /**
     * Create NAT Gateways for private subnet internet access
     * Supports both zonal (one NAT per AZ) and regional (single NAT) strategies
     */
    private createNATGateways(args: VPCComponentArgs, provider: aws.Provider): void {
        const publicSubnets = Object.entries(this.subnets).filter(([subnetKey, _]) => {
            const subnetName = subnetKey.split('-')[0];
            const spec = args.subnets[subnetName];
            return spec && spec.type === 'public';
        });

        if (publicSubnets.length === 0) {
            throw new Error("VPCComponent: Cannot create NAT Gateways without public subnets");
        }

        const natGatewayStrategy = args.natGatewayStrategy || 'zonal';
        const resourceName = this.getResourceName();

        if (natGatewayStrategy === 'regional') {
            // Regional strategy: Create single NAT Gateway in first AZ
            const [firstSubnetKey, firstSubnet] = publicSubnets[0];
            const azIndex = parseInt(firstSubnetKey.split('-')[1], 10);

            this.logger.info(`Creating regional NAT Gateway in AZ ${azIndex} (cost-optimized, reduced availability)`);

            // Create Elastic IP for NAT Gateway
            const eip = new aws.ec2.Eip(
                `${resourceName}-eip-nat-regional`,
                {
                    domain: "vpc",
                    tags: this.mergeTags({
                        Name: `${resourceName}-eip-nat-regional`,
                        Purpose: "NATGateway",
                        Strategy: "Regional"
                    })
                },
                {
                    parent: this,
                    provider: provider
                }
            );

            // Create single NAT Gateway
            const natGateway = new aws.ec2.NatGateway(
                `${resourceName}-nat-regional`,
                {
                    allocationId: eip.id,
                    subnetId: firstSubnet.id,
                    tags: this.mergeTags({
                        Name: `${resourceName}-nat-regional`,
                        AvailabilityZone: azIndex.toString(),
                        Strategy: "Regional"
                    })
                },
                {
                    parent: this,
                    provider: provider,
                    dependsOn: [this.internetGateway!]
                }
            );

            this.natGateways.push(natGateway);

            // Add route to all private route tables pointing to the single NAT Gateway
            Object.entries(this.routeTables).forEach(([routeTableKey, routeTable]) => {
                if (routeTableKey.startsWith('private')) {
                    new aws.ec2.Route(
                        `${resourceName}-route-${routeTableKey}-nat-regional`,
                        {
                            routeTableId: routeTable.id,
                            destinationCidrBlock: "0.0.0.0/0",
                            natGatewayId: natGateway.id
                        },
                        {
                            parent: this,
                            provider: provider
                        }
                    );
                }
            });
        } else {
            // Zonal strategy: Create one NAT Gateway per AZ (default, high availability)
            this.logger.info(`Creating zonal NAT Gateways (one per AZ) for high availability`);

            publicSubnets.forEach(([subnetKey, subnet]) => {
                const azIndex = parseInt(subnetKey.split('-')[1], 10);

                // Create Elastic IP for NAT Gateway
                const eip = new aws.ec2.Eip(
                    `${resourceName}-eip-nat-${azIndex}`,
                    {
                        domain: "vpc",
                        tags: this.mergeTags({
                            Name: `${resourceName}-eip-nat-${azIndex}`,
                            Purpose: "NATGateway",
                            Strategy: "Zonal"
                        })
                    },
                    {
                        parent: this,
                        provider: provider
                    }
                );

                // Create NAT Gateway
                const natGateway = new aws.ec2.NatGateway(
                    `${resourceName}-nat-${azIndex}`,
                    {
                        allocationId: eip.id,
                        subnetId: subnet.id,
                        tags: this.mergeTags({
                            Name: `${resourceName}-nat-${azIndex}`,
                            AvailabilityZone: azIndex.toString(),
                            Strategy: "Zonal"
                        })
                    },
                    {
                        parent: this,
                        provider: provider,
                        dependsOn: [this.internetGateway!]
                    }
                );

                this.natGateways.push(natGateway);

                // Add route to private route table for this AZ
                const privateRouteTable = this.routeTables[`private-${azIndex}`] || this.routeTables['private'];
                if (privateRouteTable) {
                    new aws.ec2.Route(
                        `${resourceName}-route-private-nat-${azIndex}`,
                        {
                            routeTableId: privateRouteTable.id,
                            destinationCidrBlock: "0.0.0.0/0",
                            natGatewayId: natGateway.id
                        },
                        {
                            parent: this,
                            provider: provider
                        }
                    );
                }
            });
        }

        // Associate private subnets with appropriate route tables
        Object.entries(this.subnets).forEach(([subnetKey, subnet]) => {
            const subnetName = subnetKey.split('-')[0];
            const spec = args.subnets[subnetName];

            if (spec && spec.type === 'private') {
                const azIndex = parseInt(subnetKey.split('-')[1], 10);
                const routeTable = this.routeTables[`private-${azIndex}`] || this.routeTables['private'];

                if (routeTable) {
                    new aws.ec2.RouteTableAssociation(
                        `${resourceName}-rta-${subnetKey}`,
                        {
                            subnetId: subnet.id,
                            routeTableId: routeTable.id
                        },
                        {
                            parent: this,
                            provider: provider
                        }
                    );
                }
            }
        });
    }

    /**
     * Create Transit Gateway attachment
     */
    private createTransitGatewayAttachment(
        args: VPCComponentArgs,
        provider: aws.Provider
    ): aws.ec2transitgateway.VpcAttachment {
        // Get Transit Gateway subnets or use private subnets as fallback
        const transitGatewaySubnets = Object.entries(this.subnets).filter(([subnetKey, _]) => {
            const subnetName = subnetKey.split('-')[0];
            const spec = args.subnets[subnetName];
            return spec && spec.type === 'transit-gateway';
        });

        // If no transit-gateway subnets, use private subnets
        const attachmentSubnets = transitGatewaySubnets.length > 0
            ? transitGatewaySubnets
            : Object.entries(this.subnets).filter(([subnetKey, _]) => {
                const subnetName = subnetKey.split('-')[0];
                const spec = args.subnets[subnetName];
                return spec && spec.type === 'private';
            });

        if (attachmentSubnets.length === 0) {
            throw new Error("VPCComponent: No suitable subnets found for Transit Gateway attachment");
        }

        const subnetIds = attachmentSubnets.map(([_, subnet]) => subnet.id);

        const resourceName = this.getResourceName();
        return new aws.ec2transitgateway.VpcAttachment(
            `${resourceName}-tgw-attachment`,
            {
                transitGatewayId: args.transitGatewayArn!,
                vpcId: this.vpc.id,
                subnetIds: subnetIds,
                tags: this.mergeTags({
                    Name: `${resourceName}-tgw-attachment`,
                    Purpose: "TransitGatewayConnectivity"
                })
            },
            {
                parent: this,
                provider: provider
            }
        );
    }

    /**
     * Create S3 Gateway Endpoint
     * Routes S3 traffic through AWS backbone network instead of public internet (free, no data transfer costs)
     */
    private createS3GatewayEndpoint(provider: aws.Provider): aws.ec2.VpcEndpoint {
        const resourceName = this.getResourceName();

        // Collect all route table IDs to associate with the endpoint
        const routeTableIds = Object.values(this.routeTables).map(rt => rt.id);

        const endpoint = new aws.ec2.VpcEndpoint(
            `${resourceName}-s3-gateway-endpoint`,
            {
                vpcId: this.vpc.id,
                serviceName: pulumi.interpolate`com.amazonaws.${this.region}.s3`,
                vpcEndpointType: "Gateway",
                routeTableIds: routeTableIds,
                tags: this.mergeTags({
                    Name: `${resourceName}-s3-gateway-endpoint`,
                    Purpose: "S3PrivateAccess",
                    Service: "S3"
                })
            },
            {
                parent: this,
                provider: provider
            }
        );

        this.logger.info("Created S3 Gateway Endpoint - S3 traffic will route via AWS backbone network");

        return endpoint;
    }

    /**
     * Create DynamoDB Gateway Endpoint
     * Routes DynamoDB traffic through AWS backbone network instead of public internet (free, no data transfer costs)
     */
    private createDynamoDBGatewayEndpoint(provider: aws.Provider): aws.ec2.VpcEndpoint {
        const resourceName = this.getResourceName();

        // Collect all route table IDs to associate with the endpoint
        const routeTableIds = Object.values(this.routeTables).map(rt => rt.id);

        const endpoint = new aws.ec2.VpcEndpoint(
            `${resourceName}-dynamodb-gateway-endpoint`,
            {
                vpcId: this.vpc.id,
                serviceName: pulumi.interpolate`com.amazonaws.${this.region}.dynamodb`,
                vpcEndpointType: "Gateway",
                routeTableIds: routeTableIds,
                tags: this.mergeTags({
                    Name: `${resourceName}-dynamodb-gateway-endpoint`,
                    Purpose: "DynamoDBPrivateAccess",
                    Service: "DynamoDB"
                })
            },
            {
                parent: this,
                provider: provider
            }
        );

        this.logger.info("Created DynamoDB Gateway Endpoint - DynamoDB traffic will route via AWS backbone network");

        return endpoint;
    }

    /**
     * Validate subnet specifications
     */
    private validateSubnetSpecs(subnets: { [name: string]: SubnetSpec }, azCount: number): void {
        if (Object.keys(subnets).length === 0) {
            throw new Error("VPCComponent: At least one subnet specification must be provided");
        }

        Object.entries(subnets).forEach(([name, spec]) => {
            if (!spec.type || !['public', 'private', 'transit-gateway'].includes(spec.type)) {
                throw new Error(`VPCComponent: Invalid subnet type for ${name}: ${spec.type}`);
            }

            // Validate subnet prefix (preferred) or legacy cidrPrefix
            if (spec.subnetPrefix) {
                if (spec.subnetPrefix < 8 || spec.subnetPrefix > 30) {
                    throw new Error(`VPCComponent: Invalid subnet prefix for ${name}: ${spec.subnetPrefix} (must be between 8 and 30)`);
                }
            } else if (spec.cidrPrefix) {
                if (spec.cidrPrefix < 1 || spec.cidrPrefix > 16) {
                    throw new Error(`VPCComponent: Invalid CIDR prefix for ${name}: ${spec.cidrPrefix}`);
                }
            } else {
                throw new Error(`VPCComponent: Either subnetPrefix or cidrPrefix must be specified for ${name}`);
            }

            if (spec.availabilityZones === 0) {
                throw new Error(`VPCComponent: No availability zones specified for ${name}`);
            }

            if (spec.availabilityZones > azCount) {
                throw new Error(`VPCComponent: Too many availability zones specified for ${name} (max: ${azCount})`);
            }
        });
    }

    /**
     * Get subnet IDs by type
     */
    public getSubnetIdsByType(type: 'public' | 'private' | 'transit-gateway'): pulumi.Output<string[]> {
        return this.subnetsByType.apply(subnets => subnets[type] || []);
    }

    /**
     * Get subnet ID by name and AZ index
     */
    public getSubnetId(subnetName: string, azIndex: number): pulumi.Output<string> {
        const subnetKey = `${subnetName}-${azIndex}`;
        const subnet = this.subnets[subnetKey];

        if (!subnet) {
            throw new Error(`VPCComponent: Subnet not found: ${subnetKey}`);
        }

        return subnet.id;
    }

    /**
     * Get all subnet IDs for a specific subnet name across all AZs
     */
    public getSubnetIdsByName(subnetName: string): pulumi.Output<string[]> {
        const matchingSubnets = Object.entries(this.subnets)
            .filter(([key, _]) => key.startsWith(`${subnetName}-`))
            .map(([_, subnet]) => subnet.id);

        if (matchingSubnets.length === 0) {
            throw new Error(`VPCComponent: No subnets found with name: ${subnetName}`);
        }

        return pulumi.all(matchingSubnets);
    }

    /**
     * Attach this VPC to a Transit Gateway
     * @param transitGatewayId The Transit Gateway ID to attach to
     * @param options Optional configuration for the attachment
     * @returns The Transit Gateway VPC attachment
     */
    public attachToTransitGateway(
        transitGatewayId: pulumi.Input<string>,
        options?: {
            /** Subnet type to use for attachment (default: 'private') */
            subnetType?: 'public' | 'private' | 'transit-gateway';
            /** Custom tags for the attachment */
            tags?: { [key: string]: string };
        }
    ): aws.ec2transitgateway.VpcAttachment {
        const subnetType = options?.subnetType || 'private';
        const attachmentName = `${this.getResourceName()}-tgw-attachment`;
        
        this.logger.info(`Attaching VPC to Transit Gateway using ${subnetType} subnets`);
        
        const attachment = new aws.ec2transitgateway.VpcAttachment(
            attachmentName,
            {
                transitGatewayId: transitGatewayId,
                vpcId: this.vpcId,
                subnetIds: this.getSubnetIdsByType(subnetType),
                tags: this.mergeTags({
                    Name: attachmentName,
                    Purpose: "TransitGatewayConnectivity",
                    ...options?.tags
                })
            },
            {
                parent: this,
                deleteBeforeReplace: true
            }
        );
        
        this.logger.info(`VPC attached to Transit Gateway successfully`);
        
        return attachment;
    }
}
