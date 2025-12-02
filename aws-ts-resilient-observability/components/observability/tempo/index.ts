import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, BaseComponentArgs } from "../../shared/base";
import { CommonValidationRules } from "../../shared/base";
import { createEKSKubernetesProvider } from "../../shared/utils/kubernetes-helpers";

/**
 * Storage backend configuration for Tempo
 */
export interface TempoStorageConfig {
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
         * Lifecycle rules for trace retention
         */
        lifecycleRules?: {
            enabled: boolean;
            transitionToIA?: number; // Days to transition to Infrequent Access
            transitionToGlacier?: number; // Days to transition to Glacier
            expiration?: number; // Days to expire traces
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
 * Tempo Helm chart configuration
 */
export interface TempoHelmConfig {
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
     * Resource requests and limits
     */
    resources?: {
        requests?: {
            cpu?: string;
            memory?: string;
        };
        limits?: {
            cpu?: string;
            memory?: string;
        };
    };

    /**
     * Retention period for traces (in hours)
     */
    retentionPeriod?: string;

    /**
     * Enable trace search
     */
    search?: {
        enabled: boolean;
    };

    /**
     * Enable metrics generator for span metrics
     */
    metricsGenerator?: {
        enabled: boolean;
        remoteWriteUrl?: string;
    };

    /**
     * Service configuration for external access
     */
    service?: {
        type?: "ClusterIP" | "LoadBalancer" | "NodePort";
        annotations?: { [key: string]: string };
        queryPort?: number;
        distributorPort?: number;
    };
}

/**
 * Arguments for Tempo Component
 */
export interface TempoComponentArgs extends BaseComponentArgs {
    /**
     * EKS cluster name where Tempo will be deployed
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
    storage: TempoStorageConfig;

    /**
     * Helm configuration
     */
    helm: TempoHelmConfig;

    /**
     * Enable distributed mode (microservices)
     */
    distributed?: boolean;

    /**
     * Optional IAM role ARN to assume when authenticating to EKS
     */
    roleArn?: pulumi.Input<string>;
}

/**
 * Outputs from Tempo Component
 */
export interface TempoComponentOutputs {
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
     * Tempo query endpoint (internal cluster DNS)
     */
    queryEndpoint: pulumi.Output<string>;

    /**
     * Tempo distributor endpoint for trace ingestion
     */
    distributorEndpoint: pulumi.Output<string>;

    /**
     * External query endpoint (if LoadBalancer service is enabled)
     */
    externalQueryEndpoint?: pulumi.Output<string>;

    /**
     * External distributor endpoint (if LoadBalancer service is enabled)
     */
    externalDistributorEndpoint?: pulumi.Output<string>;

    /**
     * Helm release name
     */
    releaseName: pulumi.Output<string>;

    /**
     * Namespace where Tempo is deployed
     */
    namespace: pulumi.Output<string>;
}

/**
 * Grafana Tempo Component with S3 backend storage
 *
 * This component deploys Grafana Tempo for distributed tracing
 * with automatic S3 bucket provisioning and IRSA configuration.
 *
 * Features:
 * - Automatic S3 bucket creation with encryption and lifecycle policies
 * - IRSA (IAM Roles for Service Accounts) integration
 * - Distributed or monolithic deployment modes
 * - OpenTelemetry-native trace ingestion
 * - TraceQL search capabilities
 * - Metrics generator for span metrics (RED metrics from traces)
 * - Multi-cloud storage backend support (S3, GCS, Azure - extensible)
 */
export class TempoComponent extends BaseAWSComponent implements TempoComponentOutputs {
    public readonly bucketName?: pulumi.Output<string>;
    public readonly bucketArn?: pulumi.Output<string>;
    public readonly serviceAccountRoleArn?: pulumi.Output<string>;
    public readonly queryEndpoint: pulumi.Output<string>;
    public readonly distributorEndpoint: pulumi.Output<string>;
    public readonly externalQueryEndpoint?: pulumi.Output<string>;
    public readonly externalDistributorEndpoint?: pulumi.Output<string>;
    public readonly releaseName: pulumi.Output<string>;
    public readonly namespace: pulumi.Output<string>;

    private readonly provider: aws.Provider;
    private readonly k8sProvider: k8s.Provider;
    private bucket?: aws.s3.BucketV2;
    private serviceAccountRole?: aws.iam.Role;
    private helmRelease: k8s.helm.v3.Release;

    constructor(
        name: string,
        args: TempoComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:observability:Tempo", name, args, opts);

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

        // Deploy Tempo via Helm
        this.helmRelease = this.deployTempoHelm(args);

        // Set outputs
        this.releaseName = this.helmRelease.name;
        this.namespace = pulumi.output(args.helm.namespace || "tempo");

        // Tempo endpoints depend on deployment mode
        if (args.distributed) {
            this.queryEndpoint = pulumi.interpolate`tempo-query-frontend.${this.namespace}.svc.cluster.local:3100`;
            this.distributorEndpoint = pulumi.interpolate`tempo-distributor.${this.namespace}.svc.cluster.local:4317`;
        } else {
            this.queryEndpoint = pulumi.interpolate`tempo.${this.namespace}.svc.cluster.local:3100`;
            this.distributorEndpoint = pulumi.interpolate`tempo.${this.namespace}.svc.cluster.local:4317`;
        }

        // Register outputs
        this.registerOutputs({
            bucketName: this.bucketName,
            bucketArn: this.bucketArn,
            serviceAccountRoleArn: this.serviceAccountRoleArn,
            queryEndpoint: this.queryEndpoint,
            distributorEndpoint: this.distributorEndpoint,
            releaseName: this.releaseName,
            namespace: this.namespace
        });
    }

    /**
     * Create Kubernetes provider for EKS cluster
     */
    private createK8sProvider(args: TempoComponentArgs): k8s.Provider {
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
     * Create S3 bucket for Tempo storage
     */
    private createS3Storage(args: TempoComponentArgs): void {
        const s3Config = args.storage.s3;
        if (!s3Config) {
            throw new Error("S3 configuration is required when storage type is 's3'");
        }

        // Generate bucket name if not provided
        const bucketName = s3Config.bucketName || `tempo-${this.region}-${pulumi.getStack()}`;

        // Create S3 bucket
        this.bucket = new aws.s3.BucketV2(
            `${this.getResourceName()}-bucket`,
            {
                bucket: bucketName,
                forceDestroy: s3Config.forceDestroy ?? false,
                tags: this.mergeTags({
                    Purpose: "TempoTraceStorage",
                    Component: "Tempo"
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
                id: "tempo-trace-lifecycle",
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
     * Create IAM role for Tempo service account (IRSA)
     */
    private createServiceAccountRole(args: TempoComponentArgs): aws.iam.Role {
        const namespace = args.helm.namespace || "tempo";
        const serviceAccountName = "tempo";

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
                    Purpose: "TempoServiceAccount",
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
                        "s3:DeleteObject"
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
     * Deploy Tempo using Helm chart
     */
    private deployTempoHelm(args: TempoComponentArgs): k8s.helm.v3.Release {
        const namespace = args.helm.namespace || "tempo";
        const chartVersion = args.helm.chartVersion || "1.17.0";
        const repository = args.helm.repository || "https://grafana.github.io/helm-charts";

        // Build Helm values
        const values = this.buildHelmValues(args);

        // Deploy Tempo Helm chart
        // Let Helm create the namespace automatically
        return new k8s.helm.v3.Release(
            `${this.getResourceName()}-helm`,
            {
                chart: args.distributed ? "tempo-distributed" : "tempo",
                version: chartVersion,
                namespace: namespace,
                createNamespace: true,
                repositoryOpts: {
                    repo: repository
                },
                values: values,
                skipAwait: false,
                timeout: 600
            },
            {
                parent: this,
                provider: this.k8sProvider
            }
        );
    }

    /**
     * Build Helm values configuration
     */
    private buildHelmValues(args: TempoComponentArgs): any {
        const baseValues: any = {
            tempo: {
                storage: {
                    trace: {
                        backend: args.storage.type
                    }
                },
                retention: args.helm.retentionPeriod || "720h", // 30 days default
                searchEnabled: args.helm.search?.enabled ?? true,
                metricsGenerator: {
                    enabled: args.helm.metricsGenerator?.enabled ?? false,
                    remoteWriteUrl: args.helm.metricsGenerator?.remoteWriteUrl
                }
            }
        };

        // Configure S3 storage
        if (args.storage.type === "s3" && this.bucketName) {
            baseValues.tempo.storage.trace.s3 = pulumi.all([this.bucketName]).apply(([bucket]) => ({
                bucket: bucket,
                region: this.region,
                forcepathstyle: false
            }));
        }

        // Configure service account with IRSA
        if (this.serviceAccountRoleArn) {
            baseValues.serviceAccount = {
                create: true,
                name: "tempo",
                annotations: pulumi.all([this.serviceAccountRoleArn]).apply(([roleArn]) => ({
                    "eks.amazonaws.com/role-arn": roleArn
                }))
            };
        }

        // Configure resources
        if (args.helm.resources) {
            baseValues.tempo.resources = args.helm.resources;
        }

        // Configure service for external access
        if (args.helm.service) {
            // Prepare internal NLB annotations for LoadBalancer type
            const getServiceAnnotations = (baseAnnotations: { [key: string]: string } = {}) => {
                if (args.helm.service!.type === "LoadBalancer") {
                    return {
                        "service.beta.kubernetes.io/aws-load-balancer-type": "nlb",
                        "service.beta.kubernetes.io/aws-load-balancer-internal": "true",
                        "service.beta.kubernetes.io/aws-load-balancer-scheme": "internal",
                        "service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled": "true",
                        ...baseAnnotations  // Allow user overrides
                    };
                }
                return baseAnnotations;
            };

            if (args.distributed) {
                // For distributed mode, configure separate services
                baseValues.queryFrontend = baseValues.queryFrontend || {};
                baseValues.queryFrontend.service = {
                    type: args.helm.service.type || "ClusterIP",
                    annotations: getServiceAnnotations(args.helm.service.annotations),
                    port: args.helm.service.queryPort || 3100
                };

                baseValues.distributor = baseValues.distributor || {};
                baseValues.distributor.service = {
                    type: args.helm.service.type || "ClusterIP",
                    annotations: getServiceAnnotations(args.helm.service.annotations),
                    port: args.helm.service.distributorPort || 4317
                };
            } else {
                // For monolithic mode, single service
                baseValues.service = {
                    type: args.helm.service.type || "ClusterIP",
                    annotations: getServiceAnnotations(args.helm.service.annotations)
                };
            }
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
     * Get Tempo query endpoint for Grafana datasource
     */
    public getTempoQueryEndpoint(): pulumi.Output<string> {
        return this.queryEndpoint;
    }

    /**
     * Get Tempo distributor endpoint for OTLP ingestion
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
