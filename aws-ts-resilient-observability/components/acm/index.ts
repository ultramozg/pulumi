import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs, validateRequired, validateRegion } from "../base";

/**
 * Certificate specification for ACM
 */
export interface CertificateSpec {
    domainName: string;
    subjectAlternativeNames?: string[];
    validationMethod: 'DNS' | 'EMAIL';
    hostedZoneId?: string; // Required for DNS validation
    validationOptions?: Array<{
        domainName: string;
        validationDomain: string;
    }>;
    certificateTransparencyLoggingPreference?: 'ENABLED' | 'DISABLED';
}

/**
 * Arguments for ACM Component
 */
export interface ACMComponentArgs extends BaseComponentArgs {
    certificates: CertificateSpec[];
    keyAlgorithm?: 'RSA_2048' | 'RSA_1024' | 'RSA_4096' | 'EC_prime256v1' | 'EC_secp384r1' | 'EC_secp521r1';
    validationTimeoutMinutes?: number;
}

/**
 * Outputs from ACM Component
 */
export interface ACMComponentOutputs {
    certificateArns: pulumi.Output<{ [domainName: string]: string }>;
    certificateStatuses: pulumi.Output<{ [domainName: string]: string }>;
    validationRecords: pulumi.Output<{ [domainName: string]: any[] }>;
}

/**
 * ACM Component for SSL/TLS certificate management
 * Provides certificate provisioning and validation across regions
 */
export class ACMComponent extends BaseAWSComponent implements ACMComponentOutputs {
    public readonly certificateArns: pulumi.Output<{ [domainName: string]: string }>;
    public readonly certificateStatuses: pulumi.Output<{ [domainName: string]: string }>;
    public readonly validationRecords: pulumi.Output<{ [domainName: string]: any[] }>;

    private readonly certificates: { [domainName: string]: aws.acm.Certificate } = {};
    private readonly validations: { [domainName: string]: aws.acm.CertificateValidation } = {};
    private readonly dnsRecords: { [domainName: string]: aws.route53.Record[] } = {};

    constructor(
        name: string,
        args: ACMComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:ACM", name, args, opts);

        // Validate required arguments
        validateRequired(args.certificates, "certificates", "ACMComponent");
        validateRegion(this.region, "ACMComponent");

        if (args.certificates.length === 0) {
            throw new Error("ACMComponent: At least one certificate must be specified");
        }

        // Validate certificate specifications
        this.validateCertificateSpecs(args.certificates);

        // Create certificates
        this.createCertificates(args);

        // Create DNS validation records for DNS validation method
        this.createDNSValidationRecords(args);

        // Create certificate validations
        this.createCertificateValidations(args);

        // Create outputs
        const certificateArns: { [domainName: string]: pulumi.Output<string> } = {};
        const certificateStatuses: { [domainName: string]: pulumi.Output<string> } = {};
        const validationRecords: { [domainName: string]: pulumi.Output<any[]> } = {};

        Object.entries(this.certificates).forEach(([domainName, certificate]) => {
            certificateArns[domainName] = certificate.arn;
            certificateStatuses[domainName] = certificate.status;
            validationRecords[domainName] = certificate.domainValidationOptions;
        });

        this.certificateArns = pulumi.output(certificateArns);
        this.certificateStatuses = pulumi.output(certificateStatuses);
        this.validationRecords = pulumi.output(validationRecords);

        // Register outputs
        this.registerOutputs({
            certificateArns: this.certificateArns,
            certificateStatuses: this.certificateStatuses,
            validationRecords: this.validationRecords
        });
    }

    /**
     * Validate certificate specifications
     */
    private validateCertificateSpecs(certificates: CertificateSpec[]): void {
        certificates.forEach((certSpec, index) => {
            // Validate domain name format
            if (!this.isValidDomainName(certSpec.domainName)) {
                throw new Error(`ACMComponent: Invalid domain name format: ${certSpec.domainName}`);
            }

            // Validate subject alternative names
            if (certSpec.subjectAlternativeNames) {
                certSpec.subjectAlternativeNames.forEach(san => {
                    if (!this.isValidDomainName(san)) {
                        throw new Error(`ACMComponent: Invalid SAN domain name format: ${san}`);
                    }
                });
            }

            // Validate DNS validation requirements
            if (certSpec.validationMethod === 'DNS' && !certSpec.hostedZoneId) {
                throw new Error(`ACMComponent: DNS validation requires hostedZoneId for certificate ${certSpec.domainName}`);
            }

            // Validate validation method
            if (!['DNS', 'EMAIL'].includes(certSpec.validationMethod)) {
                throw new Error(`ACMComponent: Invalid validation method ${certSpec.validationMethod}. Must be DNS or EMAIL`);
            }
        });
    }

    /**
     * Validate domain name format
     */
    private isValidDomainName(domain: string): boolean {
        // Basic domain name validation
        const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        const wildcardDomainRegex = /^\*\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
        
        return domainRegex.test(domain) || wildcardDomainRegex.test(domain);
    }

    /**
     * Create ACM certificates
     */
    private createCertificates(args: ACMComponentArgs): void {
        args.certificates.forEach(certSpec => {
            const certificateTags = this.mergeTags({
                Name: certSpec.domainName,
                ValidationMethod: certSpec.validationMethod,
                Domain: certSpec.domainName
            });

            // Create certificate
            const certificate = new aws.acm.Certificate(
                `${certSpec.domainName.replace(/[.*]/g, "-")}-cert`,
                {
                    domainName: certSpec.domainName,
                    subjectAlternativeNames: certSpec.subjectAlternativeNames,
                    validationMethod: certSpec.validationMethod,
                    validationOptions: certSpec.validationOptions,
                    keyAlgorithm: args.keyAlgorithm || 'RSA_2048',
                    options: {
                        certificateTransparencyLoggingPreference: certSpec.certificateTransparencyLoggingPreference || 'ENABLED'
                    },
                    tags: certificateTags,

                },
                {
                    parent: this
                }
            );

            this.certificates[certSpec.domainName] = certificate;
        });
    }

    /**
     * Create DNS validation records for certificates using DNS validation
     */
    private createDNSValidationRecords(args: ACMComponentArgs): void {
        args.certificates
            .filter(certSpec => certSpec.validationMethod === 'DNS' && certSpec.hostedZoneId)
            .forEach(certSpec => {
                const certificate = this.certificates[certSpec.domainName];
                
                // Create DNS validation records
                const validationRecords: aws.route53.Record[] = [];
                
                // Create validation record for primary domain
                const primaryValidationRecord = new aws.route53.Record(
                    `${certSpec.domainName.replace(/[.*]/g, "-")}-validation`,
                    {
                        name: certificate.domainValidationOptions.apply(options => 
                            options && options.length > 0 ? options[0].resourceRecordName : ""
                        ),
                        records: [certificate.domainValidationOptions.apply(options => 
                            options && options.length > 0 ? options[0].resourceRecordValue : ""
                        )],
                        ttl: 60,
                        type: certificate.domainValidationOptions.apply(options => 
                            options && options.length > 0 ? options[0].resourceRecordType : "CNAME"
                        ),
                        zoneId: certSpec.hostedZoneId!,
                        allowOverwrite: true
                    },
                    {
                        parent: this
                    }
                );
                
                validationRecords.push(primaryValidationRecord);

                // Create validation records for SANs if they exist
                if (certSpec.subjectAlternativeNames && certSpec.subjectAlternativeNames.length > 0) {
                    certSpec.subjectAlternativeNames.forEach((san, index) => {
                        const sanValidationRecord = new aws.route53.Record(
                            `${san.replace(/[.*]/g, "-")}-validation`,
                            {
                                name: certificate.domainValidationOptions.apply(options => 
                                    options && options.length > 0 ? 
                                    (options.find(opt => opt.domainName === san)?.resourceRecordName || "") : ""
                                ),
                                records: [certificate.domainValidationOptions.apply(options => 
                                    options && options.length > 0 ? 
                                    (options.find(opt => opt.domainName === san)?.resourceRecordValue || "") : ""
                                )],
                                ttl: 60,
                                type: certificate.domainValidationOptions.apply(options => 
                                    options && options.length > 0 ? 
                                    (options.find(opt => opt.domainName === san)?.resourceRecordType || "CNAME") : "CNAME"
                                ),
                                zoneId: certSpec.hostedZoneId!,
                                allowOverwrite: true
                            },
                            {
                                parent: this
                            }
                        );
                        
                        validationRecords.push(sanValidationRecord);
                    });
                }

                this.dnsRecords[certSpec.domainName] = validationRecords;
            });
    }

    /**
     * Create certificate validations
     */
    private createCertificateValidations(args: ACMComponentArgs): void {
        args.certificates.forEach(certSpec => {
            const certificate = this.certificates[certSpec.domainName];
            
            // For DNS validation, wait for DNS records to be created
            if (certSpec.validationMethod === 'DNS' && certSpec.hostedZoneId) {
                const dnsRecords = this.dnsRecords[certSpec.domainName];
                
                const validation = new aws.acm.CertificateValidation(
                    `${certSpec.domainName.replace(/[.*]/g, "-")}-validation`,
                    {
                        certificateArn: certificate.arn,
                        validationRecordFqdns: dnsRecords.map(record => record.fqdn)
                    },
                    {
                        parent: this,
                        dependsOn: dnsRecords
                    }
                );

                this.validations[certSpec.domainName] = validation;
            } else if (certSpec.validationMethod === 'EMAIL') {
                // For email validation, create validation without DNS records
                const validation = new aws.acm.CertificateValidation(
                    `${certSpec.domainName.replace(/[.*]/g, "-")}-validation`,
                    {
                        certificateArn: certificate.arn
                    },
                    {
                        parent: this
                    }
                );

                this.validations[certSpec.domainName] = validation;
            }
        });
    }

    /**
     * Get certificate ARN by domain name
     */
    public getCertificateArn(domainName: string): pulumi.Output<string> {
        const certificate = this.certificates[domainName];
        if (!certificate) {
            throw new Error(`Certificate for domain ${domainName} not found in ACM component`);
        }
        return certificate.arn;
    }

    /**
     * Get certificate status by domain name
     */
    public getCertificateStatus(domainName: string): pulumi.Output<string> {
        const certificate = this.certificates[domainName];
        if (!certificate) {
            throw new Error(`Certificate for domain ${domainName} not found in ACM component`);
        }
        return certificate.status;
    }

    /**
     * Get validation records for a certificate
     */
    public getValidationRecords(domainName: string): pulumi.Output<any[]> {
        const certificate = this.certificates[domainName];
        if (!certificate) {
            throw new Error(`Certificate for domain ${domainName} not found in ACM component`);
        }
        return certificate.domainValidationOptions;
    }

    /**
     * Check if certificate is validated
     */
    public isCertificateValidated(domainName: string): pulumi.Output<boolean> {
        const validation = this.validations[domainName];
        if (!validation) {
            return pulumi.output(false);
        }
        return validation.certificateArn.apply(arn => arn !== undefined && arn !== "");
    }

    /**
     * Get all certificate ARNs
     */
    public getAllCertificateArns(): pulumi.Output<{ [domainName: string]: string }> {
        return this.certificateArns;
    }

    /**
     * Create a new certificate in the existing component
     */
    public addCertificate(
        certSpec: CertificateSpec,
        keyAlgorithm?: string,
        validationTimeoutMinutes?: number
    ): aws.acm.Certificate {
        // Validate the new certificate spec
        this.validateCertificateSpecs([certSpec]);

        const certificateTags = this.mergeTags({
            Name: certSpec.domainName,
            ValidationMethod: certSpec.validationMethod,
            Domain: certSpec.domainName
        });

        // Create certificate
        const certificate = new aws.acm.Certificate(
            `${certSpec.domainName.replace(/[.*]/g, "-")}-cert-additional`,
            {
                domainName: certSpec.domainName,
                subjectAlternativeNames: certSpec.subjectAlternativeNames,
                validationMethod: certSpec.validationMethod,
                validationOptions: certSpec.validationOptions,
                keyAlgorithm: keyAlgorithm || 'RSA_2048',
                options: {
                    certificateTransparencyLoggingPreference: certSpec.certificateTransparencyLoggingPreference || 'ENABLED'
                },
                tags: certificateTags,

            },
            {
                parent: this
            }
        );

        this.certificates[certSpec.domainName] = certificate;

        // Create DNS validation if needed
        if (certSpec.validationMethod === 'DNS' && certSpec.hostedZoneId) {
            const validationRecord = new aws.route53.Record(
                `${certSpec.domainName.replace(/[.*]/g, "-")}-validation-additional`,
                {
                    name: certificate.domainValidationOptions.apply(options => 
                        options && options.length > 0 ? options[0].resourceRecordName : ""
                    ),
                    records: [certificate.domainValidationOptions.apply(options => 
                        options && options.length > 0 ? options[0].resourceRecordValue : ""
                    )],
                    ttl: 60,
                    type: certificate.domainValidationOptions.apply(options => 
                        options && options.length > 0 ? options[0].resourceRecordType : "CNAME"
                    ),
                    zoneId: certSpec.hostedZoneId,
                    allowOverwrite: true
                },
                {
                    parent: this
                }
            );

            // Create validation
            const validation = new aws.acm.CertificateValidation(
                `${certSpec.domainName.replace(/[.*]/g, "-")}-validation-additional`,
                {
                    certificateArn: certificate.arn,
                    validationRecordFqdns: [validationRecord.fqdn],

                },
                {
                    parent: this,
                    dependsOn: [validationRecord]
                }
            );

            this.validations[certSpec.domainName] = validation;
            this.dnsRecords[certSpec.domainName] = [validationRecord];
        }

        return certificate;
    }
}