import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * Routing group configuration for network segmentation
 */
export interface RoutingGroupConfig {
    /** Description of the routing group */
    description?: string;
    /** List of other routing group names this group can communicate with (hub is always accessible) */
    allowedGroups?: string[];
    /** Tags for the route table */
    tags?: { [key: string]: string };
}

export interface TransitGatewayArgs {
    description?: pulumi.Input<string>;
    amazonSideAsn?: pulumi.Input<number>;
    /** Enable route table isolation (recommended for enterprise) */
    enableRouteTableIsolation?: boolean;
    /** 
     * Routing groups for network segmentation as a map
     * Key: routing group name (e.g., 'production', 'development')
     * Value: routing group configuration
     * 
     * Note: 'hub' routing group is automatically created and accessible by all groups
     * 
     * Example:
     * {
     *   production: { allowedGroups: [] },  // Only hub access
     *   development: { allowedGroups: ['test'] },  // Hub + test access
     *   test: { allowedGroups: ['development'] }  // Hub + dev access
     * }
     */
    routingGroups?: { [groupName: string]: RoutingGroupConfig };
    tags?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>;
}

export interface TransitGatewayPeeringArgs {
    /** The Transit Gateway ID to peer with */
    peerTransitGatewayId: pulumi.Input<string>;
    /** The region of the peer Transit Gateway */
    peerRegion: string;
    /** The current region */
    currentRegion: string;
    /** Tags for the peering attachment */
    tags?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>;
}

export interface VpcAttachmentArgs {
    /** VPC ID to attach */
    vpcId: pulumi.Input<string>;
    /** Subnet IDs for the attachment */
    subnetIds: pulumi.Input<string[]>;
    /** Routing group this VPC belongs to */
    routingGroup: string;
    /** Tags for the attachment */
    tags?: { [key: string]: string };
}

export class TransitGateway extends pulumi.ComponentResource {
    public readonly transitGateway: aws.ec2transitgateway.TransitGateway;
    public readonly peeringAttachment?: aws.ec2transitgateway.PeeringAttachment;
    public readonly peeringAccepter?: aws.ec2transitgateway.PeeringAttachmentAccepter;
    
    // Route tables for each routing group
    private readonly routeTables: Map<string, aws.ec2transitgateway.RouteTable> = new Map();
    private readonly routingGroups: Map<string, RoutingGroupConfig> = new Map();
    private readonly enableIsolation: boolean;
    
    // Track attachments for route propagation
    private readonly attachmentsByGroup: Map<string, aws.ec2transitgateway.VpcAttachment[]> = new Map();

    constructor(name: string, args: TransitGatewayArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("custom:network:TransitGateway", name, {}, opts);

        this.enableIsolation = args.enableRouteTableIsolation ?? false;

        // Create Transit Gateway with isolation settings
        this.transitGateway = new aws.ec2transitgateway.TransitGateway(name, {
            description: args.description || "Transit Gateway",
            amazonSideAsn: args.amazonSideAsn || 64512,
            autoAcceptSharedAttachments: "enable",
            // Disable default route table when using isolation
            defaultRouteTableAssociation: this.enableIsolation ? "disable" : "enable",
            defaultRouteTablePropagation: this.enableIsolation ? "disable" : "enable",
            dnsSupport: "enable",
            vpnEcmpSupport: "enable",
            tags: args.tags || { Name: name },
        }, { parent: this, provider: opts?.provider });

        // Create routing groups and their route tables if isolation is enabled
        if (this.enableIsolation && args.routingGroups) {
            this.createRoutingGroups(args.routingGroups);
        }

        this.registerOutputs({
            transitGateway: this.transitGateway,
            routeTables: pulumi.output(Array.from(this.routeTables.entries()).map(([name, rt]) => ({
                name,
                id: rt.id
            })))
        });
    }

    /**
     * Create routing groups and their isolated route tables
     * Hub routing group is automatically created and accessible by all groups
     */
    private createRoutingGroups(groups: { [groupName: string]: RoutingGroupConfig }): void {
        // Always create hub routing group first
        this.createRouteTable('hub', {
            description: 'Shared services hub - accessible by all routing groups',
            tags: { Purpose: 'SharedServices', Criticality: 'High' }
        });

        // Create route tables for all other routing groups
        Object.entries(groups).forEach(([groupName, config]) => {
            if (groupName === 'hub') {
                throw new Error("'hub' is a reserved routing group name and is automatically created");
            }
            this.createRouteTable(groupName, config);
        });
    }

    /**
     * Create a route table for a routing group
     */
    private createRouteTable(groupName: string, config: RoutingGroupConfig): void {
        // Store routing group configuration
        this.routingGroups.set(groupName, config);
        
        // Create route table for this group
        // Use a static name instead of interpolating the TGW ID (which is an Output)
        const routeTable = new aws.ec2transitgateway.RouteTable(
            `tgw-rt-${groupName}`,
            {
                transitGatewayId: this.transitGateway.id,
                tags: {
                    Name: `tgw-rt-${groupName}`,
                    RoutingGroup: groupName,
                    Description: config.description || `Route table for ${groupName}`,
                    ...config.tags
                }
            },
            { parent: this }
        );
        
        this.routeTables.set(groupName, routeTable);
        this.attachmentsByGroup.set(groupName, []);
    }

    /**
     * Attach a VPC to the Transit Gateway
     * When routing groups are enabled, attaches to the specified routing group
     * When disabled, uses the default Transit Gateway route table
     * 
     * @param name Name for the attachment
     * @param args VPC attachment configuration
     * @returns The VPC attachment resource
     */
    public attachVpc(name: string, args: VpcAttachmentArgs): aws.ec2transitgateway.VpcAttachment {
        // Validate routing group if isolation is enabled
        if (this.enableIsolation && !this.routingGroups.has(args.routingGroup)) {
            throw new Error(`Routing group '${args.routingGroup}' not found. Available groups: ${Array.from(this.routingGroups.keys()).join(', ')}`);
        }

        // Create VPC attachment
        const attachment = new aws.ec2transitgateway.VpcAttachment(
            name,
            {
                transitGatewayId: this.transitGateway.id,
                vpcId: args.vpcId,
                subnetIds: args.subnetIds,
                // When isolation is disabled, use default route table
                // When enabled, disable default and use routing group route table
                transitGatewayDefaultRouteTableAssociation: !this.enableIsolation,
                transitGatewayDefaultRouteTablePropagation: !this.enableIsolation,
                tags: {
                    Name: name,
                    RoutingGroup: args.routingGroup,
                    ...args.tags
                }
            },
            { 
                parent: this,
                // Replace the attachment if route table association settings change
                replaceOnChanges: ["transitGatewayDefaultRouteTableAssociation", "transitGatewayDefaultRouteTablePropagation"],
                deleteBeforeReplace: true
            }
        );

        // Only configure routing groups if isolation is enabled
        if (this.enableIsolation) {
            // Associate with routing group's route table
            const routeTable = this.routeTables.get(args.routingGroup)!;
            new aws.ec2transitgateway.RouteTableAssociation(
                `${name}-rt-assoc`,
                {
                    transitGatewayAttachmentId: attachment.id,
                    transitGatewayRouteTableId: routeTable.id
                },
                { 
                    parent: this,
                    dependsOn: [attachment],
                    deleteBeforeReplace: true
                }
            );

            // Store attachment for later route propagation
            this.attachmentsByGroup.get(args.routingGroup)!.push(attachment);

            // Configure route propagation based on routing group rules
            this.configureRoutePropagation(args.routingGroup, attachment);
        }

        return attachment;
    }

    /**
     * Configure route propagation for a VPC attachment based on routing group rules
     * Hub is always accessible by all routing groups
     */
    private configureRoutePropagation(
        groupName: string,
        attachment: aws.ec2transitgateway.VpcAttachment
    ): void {
        const group = this.routingGroups.get(groupName)!;
        const ownRouteTable = this.routeTables.get(groupName)!;
        
        // Generate a unique counter for this attachment to avoid name collisions
        const attachmentCounter = this.attachmentsByGroup.get(groupName)!.length;
        
        // 1. Propagate routes within the same routing group (self)
        new aws.ec2transitgateway.RouteTablePropagation(
            `${groupName}-attachment-${attachmentCounter}-self-prop`,
            {
                transitGatewayAttachmentId: attachment.id,
                transitGatewayRouteTableId: ownRouteTable.id
            },
            { parent: this }
        );

        // 2. Hub is always accessible (unless this IS the hub)
        if (groupName !== 'hub' && this.routeTables.has('hub')) {
            const hubRouteTable = this.routeTables.get('hub')!;
            
            // Propagate this VPC's routes to hub
            new aws.ec2transitgateway.RouteTablePropagation(
                `${groupName}-attachment-${attachmentCounter}-to-hub-prop`,
                {
                    transitGatewayAttachmentId: attachment.id,
                    transitGatewayRouteTableId: hubRouteTable.id
                },
                { parent: this }
            );
            
            // Propagate hub routes to this VPC's route table
            const hubAttachments = this.attachmentsByGroup.get('hub') || [];
            hubAttachments.forEach((hubAttachment, index) => {
                new aws.ec2transitgateway.RouteTablePropagation(
                    `${groupName}-attachment-${attachmentCounter}-from-hub-${index}`,
                    {
                        transitGatewayAttachmentId: hubAttachment.id,
                        transitGatewayRouteTableId: ownRouteTable.id
                    },
                    { parent: this }
                );
            });
        }

        // 3. If this is hub, propagate to all other groups
        if (groupName === 'hub') {
            let otherGroupCounter = 0;
            this.routingGroups.forEach((_, otherGroupName) => {
                if (otherGroupName !== 'hub') {
                    const otherRouteTable = this.routeTables.get(otherGroupName)!;
                    new aws.ec2transitgateway.RouteTablePropagation(
                        `hub-attachment-${attachmentCounter}-to-${otherGroupName}`,
                        {
                            transitGatewayAttachmentId: attachment.id,
                            transitGatewayRouteTableId: otherRouteTable.id
                        },
                        { parent: this }
                    );
                    otherGroupCounter++;
                }
            });
        }

        // 4. Propagate to explicitly allowed groups
        if (group.allowedGroups && group.allowedGroups.length > 0) {
            group.allowedGroups.forEach(allowedGroup => {
                if (allowedGroup === 'hub') {
                    // Hub is already handled above, skip
                    return;
                }
                
                if (!this.routeTables.has(allowedGroup)) {
                    throw new Error(`Routing group '${allowedGroup}' specified in allowedGroups for '${groupName}' does not exist`);
                }
                
                const allowedRouteTable = this.routeTables.get(allowedGroup)!;
                
                // Propagate this VPC's routes to allowed group
                new aws.ec2transitgateway.RouteTablePropagation(
                    `${groupName}-attachment-${attachmentCounter}-to-${allowedGroup}`,
                    {
                        transitGatewayAttachmentId: attachment.id,
                        transitGatewayRouteTableId: allowedRouteTable.id
                    },
                    { parent: this }
                );
                
                // Propagate allowed group's routes to this VPC
                const allowedAttachments = this.attachmentsByGroup.get(allowedGroup) || [];
                allowedAttachments.forEach((allowedAttachment, index) => {
                    new aws.ec2transitgateway.RouteTablePropagation(
                        `${groupName}-attachment-${attachmentCounter}-from-${allowedGroup}-${index}`,
                        {
                            transitGatewayAttachmentId: allowedAttachment.id,
                            transitGatewayRouteTableId: ownRouteTable.id
                        },
                        { parent: this }
                    );
                });
            });
        }
    }

    /**
     * Get route table ID for a routing group
     */
    public getRouteTableId(groupName: string): pulumi.Output<string> {
        const routeTable = this.routeTables.get(groupName);
        if (!routeTable) {
            throw new Error(`Route table not found for routing group: ${groupName}`);
        }
        return routeTable.id;
    }

    /**
     * Get all routing group names
     */
    public getRoutingGroups(): string[] {
        return Array.from(this.routingGroups.keys());
    }

    /**
     * Check if route table isolation is enabled
     */
    public isIsolationEnabled(): boolean {
        return this.enableIsolation;
    }

    /**
     * Create a peering connection to another Transit Gateway in a different region
     * @param name Name for the peering resources
     * @param args Peering configuration
     * @returns Object containing the peering attachment and accepter
     */
    public createPeering(name: string, args: TransitGatewayPeeringArgs): {
        peeringAttachment: aws.ec2transitgateway.PeeringAttachment;
        peeringAccepter: aws.ec2transitgateway.PeeringAttachmentAccepter;
    } {
        // Create peering attachment from this TGW to peer TGW
        const peeringAttachment = new aws.ec2transitgateway.PeeringAttachment(
            `${name}-peering`,
            {
                peerRegion: args.peerRegion,
                peerTransitGatewayId: args.peerTransitGatewayId,
                transitGatewayId: this.transitGateway.id,
                tags: {
                    Name: `${name}-peering-${args.currentRegion}-to-${args.peerRegion}`,
                    Side: "requester",
                    PeerRegion: args.peerRegion,
                    CurrentRegion: args.currentRegion,
                    ...args.tags as any
                }
            },
            {
                parent: this,
                deleteBeforeReplace: true,
                customTimeouts: {
                    create: "10m",
                    delete: "10m"
                }
            }
        );

        // Create provider for peer region to accept the peering
        const peerProvider = new aws.Provider(`${name}-peer-provider`, {
            region: args.peerRegion
        }, { parent: this });

        // Accept the peering in the peer region
        const peeringAccepter = new aws.ec2transitgateway.PeeringAttachmentAccepter(
            `${name}-peering-accepter`,
            {
                transitGatewayAttachmentId: peeringAttachment.id,
                tags: {
                    Name: `${name}-peering-accepter-${args.peerRegion}`,
                    Side: "accepter",
                    PeerRegion: args.currentRegion,
                    CurrentRegion: args.peerRegion,
                    ...args.tags as any
                }
            },
            {
                parent: this,
                provider: peerProvider,
                dependsOn: [peeringAttachment],
                deleteBeforeReplace: true,
                customTimeouts: {
                    create: "10m",
                    delete: "10m"
                }
            }
        );

        return { peeringAttachment, peeringAccepter };
    }
}
