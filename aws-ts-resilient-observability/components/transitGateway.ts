import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface TransitGatewayArgs {
    description?: pulumi.Input<string>;
    amazonSideAsn?: pulumi.Input<number>;
    tags?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>;
}

export class TransitGateway extends pulumi.ComponentResource {
    public readonly transitGateway: aws.ec2transitgateway.TransitGateway;

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
        }, { parent: this });

        this.registerOutputs({
            transitGateway: this.transitGateway,
        });
    }
}
