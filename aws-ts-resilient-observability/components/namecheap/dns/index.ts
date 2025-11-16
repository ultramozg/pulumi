import * as pulumi from "@pulumi/pulumi";
import * as namecheap from "pulumi-namecheap";
import { BaseAWSComponent, BaseComponentArgs } from "../../shared/base";
import { ValidationUtils } from "../../shared/utils/error-handling";

/**
 * DNS record specification for Namecheap
 */
export interface NamecheapRecordSpec {
    hostname: string;
    type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV" | "CAA" | "URL" | "URL301" | "FRAME";
    address: string;
    mxPref?: number;
    ttl?: number;
}

/**
 * Arguments for Namecheap DNS Component
 */
export interface NamecheapDNSComponentArgs extends BaseComponentArgs {
    domain: string;
    records: NamecheapRecordSpec[];
    mode?: "MERGE" | "OVERWRITE";
    emailType?: string;
}

/**
 * Outputs from Namecheap DNS Component
 */
export interface NamecheapDNSComponentOutputs {
    domain: pulumi.Output<string>;
    recordIds: pulumi.Output<string[]>;
}

/**
 * Namecheap DNS Component for DNS management
 * Manages DNS records for domains registered with Namecheap
 */
export class NamecheapDNSComponent extends BaseAWSComponent implements NamecheapDNSComponentOutputs {
    public readonly domain: pulumi.Output<string>;
    public readonly recordIds: pulumi.Output<string[]>;

    private readonly domainRecords: namecheap.DomainRecords;
    private readonly recordSpecs: NamecheapRecordSpec[];

    constructor(
        name: string,
        args: NamecheapDNSComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:namecheap:DNS", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [
            {
                validate: (a) => {
                    ValidationUtils.validateRequired(a.domain, "domain", this.getResourceType(), this.getResourceName());
                    ValidationUtils.validateNonEmptyArray(a.records, "records", this.getResourceType(), this.getResourceName());
                }
            }
        ]);

        this.recordSpecs = args.records;

        // Create domain records
        this.domainRecords = this.createDomainRecords(args);

        // Create outputs
        this.domain = pulumi.output(args.domain);
        this.recordIds = pulumi.output(args.records.map((_, idx) => `${args.domain}-record-${idx}`));

        // Register outputs
        this.registerOutputs({
            domain: this.domain,
            recordIds: this.recordIds
        });
    }

    /**
     * Create domain records for Namecheap
     */
    private createDomainRecords(args: NamecheapDNSComponentArgs): namecheap.DomainRecords {
        this.logger.info("Creating Namecheap domain records", {
            domain: args.domain,
            recordCount: args.records.length
        });

        // Validate all records before creating
        args.records.forEach((record, idx) => {
            this.validateRecord(record, idx);
        });

        // Create the domain records resource
        const domainRecords = new namecheap.DomainRecords(
            `${args.domain.replace(/\./g, "-")}-records`,
            {
                domain: args.domain,
                mode: args.mode || "MERGE",
                emailType: args.emailType,
                records: args.records.map(record => ({
                    hostname: record.hostname,
                    type: record.type,
                    address: record.address,
                    mxPref: record.mxPref,
                    ttl: record.ttl || 1800
                }))
            },
            {
                parent: this
            }
        );

        this.logger.info("Namecheap domain records created successfully", {
            domain: args.domain
        });

        return domainRecords;
    }

    /**
     * Validate DNS record specification
     */
    private validateRecord(record: NamecheapRecordSpec, index: number): void {
        const recordId = `record[${index}]`;

        // Validate required fields
        ValidationUtils.validateRequired(record.hostname, `${recordId}.hostname`, this.getResourceType(), this.getResourceName());
        ValidationUtils.validateRequired(record.type, `${recordId}.type`, this.getResourceType(), this.getResourceName());
        ValidationUtils.validateRequired(record.address, `${recordId}.address`, this.getResourceType(), this.getResourceName());

        // Validate record type
        const validTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "URL", "URL301", "FRAME"];
        ValidationUtils.validateEnum(record.type, `${recordId}.type`, validTypes, this.getResourceType(), this.getResourceName());

        // Validate MX records have mxPref
        if (record.type === "MX" && record.mxPref === undefined) {
            this.logger.warn("MX record missing mxPref, using default value 10", { hostname: record.hostname });
        }

        // Validate TTL if provided
        if (record.ttl !== undefined) {
            ValidationUtils.validateRange(record.ttl, `${recordId}.ttl`, 60, 86400, this.getResourceType(), this.getResourceName());
        }

        // Validate hostname format
        if (record.hostname !== "@" && record.hostname !== "*" && !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(record.hostname)) {
            throw new Error(`${this.getResourceType()}: Invalid hostname format for ${recordId}: ${record.hostname}`);
        }

        this.logger.debug("Record validation successful", {
            index,
            hostname: record.hostname,
            type: record.type
        });
    }

    /**
     * Get all record specifications
     */
    public getRecords(): NamecheapRecordSpec[] {
        return this.recordSpecs;
    }

    /**
     * Get domain name
     */
    public getDomain(): pulumi.Output<string> {
        return this.domain;
    }
}
