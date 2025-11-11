import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface TransitGatewayArgs {
    description?: pulumi.Input<string>;
    amazonSideAsn?: pulumi.Input<number>;
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

export class TransitGateway extends pulumi.ComponentResource {
    public readonly transitGateway: aws.ec2transitgateway.TransitGateway;
    public readonly peeringAttachment?: aws.ec2transitgateway.PeeringAttachment;
    public readonly peeringAccepter?: aws.ec2transitgateway.PeeringAttachmentAccepter;

    constructor(name: string, args: TransitGatewayArgs = {}, opts?: pulumi.ComponentResourceOptions) {
        super("custom:network:TransitGateway", name, {}, opts);

        this.transitGateway = new aws.ec2transitgateway.TransitGateway(name, {
            description: args.description || "Transit Gateway",
            amazonSideAsn: args.amazonSideAsn || 64512,
            autoAcceptSharedAttachments: "enable",
            defaultRouteTableAssociation: "enable",
            defaultRouteTablePropagation: "enable",
            dnsSupport: "enable",
            vpnEcmpSupport: "enable",
            tags: args.tags || { Name: name },
        }, { parent: this, provider: opts?.provider });

        this.registerOutputs({
            transitGateway: this.transitGateway,
        });
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
