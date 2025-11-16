import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs } from "../../../shared/base";
import { ValidationUtils } from "../../../shared/utils/error-handling";

/**
 * DNS record specification
 */
export interface DNSRecordSpec {
    zoneId: pulumi.Input<string>;
    name: string;
    type: "A" | "AAAA" | "CNAME" | "MX" | "NS" | "PTR" | "SOA" | "SPF" | "SRV" | "TXT" | "CAA";
    values?: string[];
    ttl?: number;
    setIdentifier?: string;
    weightedRoutingPolicy?: {
        weight: number;
    };
    failoverRoutingPolicy?: {
        type: "PRIMARY" | "SECONDARY";
    };
    geolocationRoutingPolicy?: {
        continent?: string;
        country?: string;
        subdivision?: string;
    };
    latencyRoutingPolicy?: {
        region: string;
    };
    aliasTarget?: {
        name: string;
        zoneId: string;
        evaluateTargetHealth?: boolean;
    };
    healthCheckId?: string;
}

/**
 * Arguments for Route53 Records Component
 */
export interface Route53RecordsArgs extends BaseComponentArgs {
    records: DNSRecordSpec[];
}

/**
 * Outputs from Route53 Records Component
 */
export interface Route53RecordsOutputs {
    recordFqdns: pulumi.Output<{ [name: string]: string }>;
    recordNames: pulumi.Output<string[]>;
}

/**
 * Route53 Records Component
 * Manages DNS records in Route 53 hosted zones
 */
export class Route53RecordsComponent extends BaseAWSComponent implements Route53RecordsOutputs {
    public readonly recordFqdns: pulumi.Output<{ [name: string]: string }>;
    public readonly recordNames: pulumi.Output<string[]>;

    private readonly records: { [name: string]: aws.route53.Record } = {};

    constructor(
        name: string,
        args: Route53RecordsArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:Route53Records", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [
            {
                validate: (a) => {
                    ValidationUtils.validateRequired(a.records, "records", this.getResourceType(), this.getResourceName());
                    ValidationUtils.validateNonEmptyArray(a.records, "records", this.getResourceType(), this.getResourceName());
                }
            }
        ]);

        // Create DNS records
        this.createDNSRecords(args);

        // Create outputs
        const recordFqdns: { [name: string]: pulumi.Output<string> } = {};
        const recordNames: string[] = [];

        Object.entries(this.records).forEach(([name, record]) => {
            recordFqdns[name] = record.fqdn;
            recordNames.push(name);
        });

        this.recordFqdns = pulumi.output(recordFqdns);
        this.recordNames = pulumi.output(recordNames);

        // Register outputs
        this.registerOutputs({
            recordFqdns: this.recordFqdns,
            recordNames: this.recordNames
        });
    }

    /**
     * Create DNS records based on specifications
     */
    private createDNSRecords(args: Route53RecordsArgs): void {
        this.logger.info("Creating Route 53 DNS records", {
            count: args.records.length
        });

        args.records.forEach((recordSpec, index) => {
            this.validateRecord(recordSpec, index);

            const recordName = `${recordSpec.name.replace(/[.*]/g, "")}-${recordSpec.type}-${index}`;

            // Create DNS record
            const record = new aws.route53.Record(
                recordName,
                {
                    zoneId: recordSpec.zoneId,
                    name: recordSpec.name,
                    type: recordSpec.type,
                    ttl: recordSpec.aliasTarget ? undefined : (recordSpec.ttl || 300),
                    records: recordSpec.aliasTarget ? undefined : recordSpec.values,
                    setIdentifier: recordSpec.setIdentifier,
                    weightedRoutingPolicies: recordSpec.weightedRoutingPolicy ? [recordSpec.weightedRoutingPolicy] : undefined,
                    failoverRoutingPolicies: recordSpec.failoverRoutingPolicy ? [recordSpec.failoverRoutingPolicy] : undefined,
                    geolocationRoutingPolicies: recordSpec.geolocationRoutingPolicy ? [recordSpec.geolocationRoutingPolicy] : undefined,
                    latencyRoutingPolicies: recordSpec.latencyRoutingPolicy ? [recordSpec.latencyRoutingPolicy] : undefined,
                    aliases: recordSpec.aliasTarget ? [{
                        name: recordSpec.aliasTarget.name,
                        zoneId: recordSpec.aliasTarget.zoneId,
                        evaluateTargetHealth: recordSpec.aliasTarget.evaluateTargetHealth || false
                    }] : undefined,
                    healthCheckId: recordSpec.healthCheckId
                },
                {
                    parent: this,
                    provider: this.createProvider()
                }
            );

            this.records[recordName] = record;

            this.logger.info("DNS record created", {
                name: recordSpec.name,
                type: recordSpec.type
            });
        });
    }

    /**
     * Validate DNS record specification
     */
    private validateRecord(recordSpec: DNSRecordSpec, index: number): void {
        const recordId = `records[${index}]`;

        // Validate required fields
        ValidationUtils.validateRequired(recordSpec.zoneId, `${recordId}.zoneId`, this.getResourceType(), this.getResourceName());
        ValidationUtils.validateRequired(recordSpec.name, `${recordId}.name`, this.getResourceType(), this.getResourceName());
        ValidationUtils.validateRequired(recordSpec.type, `${recordId}.type`, this.getResourceType(), this.getResourceName());

        // Validate record type
        const validTypes = ["A", "AAAA", "CNAME", "MX", "NS", "PTR", "SOA", "SPF", "SRV", "TXT", "CAA"];
        ValidationUtils.validateEnum(recordSpec.type, `${recordId}.type`, validTypes, this.getResourceType(), this.getResourceName());

        // Validate that either values or aliasTarget is provided, but not both
        if (recordSpec.aliasTarget && recordSpec.values && recordSpec.values.length > 0) {
            throw new Error(`${this.getResourceType()}: Record ${recordSpec.name} cannot have both values and aliasTarget`);
        }

        if (!recordSpec.aliasTarget && (!recordSpec.values || recordSpec.values.length === 0)) {
            throw new Error(`${this.getResourceType()}: Record ${recordSpec.name} must have either values or aliasTarget`);
        }

        // Validate CNAME records
        if (recordSpec.type === "CNAME" && recordSpec.values && recordSpec.values.length > 1) {
            throw new Error(`${this.getResourceType()}: CNAME record ${recordSpec.name} can only have one value`);
        }

        // Validate MX records format
        if (recordSpec.type === "MX" && recordSpec.values) {
            recordSpec.values.forEach((value, valueIndex) => {
                if (!/^\d+\s+.+/.test(value)) {
                    throw new Error(`${this.getResourceType()}: MX record ${recordSpec.name} value[${valueIndex}] "${value}" must be in format "priority hostname"`);
                }
            });
        }

        // Validate SRV records format
        if (recordSpec.type === "SRV" && recordSpec.values) {
            recordSpec.values.forEach((value, valueIndex) => {
                if (!/^\d+\s+\d+\s+\d+\s+.+/.test(value)) {
                    throw new Error(`${this.getResourceType()}: SRV record ${recordSpec.name} value[${valueIndex}] "${value}" must be in format "priority weight port target"`);
                }
            });
        }

        // Validate TTL if provided
        if (recordSpec.ttl !== undefined && !recordSpec.aliasTarget) {
            ValidationUtils.validateRange(recordSpec.ttl, `${recordId}.ttl`, 0, 2147483647, this.getResourceType(), this.getResourceName());
        }

        // Validate routing policies
        const routingPolicies = [
            recordSpec.weightedRoutingPolicy,
            recordSpec.failoverRoutingPolicy,
            recordSpec.geolocationRoutingPolicy,
            recordSpec.latencyRoutingPolicy
        ].filter(p => p !== undefined);

        if (routingPolicies.length > 1) {
            throw new Error(`${this.getResourceType()}: Record ${recordSpec.name} can only have one routing policy`);
        }

        if (routingPolicies.length > 0 && !recordSpec.setIdentifier) {
            throw new Error(`${this.getResourceType()}: Record ${recordSpec.name} with routing policy must have setIdentifier`);
        }

        this.logger.debug("Record validation successful", {
            index,
            name: recordSpec.name,
            type: recordSpec.type
        });
    }

    /**
     * Get record by name
     */
    public getRecord(recordName: string): aws.route53.Record {
        const record = this.records[recordName];
        if (!record) {
            throw new Error(`Record ${recordName} not found in Route53 Records component`);
        }
        return record;
    }

    /**
     * Get all record names
     */
    public getAllRecordNames(): string[] {
        return Object.keys(this.records);
    }

    /**
     * Get FQDN for a record
     */
    public getRecordFqdn(recordName: string): pulumi.Output<string> {
        const record = this.records[recordName];
        if (!record) {
            throw new Error(`Record ${recordName} not found in Route53 Records component`);
        }
        return record.fqdn;
    }
}
