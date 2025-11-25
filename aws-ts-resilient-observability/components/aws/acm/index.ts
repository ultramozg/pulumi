import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as namecheap from "pulumi-namecheap";
import { BaseAWSComponent, BaseComponentArgs } from "../../shared/base";
import { ValidationUtils } from "../../shared/utils/error-handling";

/**
 * DNS validation method for ACM certificates
 */
export type DnsValidationMethod = "route53" | "namecheap" | "manual";

/**
 * Route53 validation configuration
 */
export interface Route53ValidationConfig {
    /**
     * Route53 hosted zone ID where validation records will be created
     */
    hostedZoneId: pulumi.Input<string>;
}

/**
 * Namecheap validation configuration
 */
export interface NamecheapValidationConfig {
    /**
     * Namecheap provider for DNS validation
     */
    provider: namecheap.Provider;

    /**
     * Parent domain in Namecheap (e.g., "srelog.dev")
     */
    parentDomain: string;
}

/**
 * Arguments for ACM Certificate Component
 */
export interface AcmCertificateArgs extends BaseComponentArgs {
    /**
     * Domain name for the certificate (e.g., "*.us-east-1.internal.srelog.dev")
     */
    domainName: string;

    /**
     * Subject Alternative Names (optional)
     */
    subjectAlternativeNames?: string[];

    /**
     * DNS validation method
     * - "route53": Automatically create validation records in Route53
     * - "namecheap": Automatically create validation records in Namecheap
     * - "manual": Output validation records for manual creation
     * @default "manual"
     */
    validationMethod?: DnsValidationMethod;

    /**
     * Route53 validation configuration (required if validationMethod is "route53")
     */
    route53Validation?: Route53ValidationConfig;

    /**
     * Namecheap validation configuration (required if validationMethod is "namecheap")
     */
    namecheapValidation?: NamecheapValidationConfig;
}

/**
 * Outputs from ACM Certificate Component
 */
export interface AcmCertificateOutputs {
    certificateArn: pulumi.Output<string>;
    certificate: aws.acm.Certificate;
    /**
     * Validation records (only populated if validationMethod is "manual")
     */
    validationRecords?: pulumi.Output<Array<{
        name: string;
        type: string;
        value: string;
    }>>;
}

/**
 * ACM Certificate Component with Multiple DNS Validation Options
 * Creates ACM certificates and automatically manages validation records
 * Supports Route53, Namecheap, or manual validation
 */
export class AcmCertificateComponent extends BaseAWSComponent implements AcmCertificateOutputs {
    public readonly certificate: aws.acm.Certificate;
    public readonly certificateArn: pulumi.Output<string>;
    public readonly validationRecords?: pulumi.Output<Array<{
        name: string;
        type: string;
        value: string;
    }>>;

    constructor(
        name: string,
        args: AcmCertificateArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:AcmCertificate", name, args, opts);

        const validationMethod = args.validationMethod || "manual";

        // Validate arguments
        this.validateArgs(args, [
            {
                validate: (a) => {
                    ValidationUtils.validateRequired(a.domainName, "domainName", this.getResourceType(), this.getResourceName());
                    
                    // Validate validation method configuration
                    if (validationMethod === "route53" && !a.route53Validation) {
                        throw new Error(`${this.getResourceType()}: route53Validation is required when validationMethod is "route53"`);
                    }
                    if (validationMethod === "namecheap" && !a.namecheapValidation) {
                        throw new Error(`${this.getResourceType()}: namecheapValidation is required when validationMethod is "namecheap"`);
                    }
                }
            }
        ]);

        this.logger.info("Creating ACM certificate", {
            domainName: args.domainName,
            validationMethod: validationMethod,
            region: this.region
        });

        // Create ACM certificate
        // Note: ACM has strict tag value requirements - only letters, spaces, numbers, and _.:\/=+\-@
        // We sanitize tags to ensure they meet ACM requirements
        const acmSafeTags = this.sanitizeTagsForAcm({
            Name: `${name}-certificate`,
            Domain: args.domainName,
            ManagedBy: "Pulumi",
            Stack: pulumi.getStack(),
            Project: pulumi.getProject(),
            ...args.tags
        });

        this.certificate = new aws.acm.Certificate(
            `${name}-cert`,
            {
                domainName: args.domainName,
                subjectAlternativeNames: args.subjectAlternativeNames,
                validationMethod: "DNS",
                tags: acmSafeTags
            },
            {
                parent: this,
                provider: this.createProvider()
            }
        );

        this.certificateArn = this.certificate.arn;

        // Handle validation based on method
        switch (validationMethod) {
            case "route53":
                this.createRoute53ValidationRecords(name, args);
                break;
            case "namecheap":
                this.createNamecheapValidationRecords(name, args);
                break;
            case "manual":
                this.validationRecords = this.extractValidationRecords();
                this.logger.info("Manual validation selected - validation records will be exported", {
                    domainName: args.domainName
                });
                break;
        }

        this.logger.info("ACM certificate created", {
            domainName: args.domainName,
            validationMethod: validationMethod
        });

        this.registerOutputs({
            certificateArn: this.certificateArn,
            validationRecords: this.validationRecords
        });
    }

    /**
     * Create DNS validation records in Route53
     */
    private createRoute53ValidationRecords(name: string, args: AcmCertificateArgs): void {
        if (!args.route53Validation) {
            throw new Error("Route53 validation configuration is required");
        }

        const validationOptions = this.certificate.domainValidationOptions;

        validationOptions.apply(options => {
            options.forEach((validation, index) => {
                this.logger.debug("Creating Route53 validation record", {
                    recordName: validation.resourceRecordName,
                    recordValue: validation.resourceRecordValue,
                    domain: validation.domainName
                });

                new aws.route53.Record(
                    `${name}-validation-${index}`,
                    {
                        zoneId: args.route53Validation!.hostedZoneId,
                        name: validation.resourceRecordName,
                        type: validation.resourceRecordType,
                        records: [validation.resourceRecordValue],
                        ttl: 60,
                        allowOverwrite: true
                    },
                    {
                        parent: this,
                        provider: this.createProvider()
                    }
                );
            });
        });

        this.logger.info("Route53 validation records created");
    }

    /**
     * Create DNS validation records in Namecheap
     * 
     * WARNING: Namecheap's pulumi-namecheap provider uses DomainRecords which manages
     * ALL DNS records for a domain. Using mode: "MERGE" to avoid overwriting existing records.
     * If you have many existing records, consider using validationMethod: "manual" instead.
     */
    private createNamecheapValidationRecords(name: string, args: AcmCertificateArgs): void {
        if (!args.namecheapValidation) {
            throw new Error("Namecheap validation configuration is required");
        }

        const validationOptions = this.certificate.domainValidationOptions;

        validationOptions.apply(options => {
            // Extract subdomain from validation record name
            // e.g., "_abc123.us-east-1.internal.srelog.dev" -> "_abc123.us-east-1.internal"
            const records = options.map(validation => {
                const fullRecordName = validation.resourceRecordName;
                const hostname = fullRecordName
                    .replace(`.${args.namecheapValidation!.parentDomain}.`, '')
                    .replace(`.${args.namecheapValidation!.parentDomain}`, '');

                this.logger.debug("Preparing Namecheap validation record", {
                    hostname,
                    recordValue: validation.resourceRecordValue,
                    domain: validation.domainName
                });

                return {
                    hostname: hostname,
                    type: "CNAME",
                    address: validation.resourceRecordValue,
                    ttl: 60
                };
            });

            // Create DomainRecords resource with MERGE mode to preserve existing records
            new namecheap.DomainRecords(
                `${name}-validation`,
                {
                    domain: args.namecheapValidation!.parentDomain,
                    mode: "MERGE", // Important: merge with existing records
                    records: records
                },
                {
                    parent: this,
                    provider: args.namecheapValidation!.provider
                }
            );
        });

        this.logger.info("Namecheap validation records created (MERGE mode)");
    }

    /**
     * Extract validation records for manual creation
     */
    private extractValidationRecords(): pulumi.Output<Array<{
        name: string;
        type: string;
        value: string;
    }>> {
        return this.certificate.domainValidationOptions.apply(options => {
            return options.map(validation => ({
                name: validation.resourceRecordName,
                type: validation.resourceRecordType,
                value: validation.resourceRecordValue
            }));
        });
    }

    /**
     * Sanitize tags to meet ACM requirements
     * ACM tag values must match: [\p{L}\p{Z}\p{N}_.:\/=+\-@]*
     * This allows: letters, spaces, numbers, and the characters _.:\/=+\-@
     */
    private sanitizeTagsForAcm(tags: { [key: string]: string }): { [key: string]: string } {
        const sanitized: { [key: string]: string } = {};

        // ACM regex pattern allows: letters, spaces, numbers, and _.:\/=+\-@
        const acmPattern = /^[\p{L}\p{Z}\p{N}_.:\/=+\-@]*$/u;

        Object.entries(tags).forEach(([key, value]) => {
            if (acmPattern.test(value)) {
                sanitized[key] = value;
            } else {
                // Log warning about skipped tag
                this.logger.warn("Skipping tag with invalid characters for ACM", {
                    key,
                    value,
                    reason: "Does not match ACM tag value pattern"
                });
            }
        });

        return sanitized;
    }
}
