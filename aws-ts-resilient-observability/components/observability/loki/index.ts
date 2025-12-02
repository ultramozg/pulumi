import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, BaseComponentArgs } from "../../shared/base";
import { CommonValidationRules } from "../../shared/base";
import { createEKSKubernetesProvider } from "../../shared/utils/kubernetes-helpers";

/**
 * Storage backend configuration for Loki
 */
export interface LokiStorageConfig {
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
         * Lifecycle rules for log retention
         */
        lifecycleRules?: {
            enabled: boolean;
            transitionToIA?: number; // Days to transition to Infrequent Access
            transitionToGlacier?: number; // Days to transition to Glacier
            expiration?: number; // Days to expire logs
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
 * Loki Helm chart configuration
 */
export interface LokiHelmConfig {
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
     * Replica count
     */
    replicas?: number;

    /**
     * Enable gateway (nginx) for Loki
     */
    gateway?: {
        enabled: boolean;
        replicas?: number;
    };

    /**
     * Service configuration for external access
     */
    service?: {
        type?: "ClusterIP" | "LoadBalancer" | "NodePort";
        annotations?: { [key: string]: string };
        port?: number;
    };
}

/**
 * Arguments for Loki Component
 */
export interface LokiComponentArgs extends BaseComponentArgs {
    /**
     * EKS cluster name where Loki will be deployed
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
    storage: LokiStorageConfig;

    /**
     * Helm configuration
     */
    helm: LokiHelmConfig;

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
 * Outputs from Loki Component
 */
export interface LokiComponentOutputs {
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
     * Loki endpoint (internal cluster DNS)
     */
    endpoint: pulumi.Output<string>;

    /**
     * External endpoint (if LoadBalancer service is enabled)
     */
    externalEndpoint?: pulumi.Output<string>;

    /**
     * Helm release name
     */
    releaseName: pulumi.Output<string>;

    /**
     * Namespace where Loki is deployed
     */
    namespace: pulumi.Output<string>;
}

/**
 * Grafana Loki Component with S3 backend storage
 *
 * This component deploys Grafana Loki for centralized log aggregation
 * with automatic S3 bucket provisioning and IRSA configuration.
 *
 * Features:
 * - Automatic S3 bucket creation with encryption and lifecycle policies
 * - IRSA (IAM Roles for Service Accounts) integration
 * - Distributed or monolithic deployment modes
 * - Customizable Helm configuration
 * - Multi-cloud storage backend support (S3, GCS, Azure - extensible)
 */
export class LokiComponent extends BaseAWSComponent implements LokiComponentOutputs {
    public readonly bucketName?: pulumi.Output<string>;
    public readonly bucketArn?: pulumi.Output<string>;
    public readonly serviceAccountRoleArn?: pulumi.Output<string>;
    public readonly endpoint: pulumi.Output<string>;
    public readonly externalEndpoint?: pulumi.Output<string>;
    public readonly releaseName: pulumi.Output<string>;
    public readonly namespace: pulumi.Output<string>;

    private readonly provider: aws.Provider;
    private readonly k8sProvider: k8s.Provider;
    private bucket?: aws.s3.BucketV2;
    private serviceAccountRole?: aws.iam.Role;
    private helmRelease: k8s.helm.v3.Release;

    constructor(
        name: string,
        args: LokiComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:observability:Loki", name, args, opts);

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

        // Deploy Loki via Helm
        this.helmRelease = this.deployLokiHelm(args);

        // Set outputs
        this.releaseName = this.helmRelease.name;
        this.namespace = pulumi.output(args.helm.namespace || "loki");
        this.endpoint = pulumi.interpolate`loki-gateway.${this.namespace}.svc.cluster.local`;

        // Get external endpoint if LoadBalancer service is configured
        if (args.helm.service?.type === "LoadBalancer") {
            this.externalEndpoint = this.getLoadBalancerEndpoint(args);
        }

        // Register outputs
        this.registerOutputs({
            bucketName: this.bucketName,
            bucketArn: this.bucketArn,
            serviceAccountRoleArn: this.serviceAccountRoleArn,
            endpoint: this.endpoint,
            externalEndpoint: this.externalEndpoint,
            releaseName: this.releaseName,
            namespace: this.namespace
        });
    }

    /**
     * Create Kubernetes provider for EKS cluster
     */
    private createK8sProvider(args: LokiComponentArgs): k8s.Provider {
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
     * Create S3 bucket for Loki storage
     */
    private createS3Storage(args: LokiComponentArgs): void {
        const s3Config = args.storage.s3;
        if (!s3Config) {
            throw new Error("S3 configuration is required when storage type is 's3'");
        }

        // Generate bucket name if not provided
        const bucketName = s3Config.bucketName || `loki-${this.region}-${pulumi.getStack()}`;

        // Create S3 bucket
        this.bucket = new aws.s3.BucketV2(
            `${this.getResourceName()}-bucket`,
            {
                bucket: bucketName,
                forceDestroy: s3Config.forceDestroy ?? false,
                tags: this.mergeTags({
                    Purpose: "LokiLogStorage",
                    Component: "Loki"
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
                id: "loki-log-lifecycle",
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
     * Create IAM role for Loki service account (IRSA)
     */
    private createServiceAccountRole(args: LokiComponentArgs): aws.iam.Role {
        const namespace = args.helm.namespace || "loki";
        const serviceAccountName = "loki";

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
                    Purpose: "LokiServiceAccount",
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
     * Deploy Loki using Helm chart
     */
    private deployLokiHelm(args: LokiComponentArgs): k8s.helm.v3.Release {
        const namespace = args.helm.namespace || "loki";
        const chartVersion = args.helm.chartVersion || "6.22.0";
        const repository = args.helm.repository || "https://grafana.github.io/helm-charts";

        // Build Helm values
        const values = this.buildHelmValues(args);

        // Deploy Loki Helm chart
        // Let Helm create the namespace automatically
        return new k8s.helm.v3.Release(
            `${this.getResourceName()}-helm`,
            {
                chart: args.distributed ? "loki-distributed" : "loki",
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
    private buildHelmValues(args: LokiComponentArgs): any {
        const baseValues: any = {
            loki: {
                auth_enabled: false,
                commonConfig: {
                    replication_factor: args.helm.replicas || 3
                },
                storage: {
                    type: args.storage.type
                },
                schemaConfig: {
                    configs: [
                        {
                            from: "2024-04-01",
                            store: "tsdb",
                            object_store: "s3",
                            schema: "v13",
                            index: {
                                prefix: "loki_index_",
                                period: "24h"
                            }
                        }
                    ]
                }
            },
            // Configure persistence with explicit storage class for EKS Auto Mode
            // EKS Auto Mode provides 'gp2' storage class via aws-ebs-csi-driver
            write: {
                persistence: {
                    enabled: true,
                    storageClassName: "gp2",
                    size: "10Gi"
                }
            },
            read: {
                persistence: {
                    enabled: true,
                    storageClassName: "gp2",
                    size: "10Gi"
                }
            },
            backend: {
                persistence: {
                    enabled: true,
                    storageClassName: "gp2",
                    size: "10Gi"
                }
            },
            // For single binary mode (non-distributed)
            singleBinary: {
                persistence: {
                    enabled: true,
                    storageClassName: "gp2",
                    size: "10Gi"
                }
            }
        };

        // Configure S3 storage
        if (args.storage.type === "s3" && this.bucketName) {
            baseValues.loki.storage.bucketNames = pulumi.all([this.bucketName]).apply(([bucket]) => ({
                chunks: bucket,
                ruler: bucket,
                admin: bucket
            }));

            baseValues.loki.storage.s3 = pulumi.all([this.bucketName]).apply(([bucket]) => ({
                s3: `s3://${this.region}/${bucket}`,
                region: this.region,
                s3ForcePathStyle: false
            }));
        }

        // Configure service account with IRSA
        if (this.serviceAccountRoleArn) {
            baseValues.serviceAccount = {
                create: true,
                name: "loki",
                annotations: pulumi.all([this.serviceAccountRoleArn]).apply(([roleArn]) => ({
                    "eks.amazonaws.com/role-arn": roleArn
                }))
            };
        }

        // Configure gateway
        if (args.helm.gateway?.enabled) {
            const serviceConfig: any = args.helm.service ? {
                type: args.helm.service.type || "ClusterIP",
                port: args.helm.service.port || 80,
                annotations: args.helm.service.annotations || {}
            } : undefined;

            // If LoadBalancer type, ensure it's internal by default with proper annotations
            if (serviceConfig && serviceConfig.type === "LoadBalancer") {
                serviceConfig.annotations = {
                    "service.beta.kubernetes.io/aws-load-balancer-type": "nlb",
                    "service.beta.kubernetes.io/aws-load-balancer-internal": "true",
                    "service.beta.kubernetes.io/aws-load-balancer-scheme": "internal",
                    "service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled": "true",
                    ...serviceConfig.annotations  // Allow user overrides
                };
            }

            baseValues.gateway = {
                enabled: true,
                replicas: args.helm.gateway.replicas || 2,
                service: serviceConfig
            };
        }

        // Configure resources
        if (args.helm.resources) {
            baseValues.loki.resources = args.helm.resources;
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
     * Get LoadBalancer endpoint
     */
    private getLoadBalancerEndpoint(args: LokiComponentArgs): pulumi.Output<string> {
        const namespace = args.helm.namespace || "loki";
        const serviceName = "loki-gateway";

        // Get the service and extract the LoadBalancer hostname
        const service = k8s.core.v1.Service.get(
            `loki-gateway-lb-service`,
            pulumi.interpolate`${namespace}/${serviceName}`,
            { provider: this.k8sProvider, parent: this }
        );

        return service.status.apply((status: any): string => {
            if (status?.loadBalancer?.ingress && status.loadBalancer.ingress.length > 0) {
                const ingress = status.loadBalancer.ingress[0];
                return ingress.hostname || ingress.ip || "";
            }
            return "";
        });
    }

    /**
     * Get Loki query endpoint
     */
    public getQueryEndpoint(): pulumi.Output<string> {
        return this.endpoint;
    }

    /**
     * Get S3 bucket name (if S3 storage is used)
     */
    public getBucketName(): pulumi.Output<string> | undefined {
        return this.bucketName;
    }
}
