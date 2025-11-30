import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, BaseComponentArgs } from "../../shared/base";
import { CommonValidationRules } from "../../shared/base";
import { createEKSKubernetesProvider } from "../../shared/utils/kubernetes-helpers";

/**
 * Storage backend configuration for Mimir
 */
export interface MimirStorageConfig {
    /**
     * Storage backend type (s3, gcs, azure - future support)
     */
    type: "s3" | "gcs" | "azure";

    /**
     * S3-specific configuration
     */
    s3?: {
        /**
         * Custom bucket name (optional - will be auto-generated if not provided)
         */
        bucketName?: string;

        /**
         * Enable versioning on the S3 bucket
         */
        versioning?: boolean;

        /**
         * Server-side encryption configuration
         */
        encryption?: {
            enabled: boolean;
            kmsKeyId?: string;
        };

        /**
         * Lifecycle rules for metrics retention
         */
        lifecycleRules?: {
            enabled: boolean;
            transitionToIA?: number; // Days to transition to Infrequent Access
            transitionToGlacier?: number; // Days to transition to Glacier
            expiration?: number; // Days to expire metrics
        };

        /**
         * Force destroy bucket on deletion (use with caution)
         */
        forceDestroy?: boolean;
    };

    // Future: GCS configuration
    gcs?: {
        bucketName?: string;
    };

    // Future: Azure configuration
    azure?: {
        containerName?: string;
    };
}

/**
 * Mimir Helm chart configuration
 */
export interface MimirHelmConfig {
    /**
     * Helm chart version
     */
    chartVersion?: string;

    /**
     * Helm chart repository
     */
    repository?: string;

    /**
     * Kubernetes namespace
     */
    namespace?: string;

    /**
     * Custom Helm values
     */
    values?: any;

    /**
     * Resource requests and limits per component
     */
    resources?: {
        distributor?: {
            requests?: { cpu?: string; memory?: string };
            limits?: { cpu?: string; memory?: string };
        };
        ingester?: {
            requests?: { cpu?: string; memory?: string };
            limits?: { cpu?: string; memory?: string };
        };
        querier?: {
            requests?: { cpu?: string; memory?: string };
            limits?: { cpu?: string; memory?: string };
        };
        storeGateway?: {
            requests?: { cpu?: string; memory?: string };
            limits?: { cpu?: string; memory?: string };
        };
    };

    /**
     * Replica counts per component
     */
    replicas?: {
        distributor?: number;
        ingester?: number;
        querier?: number;
        queryFrontend?: number;
        storeGateway?: number;
        compactor?: number;
    };

    /**
     * Retention period for metrics (in hours or days)
     * Examples: "720h" (30 days), "90d"
     */
    retentionPeriod?: string;

    /**
     * Enable ruler for recording rules and alerts
     */
    ruler?: {
        enabled: boolean;
        replicas?: number;
    };

    /**
     * Enable alertmanager
     */
    alertmanager?: {
        enabled: boolean;
        replicas?: number;
    };
}

/**
 * Arguments for Mimir Component
 */
export interface MimirComponentArgs extends BaseComponentArgs {
    /**
     * EKS cluster name where Mimir will be deployed
     */
    clusterName: pulumi.Input<string>;

    /**
     * EKS cluster endpoint
     */
    clusterEndpoint: pulumi.Input<string>;

    /**
     * EKS cluster certificate authority data
     */
    clusterCertificateAuthority: pulumi.Input<string>;

    /**
     * EKS cluster OIDC provider ARN for IRSA
     */
    oidcProviderArn?: pulumi.Input<string>;

    /**
     * EKS cluster OIDC provider URL for IRSA
     */
    oidcProviderUrl?: pulumi.Input<string>;

    /**
     * Storage configuration
     */
    storage: MimirStorageConfig;

    /**
     * Helm configuration
     */
    helm: MimirHelmConfig;

    /**
     * Enable multi-tenancy
     */
    multiTenancy?: boolean;

    /**
     * Optional IAM role ARN to assume when authenticating to EKS
     */
    roleArn?: pulumi.Input<string>;
}

/**
 * Outputs from Mimir Component
 */
export interface MimirComponentOutputs {
    /**
     * S3 bucket name (if S3 storage is used)
     */
    bucketName?: pulumi.Output<string>;

    /**
     * S3 bucket ARN
     */
    bucketArn?: pulumi.Output<string>;

    /**
     * IAM role ARN for service account
     */
    serviceAccountRoleArn?: pulumi.Output<string>;

    /**
     * Mimir query endpoint (internal cluster DNS)
     */
    queryEndpoint: pulumi.Output<string>;

    /**
     * Mimir distributor endpoint for metrics ingestion (Prometheus remote write)
     */
    distributorEndpoint: pulumi.Output<string>;

    /**
     * Alertmanager endpoint (if enabled)
     */
    alertmanagerEndpoint?: pulumi.Output<string>;

    /**
     * Helm release name
     */
    releaseName: pulumi.Output<string>;

    /**
     * Namespace where Mimir is deployed
     */
    namespace: pulumi.Output<string>;
}

/**
 * Grafana Mimir Component with S3 backend storage
 *
 * This component deploys Grafana Mimir for horizontally scalable metrics storage
 * with automatic S3 bucket provisioning and IRSA configuration.
 *
 * Mimir is the successor to Cortex and provides:
 * - Prometheus-compatible remote write and query API
 * - Horizontal scalability for metrics storage
 * - Multi-tenancy support
 * - Recording rules and alerting via built-in ruler
 * - Long-term metrics retention with S3 backend
 * - Built-in compactor for efficient storage
 *
 * Features:
 * - Automatic S3 bucket creation with encryption and lifecycle policies
 * - IRSA (IAM Roles for Service Accounts) integration
 * - Distributed microservices architecture
 * - Prometheus-compatible ingestion and querying
 * - Multi-cloud storage backend support (S3, GCS, Azure - extensible)
 */
export class MimirComponent extends BaseAWSComponent implements MimirComponentOutputs {
    public readonly bucketName?: pulumi.Output<string>;
    public readonly bucketArn?: pulumi.Output<string>;
    public readonly serviceAccountRoleArn?: pulumi.Output<string>;
    public readonly queryEndpoint: pulumi.Output<string>;
    public readonly distributorEndpoint: pulumi.Output<string>;
    public readonly alertmanagerEndpoint?: pulumi.Output<string>;
    public readonly releaseName: pulumi.Output<string>;
    public readonly namespace: pulumi.Output<string>;

    private readonly provider: aws.Provider;
    private readonly k8sProvider: k8s.Provider;
    private bucket?: aws.s3.BucketV2;
    private serviceAccountRole?: aws.iam.Role;
    private helmRelease: k8s.helm.v3.Release;

    constructor(
        name: string,
        args: MimirComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:observability:Mimir", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [
            CommonValidationRules.required("clusterName"),
            CommonValidationRules.required("storage"),
            CommonValidationRules.required("helm")
        ]);

        // Create AWS provider
        this.provider = this.createProvider(args.region);

        // Create Kubernetes provider
        this.k8sProvider = this.createK8sProvider(args);

        // Create storage backend based on type
        switch (args.storage.type) {
            case "s3":
                this.createS3Storage(args);
                break;
            case "gcs":
                throw new Error("GCS storage backend not yet implemented");
            case "azure":
                throw new Error("Azure storage backend not yet implemented");
            default:
                throw new Error(`Unsupported storage type: ${args.storage.type}`);
        }

        // Create IRSA role if OIDC provider is available
        if (args.oidcProviderArn && args.oidcProviderUrl) {
            this.serviceAccountRole = this.createServiceAccountRole(args);
            this.serviceAccountRoleArn = this.serviceAccountRole.arn;
        }

        // Deploy Mimir via Helm
        this.helmRelease = this.deployMimirHelm(args);

        // Set outputs
        this.releaseName = this.helmRelease.name;
        this.namespace = pulumi.output(args.helm.namespace || "mimir");
        this.queryEndpoint = pulumi.interpolate`mimir-query-frontend.${this.namespace}.svc.cluster.local:8080`;
        this.distributorEndpoint = pulumi.interpolate`mimir-distributor.${this.namespace}.svc.cluster.local:8080`;

        if (args.helm.alertmanager?.enabled) {
            this.alertmanagerEndpoint = pulumi.interpolate`mimir-alertmanager.${this.namespace}.svc.cluster.local:8080`;
        }

        // Register outputs
        this.registerOutputs({
            bucketName: this.bucketName,
            bucketArn: this.bucketArn,
            serviceAccountRoleArn: this.serviceAccountRoleArn,
            queryEndpoint: this.queryEndpoint,
            distributorEndpoint: this.distributorEndpoint,
            alertmanagerEndpoint: this.alertmanagerEndpoint,
            releaseName: this.releaseName,
            namespace: this.namespace
        });
    }

    /**
     * Create Kubernetes provider for EKS cluster
     */
    private createK8sProvider(args: MimirComponentArgs): k8s.Provider {
        return createEKSKubernetesProvider(
            `${this.getResourceName()}-k8s-provider`,
            {
                clusterName: args.clusterName,
                clusterEndpoint: args.clusterEndpoint,
                clusterCertificateAuthority: args.clusterCertificateAuthority,
                region: this.region,
                roleArn: args.roleArn
            },
            { parent: this }
        );
    }

    /**
     * Create S3 bucket for Mimir storage
     */
    private createS3Storage(args: MimirComponentArgs): void {
        const s3Config = args.storage.s3;
        if (!s3Config) {
            throw new Error("S3 configuration is required when storage type is 's3'");
        }

        // Generate bucket name if not provided
        const bucketName = s3Config.bucketName || `mimir-${this.region}-${pulumi.getStack()}`;

        // Create S3 bucket
        this.bucket = new aws.s3.BucketV2(
            `${this.getResourceName()}-bucket`,
            {
                bucket: bucketName,
                forceDestroy: s3Config.forceDestroy ?? false,
                tags: this.mergeTags({
                    Purpose: "MimirMetricsStorage",
                    Component: "Mimir"
                })
            },
            { parent: this, provider: this.provider }
        );

        // Enable versioning if requested
        if (s3Config.versioning) {
            new aws.s3.BucketVersioningV2(
                `${this.getResourceName()}-versioning`,
                {
                    bucket: this.bucket.id,
                    versioningConfiguration: {
                        status: "Enabled"
                    }
                },
                { parent: this.bucket, provider: this.provider }
            );
        }

        // Configure server-side encryption
        const encryptionEnabled = s3Config.encryption?.enabled ?? true;
        if (encryptionEnabled) {
            new aws.s3.BucketServerSideEncryptionConfigurationV2(
                `${this.getResourceName()}-encryption`,
                {
                    bucket: this.bucket.id,
                    rules: [{
                        applyServerSideEncryptionByDefault: {
                            sseAlgorithm: s3Config.encryption?.kmsKeyId ? "aws:kms" : "AES256",
                            kmsMasterKeyId: s3Config.encryption?.kmsKeyId
                        },
                        bucketKeyEnabled: true
                    }]
                },
                { parent: this.bucket, provider: this.provider }
            );
        }

        // Configure lifecycle rules if specified
        if (s3Config.lifecycleRules?.enabled) {
            const rules: aws.types.input.s3.BucketLifecycleConfigurationV2Rule[] = [];

            const transitions: aws.types.input.s3.BucketLifecycleConfigurationV2RuleTransition[] = [];

            if (s3Config.lifecycleRules.transitionToIA) {
                transitions.push({
                    days: s3Config.lifecycleRules.transitionToIA,
                    storageClass: "STANDARD_IA"
                });
            }

            if (s3Config.lifecycleRules.transitionToGlacier) {
                transitions.push({
                    days: s3Config.lifecycleRules.transitionToGlacier,
                    storageClass: "GLACIER"
                });
            }

            rules.push({
                id: "mimir-metrics-lifecycle",
                status: "Enabled",
                transitions: transitions.length > 0 ? transitions : undefined,
                expiration: s3Config.lifecycleRules.expiration ? {
                    days: s3Config.lifecycleRules.expiration
                } : undefined
            });

            new aws.s3.BucketLifecycleConfigurationV2(
                `${this.getResourceName()}-lifecycle`,
                {
                    bucket: this.bucket.id,
                    rules: rules
                },
                { parent: this.bucket, provider: this.provider }
            );
        }

        // Block public access
        new aws.s3.BucketPublicAccessBlock(
            `${this.getResourceName()}-public-access-block`,
            {
                bucket: this.bucket.id,
                blockPublicAcls: true,
                blockPublicPolicy: true,
                ignorePublicAcls: true,
                restrictPublicBuckets: true
            },
            { parent: this.bucket, provider: this.provider }
        );

        (this as any).bucketName = this.bucket.bucket;
        (this as any).bucketArn = this.bucket.arn;
    }

    /**
     * Create IAM role for Mimir service account (IRSA)
     */
    private createServiceAccountRole(args: MimirComponentArgs): aws.iam.Role {
        const namespace = args.helm.namespace || "mimir";
        const serviceAccountName = "mimir";

        // Extract OIDC provider from URL
        const oidcProvider = pulumi.output(args.oidcProviderUrl!).apply(url =>
            url.replace("https://", "")
        );

        // Create trust policy for IRSA
        const assumeRolePolicy = pulumi.all([oidcProvider, pulumi.output(args.oidcProviderArn!)]).apply(
            ([provider, arn]) => JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: {
                        Federated: arn
                    },
                    Action: "sts:AssumeRoleWithWebIdentity",
                    Condition: {
                        StringEquals: {
                            [`${provider}:sub`]: `system:serviceaccount:${namespace}:${serviceAccountName}`,
                            [`${provider}:aud`]: "sts.amazonaws.com"
                        }
                    }
                }]
            })
        );

        const role = new aws.iam.Role(
            `${this.getResourceName()}-sa-role`,
            {
                assumeRolePolicy: assumeRolePolicy,
                tags: this.mergeTags({
                    Purpose: "MimirServiceAccount",
                    Namespace: namespace
                })
            },
            { parent: this, provider: this.provider }
        );

        // Create policy for S3 access (if using S3 storage)
        if (args.storage.type === "s3" && this.bucketArn) {
            const s3Policy = pulumi.all([this.bucketArn]).apply(([bucketArn]) => JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Action: [
                        "s3:ListBucket",
                        "s3:GetObject",
                        "s3:PutObject",
                        "s3:DeleteObject",
                        "s3:AbortMultipartUpload",
                        "s3:ListMultipartUploadParts"
                    ],
                    Resource: [
                        bucketArn,
                        `${bucketArn}/*`
                    ]
                }]
            }));

            new aws.iam.RolePolicy(
                `${this.getResourceName()}-s3-policy`,
                {
                    role: role.id,
                    policy: s3Policy
                },
                { parent: role, provider: this.provider }
            );
        }

        return role;
    }

    /**
     * Deploy Mimir using Helm chart
     */
    private deployMimirHelm(args: MimirComponentArgs): k8s.helm.v3.Release {
        const namespace = args.helm.namespace || "mimir";
        const chartVersion = args.helm.chartVersion || "5.6.0";
        const repository = args.helm.repository || "https://grafana.github.io/helm-charts";

        // Build Helm values
        const values = this.buildHelmValues(args);

        // Create namespace
        const ns = new k8s.core.v1.Namespace(
            `${this.getResourceName()}-namespace`,
            {
                metadata: {
                    name: namespace,
                    labels: {
                        name: namespace
                    }
                }
            },
            { parent: this, provider: this.k8sProvider }
        );

        // Deploy Mimir Helm chart
        return new k8s.helm.v3.Release(
            `${this.getResourceName()}-helm`,
            {
                chart: "mimir-distributed",
                version: chartVersion,
                namespace: namespace,
                repositoryOpts: {
                    repo: repository
                },
                values: values,
                skipAwait: false,
                timeout: 900
            },
            {
                parent: this,
                provider: this.k8sProvider,
                dependsOn: [ns]
            }
        );
    }

    /**
     * Build Helm values configuration
     */
    private buildHelmValues(args: MimirComponentArgs): any {
        const baseValues: any = {
            mimir: {
                structuredConfig: {
                    multitenancy_enabled: args.multiTenancy ?? false,
                    limits: {
                        compactor_blocks_retention_period: args.helm.retentionPeriod || "90d"
                    },
                    blocks_storage: {
                        backend: args.storage.type
                    }
                }
            }
        };

        // Configure S3 storage
        if (args.storage.type === "s3" && this.bucketName) {
            baseValues.mimir.structuredConfig.blocks_storage.s3 = pulumi.all([this.bucketName]).apply(([bucket]) => ({
                bucket_name: bucket,
                region: this.region
            }));

            baseValues.mimir.structuredConfig.alertmanager_storage = {
                backend: "s3",
                s3: pulumi.all([this.bucketName]).apply(([bucket]) => ({
                    bucket_name: bucket,
                    region: this.region
                }))
            };

            baseValues.mimir.structuredConfig.ruler_storage = {
                backend: "s3",
                s3: pulumi.all([this.bucketName]).apply(([bucket]) => ({
                    bucket_name: bucket,
                    region: this.region
                }))
            };
        }

        // Configure service account with IRSA
        if (this.serviceAccountRoleArn) {
            baseValues.serviceAccount = {
                create: true,
                name: "mimir",
                annotations: pulumi.all([this.serviceAccountRoleArn]).apply(([roleArn]) => ({
                    "eks.amazonaws.com/role-arn": roleArn
                }))
            };
        }

        // Configure replica counts
        if (args.helm.replicas) {
            baseValues.distributor = { replicas: args.helm.replicas.distributor || 3 };
            baseValues.ingester = { replicas: args.helm.replicas.ingester || 3 };
            baseValues.querier = { replicas: args.helm.replicas.querier || 2 };
            baseValues.query_frontend = { replicas: args.helm.replicas.queryFrontend || 2 };
            baseValues.store_gateway = { replicas: args.helm.replicas.storeGateway || 3 };
            baseValues.compactor = { replicas: args.helm.replicas.compactor || 1 };
        }

        // Configure resources
        if (args.helm.resources) {
            if (args.helm.resources.distributor) {
                baseValues.distributor = { ...baseValues.distributor, resources: args.helm.resources.distributor };
            }
            if (args.helm.resources.ingester) {
                baseValues.ingester = { ...baseValues.ingester, resources: args.helm.resources.ingester };
            }
            if (args.helm.resources.querier) {
                baseValues.querier = { ...baseValues.querier, resources: args.helm.resources.querier };
            }
            if (args.helm.resources.storeGateway) {
                baseValues.store_gateway = { ...baseValues.store_gateway, resources: args.helm.resources.storeGateway };
            }
        }

        // Configure ruler
        if (args.helm.ruler?.enabled) {
            baseValues.ruler = {
                enabled: true,
                replicas: args.helm.ruler.replicas || 2
            };
        }

        // Configure alertmanager
        if (args.helm.alertmanager?.enabled) {
            baseValues.alertmanager = {
                enabled: true,
                replicas: args.helm.alertmanager.replicas || 3
            };
        }

        // Merge with custom values
        if (args.helm.values) {
            return pulumi.all([baseValues, args.helm.values]).apply(([base, custom]) => ({
                ...base,
                ...custom
            }));
        }

        return baseValues;
    }

    /**
     * Get Mimir query endpoint for Grafana datasource
     */
    public getMimirQueryEndpoint(): pulumi.Output<string> {
        return this.queryEndpoint;
    }

    /**
     * Get Mimir distributor endpoint for Prometheus remote write
     */
    public getDistributorEndpoint(): pulumi.Output<string> {
        return this.distributorEndpoint;
    }

    /**
     * Get S3 bucket name (if S3 storage is used)
     */
    public getBucketName(): pulumi.Output<string> | undefined {
        return this.bucketName;
    }
}
