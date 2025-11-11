import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface RAMShareArgs {
    name: string;
    transitGatewayArn: pulumi.Input<string>;
    workloadsAccountId?: string;
    region: string;
    tags?: Record<string, string>;
}

export class RAMShareComponent extends pulumi.ComponentResource {
    public readonly resourceShare: aws.ram.ResourceShare;
    public readonly resourceAssociation?: aws.ram.ResourceAssociation;
    public readonly principalAssociation?: aws.ram.PrincipalAssociation;

    constructor(name: string, args: RAMShareArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:ram:RAMShare", name, {}, opts);

        // Create the resource share
        this.resourceShare = new aws.ram.ResourceShare(`${name}-share`, {
            name: args.name,
            allowExternalPrincipals: true,
            tags: {
                ...args.tags,
                Name: args.name,
                Purpose: "cross-account-networking"
            }
        }, { parent: this });

        // Create resource association with better error handling
        this.resourceAssociation = new aws.ram.ResourceAssociation(`${name}-resource-assoc`, {
            resourceArn: args.transitGatewayArn,
            resourceShareArn: this.resourceShare.arn
        }, { 
            parent: this,
            dependsOn: [this.resourceShare],
            deleteBeforeReplace: true,
            customTimeouts: {
                create: "10m",
                delete: "10m"
            },
            // Ignore changes to resource ARN during updates to prevent recreation issues
            ignoreChanges: ["resourceArn"]
        });

        // Create principal association if workloads account is provided
        if (args.workloadsAccountId) {
            this.principalAssociation = new aws.ram.PrincipalAssociation(`${name}-principal-assoc`, {
                principal: args.workloadsAccountId,
                resourceShareArn: this.resourceShare.arn
            }, { 
                parent: this,
                dependsOn: [this.resourceShare]
            });
        }

        this.registerOutputs({
            resourceShareArn: this.resourceShare.arn,
            resourceAssociationId: this.resourceAssociation?.id,
            principalAssociationId: this.principalAssociation?.id
        });
    }
}