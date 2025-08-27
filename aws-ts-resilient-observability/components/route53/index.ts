import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs, validateRequired } from "../base";

/**
 * DNS record specification
 */
export interface DNSRecordSpec {
    zoneName: string;
    name: string;
    type: string;
    values: string[];
    ttl?: number;
    setIdentifier?: string;
    weightedRoutingPolicy?: {
        weight: number;
    };
    aliasTarget?: {
        name: string;
        zoneId: string;
        evaluateTargetHealth?: boolean;
    };
}

/**
 * Hosted zone specification
 */
export interface HostedZoneSpec {
    name: string;
    private?: boolean;
    vpcIds?: string[];
    comment?: string;
    delegationSetId?: string;
    forceDestroy?: boolean;
}

/**
 * Arguments for Route53 Component
 */
export interface Route53ComponentArgs extends BaseComponentArgs {
    hostedZones: HostedZoneSpec[];
    records?: DNSRecordSpec[];
}

/**
 * Outputs from Route53 Component
 */
export interface Route53ComponentOutputs {
    hostedZoneIds: pulumi.Output<{ [name: string]: string }>;
    nameServers: pulumi.Output<{ [name: string]: string[] }>;
    recordFqdns: pulumi.Output<{ [name: string]: string }>;
}

/**
 * Route53 Component for DNS management
 * Provides hosted zones and DNS record management functionality
 */
export class Route53Component extends BaseAWSComponent implements Route53ComponentOutputs {
    public readonly hostedZoneIds: pulumi.Output<{ [name: string]: string }>;
    public readonly nameServers: pulumi.Output<{ [name: string]: string[] }>;
    public readonly recordFqdns: pulumi.Output<{ [name: string]: string }>;

    private readonly hostedZones: { [name: string]: aws.route53.Zone } = {};
    private readonly records: { [name: string]: aws.route53.Record } = {};

    constructor(
        name: string,
        args: Route53ComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:Route53", name, args, opts);

        // Validate required arguments
        validateRequired(args.hostedZones, "hostedZones", "Route53Component");

        if (args.hostedZones.length === 0) {
            throw new Error("Route53Component: At least one hosted zone must be specified");
        }

        // Create hosted zones
        this.createHostedZones(args);

        // Create DNS records if specified
        if (args.records && args.records.length > 0) {
            this.createDNSRecords(args);
        }

        // Create outputs
        const zoneIds: { [name: string]: pulumi.Output<string> } = {};
        const nameServers: { [name: string]: pulumi.Output<string[]> } = {};
        const recordFqdns: { [name: string]: pulumi.Output<string> } = {};

        Object.entries(this.hostedZones).forEach(([name, zone]) => {
            zoneIds[name] = zone.zoneId;
            nameServers[name] = zone.nameServers;
        });

        Object.entries(this.records).forEach(([name, record]) => {
            recordFqdns[name] = record.fqdn;
        });

        this.hostedZoneIds = pulumi.output(zoneIds);
        this.nameServers = pulumi.output(nameServers);
        this.recordFqdns = pulumi.output(recordFqdns);

        // Register outputs
        this.registerOutputs({
            hostedZoneIds: this.hostedZoneIds,
            nameServers: this.nameServers,
            recordFqdns: this.recordFqdns
        });
    }

    /**
     * Create hosted zones based on specifications
     */
    private createHostedZones(args: Route53ComponentArgs): void {
        args.hostedZones.forEach(zoneSpec => {
            const zoneTags = this.mergeTags({
                Name: zoneSpec.name,
                Type: zoneSpec.private ? "Private" : "Public"
            });

            // Validate private zone configuration
            if (zoneSpec.private && (!zoneSpec.vpcIds || zoneSpec.vpcIds.length === 0)) {
                throw new Error(`Route53Component: Private hosted zone ${zoneSpec.name} requires at least one VPC ID`);
            }

            // Create hosted zone
            const hostedZone = new aws.route53.Zone(
                `${zoneSpec.name.replace(/\./g, "-")}-zone`,
                {
                    name: zoneSpec.name,
                    comment: zoneSpec.comment || `Managed by Pulumi - ${zoneSpec.name}`,
                    delegationSetId: zoneSpec.delegationSetId,
                    forceDestroy: zoneSpec.forceDestroy || false,
                    vpcs: zoneSpec.private && zoneSpec.vpcIds ? zoneSpec.vpcIds.map(vpcId => ({
                        vpcId: vpcId,
                        vpcRegion: this.region
                    })) : undefined,
                    tags: zoneTags
                },
                {
                    parent: this
                }
            );

            this.hostedZones[zoneSpec.name] = hostedZone;
        });
    }

    /**
     * Create DNS records based on specifications
     */
    private createDNSRecords(args: Route53ComponentArgs): void {
        if (!args.records) return;

        args.records.forEach((recordSpec, index) => {
            // Find the hosted zone for this record
            const hostedZone = this.hostedZones[recordSpec.zoneName];
            if (!hostedZone) {
                throw new Error(`Route53Component: Hosted zone ${recordSpec.zoneName} not found for record ${recordSpec.name}`);
            }

            // Validate record type and values
            this.validateRecord(recordSpec);

            const recordName = `${recordSpec.name}-${recordSpec.type}-${index}`;

            // Create DNS record
            const record = new aws.route53.Record(
                recordName,
                {
                    zoneId: hostedZone.zoneId,
                    name: recordSpec.name,
                    type: recordSpec.type,
                    ttl: recordSpec.aliasTarget ? undefined : (recordSpec.ttl || 300),
                    records: recordSpec.aliasTarget ? undefined : recordSpec.values,
                    setIdentifier: recordSpec.setIdentifier,
                    weightedRoutingPolicies: recordSpec.weightedRoutingPolicy ? [recordSpec.weightedRoutingPolicy] : undefined,
                    aliases: recordSpec.aliasTarget ? [{
                        name: recordSpec.aliasTarget.name,
                        zoneId: recordSpec.aliasTarget.zoneId,
                        evaluateTargetHealth: recordSpec.aliasTarget.evaluateTargetHealth || false
                    }] : undefined
                },
                {
                    parent: this
                }
            );

            this.records[recordName] = record;
        });
    }

    /**
     * Validate DNS record specification
     */
    private validateRecord(recordSpec: DNSRecordSpec): void {
        // Validate record type
        const validTypes = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SPF', 'SRV', 'TXT'];
        if (!validTypes.includes(recordSpec.type)) {
            throw new Error(`Route53Component: Invalid record type ${recordSpec.type}. Valid types: ${validTypes.join(', ')}`);
        }

        // Validate that either values or aliasTarget is provided, but not both
        if (recordSpec.aliasTarget && recordSpec.values.length > 0) {
            throw new Error(`Route53Component: Record ${recordSpec.name} cannot have both values and aliasTarget`);
        }

        if (!recordSpec.aliasTarget && recordSpec.values.length === 0) {
            throw new Error(`Route53Component: Record ${recordSpec.name} must have either values or aliasTarget`);
        }

        // Validate CNAME records
        if (recordSpec.type === 'CNAME' && recordSpec.values.length > 1) {
            throw new Error(`Route53Component: CNAME record ${recordSpec.name} can only have one value`);
        }

        // Validate MX records format
        if (recordSpec.type === 'MX') {
            recordSpec.values.forEach(value => {
                if (!/^\d+\s+.+/.test(value)) {
                    throw new Error(`Route53Component: MX record ${recordSpec.name} value "${value}" must be in format "priority hostname"`);
                }
            });
        }

        // Validate SRV records format
        if (recordSpec.type === 'SRV') {
            recordSpec.values.forEach(value => {
                if (!/^\d+\s+\d+\s+\d+\s+.+/.test(value)) {
                    throw new Error(`Route53Component: SRV record ${recordSpec.name} value "${value}" must be in format "priority weight port target"`);
                }
            });
        }
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
     * Create a new DNS record in an existing hosted zone
     */
    public createRecord(
        recordName: string,
        recordSpec: Omit<DNSRecordSpec, 'zoneName'> & { zoneName: string }
    ): aws.route53.Record {
        const hostedZone = this.hostedZones[recordSpec.zoneName];
        if (!hostedZone) {
            throw new Error(`Hosted zone ${recordSpec.zoneName} not found in Route53 component`);
        }

        this.validateRecord(recordSpec as DNSRecordSpec);

        const record = new aws.route53.Record(
            recordName,
            {
                zoneId: hostedZone.zoneId,
                name: recordSpec.name,
                type: recordSpec.type,
                ttl: recordSpec.aliasTarget ? undefined : (recordSpec.ttl || 300),
                records: recordSpec.aliasTarget ? undefined : recordSpec.values,
                setIdentifier: recordSpec.setIdentifier,
                weightedRoutingPolicies: recordSpec.weightedRoutingPolicy ? [recordSpec.weightedRoutingPolicy] : undefined,
                aliases: recordSpec.aliasTarget ? [{
                    name: recordSpec.aliasTarget.name,
                    zoneId: recordSpec.aliasTarget.zoneId,
                    evaluateTargetHealth: recordSpec.aliasTarget.evaluateTargetHealth || false
                }] : undefined
            },
            {
                parent: this
            }
        );

        this.records[recordName] = record;
        return record;
    }
}