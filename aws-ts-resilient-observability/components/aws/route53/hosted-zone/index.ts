import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs } from "../../../shared/base";
import { ValidationUtils } from "../../../shared/utils/error-handling";

/**
 * Hosted zone specification
 */
export interface HostedZoneSpec {
    name: string;
    private?: boolean;
    vpcIds?: pulumi.Input<string>[];
    comment?: string;
    delegationSetId?: string;
    forceDestroy?: boolean;
}

/**
 * Arguments for Route53 Hosted Zone Component
 */
export interface Route53HostedZoneArgs extends BaseComponentArgs {
    hostedZones: HostedZoneSpec[];
}

/**
 * Outputs from Route53 Hosted Zone Component
 */
export interface Route53HostedZoneOutputs {
    hostedZoneIds: pulumi.Output<{ [name: string]: string }>;
    nameServers: pulumi.Output<{ [name: string]: string[] }>;
    hostedZones: { [name: string]: aws.route53.Zone };
}

/**
 * Route53 Hosted Zone Component
 * Manages Route 53 hosted zones (both public and private)
 */
export class Route53HostedZoneComponent extends BaseAWSComponent implements Route53HostedZoneOutputs {
    public readonly hostedZoneIds: pulumi.Output<{ [name: string]: string }>;
    public readonly nameServers: pulumi.Output<{ [name: string]: string[] }>;
    public readonly hostedZones: { [name: string]: aws.route53.Zone } = {};

    constructor(
        name: string,
        args: Route53HostedZoneArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:Route53HostedZone", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [
            {
                validate: (a) => {
                    ValidationUtils.validateRequired(a.hostedZones, "hostedZones", this.getResourceType(), this.getResourceName());
                    ValidationUtils.validateNonEmptyArray(a.hostedZones, "hostedZones", this.getResourceType(), this.getResourceName());
                }
            }
        ]);

        // Create hosted zones
        this.createHostedZones(args);

        // Create outputs
        const zoneIds: { [name: string]: pulumi.Output<string> } = {};
        const nameServers: { [name: string]: pulumi.Output<string[]> } = {};

        Object.entries(this.hostedZones).forEach(([name, zone]) => {
            zoneIds[name] = zone.zoneId;
            nameServers[name] = zone.nameServers;
        });

        this.hostedZoneIds = pulumi.output(zoneIds);
        this.nameServers = pulumi.output(nameServers);

        // Register outputs
        this.registerOutputs({
            hostedZoneIds: this.hostedZoneIds,
            nameServers: this.nameServers
        });
    }

    /**
     * Create hosted zones based on specifications
     */
    private createHostedZones(args: Route53HostedZoneArgs): void {
        this.logger.info("Creating Route 53 hosted zones", {
            count: args.hostedZones.length
        });

        args.hostedZones.forEach((zoneSpec, index) => {
            this.validateHostedZone(zoneSpec, index);

            const zoneTags = this.mergeTags({
                Name: zoneSpec.name,
                Type: zoneSpec.private ? "Private" : "Public"
            });

            // Create hosted zone
            // Handle VPC IDs - they may be pulumi.Output<string>
            const vpcsConfig = zoneSpec.private && zoneSpec.vpcIds
                ? zoneSpec.vpcIds.map(vpcId => ({
                    vpcId: vpcId,
                    vpcRegion: this.region
                  }))
                : undefined;

            const hostedZone = new aws.route53.Zone(
                `${zoneSpec.name.replace(/\./g, "-")}-zone`,
                {
                    name: zoneSpec.name,
                    comment: zoneSpec.comment || `Managed by Pulumi - ${zoneSpec.name}`,
                    delegationSetId: zoneSpec.delegationSetId,
                    forceDestroy: zoneSpec.forceDestroy || false,
                    vpcs: vpcsConfig,
                    tags: zoneTags
                },
                {
                    parent: this,
                    provider: this.createProvider()
                }
            );

            this.hostedZones[zoneSpec.name] = hostedZone;

            this.logger.info("Hosted zone created", {
                name: zoneSpec.name,
                type: zoneSpec.private ? "private" : "public"
            });
        });
    }

    /**
     * Validate hosted zone specification
     */
    private validateHostedZone(zoneSpec: HostedZoneSpec, index: number): void {
        const zoneId = `hostedZones[${index}]`;

        // Validate required fields
        ValidationUtils.validateRequired(zoneSpec.name, `${zoneId}.name`, this.getResourceType(), this.getResourceName());

        // Validate domain name format
        const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.?$/;
        if (!domainPattern.test(zoneSpec.name)) {
            throw new Error(`${this.getResourceType()}: Invalid domain name format for ${zoneId}: ${zoneSpec.name}`);
        }

        // Validate private zone configuration
        if (zoneSpec.private && (!zoneSpec.vpcIds || zoneSpec.vpcIds.length === 0)) {
            throw new Error(`${this.getResourceType()}: Private hosted zone ${zoneSpec.name} requires at least one VPC ID`);
        }

        // Note: VPC ID format validation is skipped because vpcIds may be pulumi.Output<string>
        // AWS will validate the format when the zone is created

        this.logger.debug("Hosted zone validation successful", {
            index,
            name: zoneSpec.name,
            private: zoneSpec.private || false
        });
    }

    /**
     * Get hosted zone ID by domain name
     */
    public getHostedZoneId(zoneName: string): pulumi.Output<string> {
        const hostedZone = this.hostedZones[zoneName];
        if (!hostedZone) {
            throw new Error(`Hosted zone ${zoneName} not found in Route53 component`);
        }
        return hostedZone.zoneId;
    }

    /**
     * Get name servers for a hosted zone
     */
    public getNameServers(zoneName: string): pulumi.Output<string[]> {
        const hostedZone = this.hostedZones[zoneName];
        if (!hostedZone) {
            throw new Error(`Hosted zone ${zoneName} not found in Route53 component`);
        }
        return hostedZone.nameServers;
    }

    /**
     * Get hosted zone resource by name
     */
    public getHostedZone(zoneName: string): aws.route53.Zone {
        const hostedZone = this.hostedZones[zoneName];
        if (!hostedZone) {
            throw new Error(`Hosted zone ${zoneName} not found in Route53 component`);
        }
        return hostedZone;
    }

    /**
     * Get all hosted zone names
     */
    public getHostedZoneNames(): string[] {
        return Object.keys(this.hostedZones);
    }

    /**
     * Associate additional VPCs with an existing hosted zone
     * This is useful for cross-stack VPC associations where you want to associate
     * a VPC from a different stack with a hosted zone created in this stack.
     *
     * @param zoneName The name of the hosted zone to associate with
     * @param vpcId The VPC ID to associate
     * @param associationName Optional custom name for the association resource
     * @returns The VPC association resource
     */
    public associateVpc(
        zoneName: string,
        vpcId: pulumi.Input<string>,
        associationName?: string
    ): aws.route53.ZoneAssociation {
        const hostedZone = this.hostedZones[zoneName];
        if (!hostedZone) {
            throw new Error(`Hosted zone ${zoneName} not found in Route53 component`);
        }

        const resourceName = associationName || `${zoneName.replace(/\./g, "-")}-vpc-association`;

        this.logger.info("Creating VPC association for hosted zone", {
            zoneName,
            resourceName
        });

        const association = new aws.route53.ZoneAssociation(
            resourceName,
            {
                zoneId: hostedZone.zoneId,
                vpcId: vpcId,
            },
            {
                parent: this,
                provider: this.createProvider()
            }
        );

        this.logger.info("VPC association created", {
            zoneName,
            resourceName
        });

        return association;
    }
}
