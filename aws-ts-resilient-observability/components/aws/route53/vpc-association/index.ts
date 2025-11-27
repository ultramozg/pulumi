import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs } from "../../../shared/base";
import { ValidationUtils } from "../../../shared/utils/error-handling";

/**
 * VPC association specification
 */
export interface VpcAssociationSpec {
    /** The hosted zone ID to associate with */
    zoneId: pulumi.Input<string>;
    /** The VPC ID to associate */
    vpcId: pulumi.Input<string>;
    /** Optional comment for the association */
    comment?: string;
    /** Region where the hosted zone is located (for cross-region associations) */
    hostedZoneRegion?: string;
    /** Enable cross-region association (creates authorization first) */
    crossRegion?: boolean;
}

/**
 * Arguments for Route53 VPC Association Component
 */
export interface Route53VpcAssociationArgs extends BaseComponentArgs {
    /** AWS region for the association */
    region?: string;
    /** VPC associations to create */
    associations: VpcAssociationSpec[];
}

/**
 * Outputs from Route53 VPC Association Component
 */
export interface Route53VpcAssociationOutputs {
    associationIds: pulumi.Output<string[]>;
    associations: aws.route53.ZoneAssociation[];
}

/**
 * Route53 VPC Association Component
 *
 * Manages VPC associations with Route 53 private hosted zones.
 * This is particularly useful for cross-stack scenarios where you need to
 * associate a VPC from one stack with a private hosted zone from another stack.
 *
 * Features:
 * - Same-region VPC associations
 * - Cross-region VPC associations (with automatic authorization)
 * - Multiple VPC associations in a single component
 *
 * Example use case:
 * - Shared-services stack (us-east-1) creates a private hosted zone for internal.example.com
 * - Shared-services stack (us-west-2) associates its VPC with the hosted zone (cross-region)
 * - This enables DNS resolution of internal service endpoints across regions
 */
export class Route53VpcAssociationComponent extends BaseAWSComponent implements Route53VpcAssociationOutputs {
    public readonly associationIds: pulumi.Output<string[]>;
    public readonly associations: aws.route53.ZoneAssociation[] = [];
    private readonly authorizations: aws.route53.VpcAssociationAuthorization[] = [];

    constructor(
        name: string,
        args: Route53VpcAssociationArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:Route53VpcAssociation", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [
            {
                validate: (a) => {
                    ValidationUtils.validateRequired(a.associations, "associations", this.getResourceType(), this.getResourceName());
                    ValidationUtils.validateNonEmptyArray(a.associations, "associations", this.getResourceType(), this.getResourceName());
                }
            }
        ]);

        // Region is set from args via BaseComponentArgs, no need to override here

        // Create VPC associations
        this.createVpcAssociations(args);

        // Create outputs
        this.associationIds = pulumi.output(this.associations.map(a => a.id));

        // Register outputs
        this.registerOutputs({
            associationIds: this.associationIds
        });
    }

    /**
     * Create VPC associations based on specifications
     */
    private createVpcAssociations(args: Route53VpcAssociationArgs): void {
        this.logger.info("Creating Route 53 VPC associations", {
            count: args.associations.length
        });

        args.associations.forEach((spec, index) => {
            this.validateAssociation(spec, index);

            const associationName = `${this.getResourceName()}-association-${index}`;
            let dependsOn: pulumi.Resource[] = [];

            // If cross-region association, create authorization first
            if (spec.crossRegion && spec.hostedZoneRegion) {
                this.logger.info("Creating cross-region VPC association authorization", {
                    index,
                    hostedZoneRegion: spec.hostedZoneRegion,
                    vpcRegion: this.region
                });

                const authorizationName = `${this.getResourceName()}-auth-${index}`;

                // Create provider in the hosted zone's region
                const authProvider = new aws.Provider(authorizationName, {
                    region: spec.hostedZoneRegion
                });

                // Create authorization in the hosted zone's region
                const authorization = new aws.route53.VpcAssociationAuthorization(
                    authorizationName,
                    {
                        zoneId: spec.zoneId,
                        vpcId: spec.vpcId,
                    },
                    {
                        parent: this,
                        provider: authProvider
                    }
                );

                this.authorizations.push(authorization);
                dependsOn.push(authorization);

                this.logger.info("Cross-region authorization created", {
                    index,
                    resourceName: authorizationName
                });
            }

            // Create the VPC association in the VPC's region
            const association = new aws.route53.ZoneAssociation(
                associationName,
                {
                    zoneId: spec.zoneId,
                    vpcId: spec.vpcId,
                },
                {
                    parent: this,
                    provider: this.createProvider(),
                    dependsOn: dependsOn.length > 0 ? dependsOn : undefined
                }
            );

            this.associations.push(association);

            // Log the association creation
            pulumi.all([spec.zoneId, spec.vpcId]).apply(([zoneId, vpcId]) => {
                this.logger.info("VPC association created", {
                    index,
                    zoneId,
                    vpcId,
                    crossRegion: spec.crossRegion || false,
                    resourceName: associationName
                });
            });
        });

        this.logger.info("All VPC associations created successfully", {
            count: this.associations.length
        });
    }

    /**
     * Validate VPC association specification
     */
    private validateAssociation(spec: VpcAssociationSpec, index: number): void {
        const associationId = `associations[${index}]`;

        // Validate required fields
        ValidationUtils.validateRequired(spec.zoneId, `${associationId}.zoneId`, this.getResourceType(), this.getResourceName());
        ValidationUtils.validateRequired(spec.vpcId, `${associationId}.vpcId`, this.getResourceType(), this.getResourceName());

        this.logger.debug("VPC association validation successful", {
            index
        });
    }

    /**
     * Get association by index
     */
    public getAssociation(index: number): aws.route53.ZoneAssociation {
        if (index < 0 || index >= this.associations.length) {
            throw new Error(`Association index ${index} out of bounds (0-${this.associations.length - 1})`);
        }
        return this.associations[index];
    }

    /**
     * Get all association IDs
     */
    public getAssociationIds(): pulumi.Output<string[]> {
        return this.associationIds;
    }
}
