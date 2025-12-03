import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, BaseComponentArgs } from "../shared/base";
import { CommonValidationRules } from "../shared/base";
import { LokiComponent, LokiComponentArgs } from "./loki";
import { TempoComponent, TempoComponentArgs } from "./tempo";
import { MimirComponent, MimirComponentArgs } from "./mimir";
import { GrafanaComponent, GrafanaComponentArgs, GrafanaDatasource } from "./grafana";
import { OTelCollectorComponent, OTelCollectorComponentArgs } from "./opentelemetry-collector";
import { createEKSKubernetesProvider } from "../shared/utils/kubernetes-helpers";

/**
 * Observability stack configuration
 */
export interface ObservabilityStackConfig {
    /**
     * Enable Loki for logs
     */
    loki?: {
        enabled: boolean;
        config?: Partial<LokiComponentArgs>;
    };

    /**
     * Enable Tempo for traces
     */
    tempo?: {
        enabled: boolean;
        config?: Partial<TempoComponentArgs>;
    };

    /**
     * Enable Mimir for metrics
     */
    mimir?: {
        enabled: boolean;
        config?: Partial<MimirComponentArgs>;
    };

    /**
     * Enable Grafana for visualization
     */
    grafana?: {
        enabled: boolean;
        config?: Partial<GrafanaComponentArgs>;
    };

    /**
     * Enable OpenTelemetry Collector
     */
    otelCollector?: {
        enabled: boolean;
        config?: Partial<OTelCollectorComponentArgs>;
    };
}

/**
 * Arguments for Observability Stack Component
 */
export interface ObservabilityStackArgs extends BaseComponentArgs {
    /**
     * EKS cluster name where observability stack will be deployed
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
     * Observability stack configuration
     */
    stack: ObservabilityStackConfig;

    /**
     * Common S3 lifecycle rules for all components
     */
    commonS3LifecycleRules?: {
        enabled: boolean;
        transitionToIA?: number;
        transitionToGlacier?: number;
        expiration?: number;
    };

    /**
     * Optional IAM role ARN to assume when authenticating to EKS
     */
    roleArn?: pulumi.Input<string>;
}

/**
 * Outputs from Observability Stack Component
 */
export interface ObservabilityStackOutputs {
    /**
     * Loki outputs (if enabled)
     */
    loki?: {
        endpoint: pulumi.Output<string>;
        bucketName?: pulumi.Output<string>;
    };

    /**
     * Tempo outputs (if enabled)
     */
    tempo?: {
        queryEndpoint: pulumi.Output<string>;
        distributorEndpoint: pulumi.Output<string>;
        bucketName?: pulumi.Output<string>;
    };

    /**
     * Mimir outputs (if enabled)
     */
    mimir?: {
        queryEndpoint: pulumi.Output<string>;
        distributorEndpoint: pulumi.Output<string>;
        bucketName?: pulumi.Output<string>;
    };

    /**
     * Grafana outputs (if enabled)
     */
    grafana?: {
        endpoint: pulumi.Output<string>;
        adminPassword: pulumi.Output<string>;
        externalUrl?: pulumi.Output<string>;
    };

    /**
     * OpenTelemetry Collector outputs (if enabled)
     */
    otelCollector?: {
        otlpGrpcEndpoint: pulumi.Output<string>;
        otlpHttpEndpoint: pulumi.Output<string>;
    };
}

/**
 * Observability Stack Component
 *
 * This is the main component that deploys a complete observability stack
 * consisting of Loki, Tempo, Mimir, Grafana, and OpenTelemetry Collector.
 *
 * This component orchestrates the deployment of all observability components
 * and automatically configures them to work together:
 * - Loki for log aggregation
 * - Tempo for distributed tracing
 * - Mimir for metrics storage (Prometheus-compatible)
 * - Grafana for unified visualization with all datasources configured
 * - OpenTelemetry Collector for telemetry collection
 *
 * Features:
 * - Automatic service discovery and endpoint configuration
 * - IRSA integration for all components
 * - S3 backend storage with common lifecycle policies
 * - Automatic Grafana datasource configuration
 * - Trace-to-log and trace-to-metrics correlation
 * - Modular design - enable only what you need
 */
export class ObservabilityStackComponent extends BaseAWSComponent implements ObservabilityStackOutputs {
    public readonly loki?: {
        endpoint: pulumi.Output<string>;
        bucketName?: pulumi.Output<string>;
    };

    public readonly tempo?: {
        queryEndpoint: pulumi.Output<string>;
        distributorEndpoint: pulumi.Output<string>;
        bucketName?: pulumi.Output<string>;
    };

    public readonly mimir?: {
        queryEndpoint: pulumi.Output<string>;
        distributorEndpoint: pulumi.Output<string>;
        bucketName?: pulumi.Output<string>;
    };

    public readonly grafana?: {
        endpoint: pulumi.Output<string>;
        adminPassword: pulumi.Output<string>;
        externalUrl?: pulumi.Output<string>;
    };

    public readonly otelCollector?: {
        otlpGrpcEndpoint: pulumi.Output<string>;
        otlpHttpEndpoint: pulumi.Output<string>;
    };

    private readonly provider: aws.Provider;
    private lokiComponent?: LokiComponent;
    private tempoComponent?: TempoComponent;
    private mimirComponent?: MimirComponent;
    private grafanaComponent?: GrafanaComponent;
    private otelCollectorComponent?: OTelCollectorComponent;

    constructor(
        name: string,
        args: ObservabilityStackArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:observability:ObservabilityStack", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [
            CommonValidationRules.required("clusterName"),
            CommonValidationRules.required("stack")
        ]);

        // Create AWS provider
        this.provider = this.createProvider(args.region);

        // Create Kubernetes provider for managing storage classes
        const k8sProvider = createEKSKubernetesProvider(
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

        // Create EBS StorageClass for EKS Auto Mode
        // Note: EKS Auto Mode requires the CSI driver (ebs.csi.eks.amazonaws.com)
        // If an old gp2 storage class exists with the in-tree driver (kubernetes.io/aws-ebs),
        // we create a new one with a different name to avoid conflicts
        new k8s.storage.v1.StorageClass(
            `${this.getResourceName()}-ebs-sc`,
            {
                metadata: {
                    name: "gp3-encrypted",
                    annotations: {
                        "storageclass.kubernetes.io/is-default-class": "true"
                    }
                },
                provisioner: "ebs.csi.eks.amazonaws.com",
                parameters: {
                    type: "gp3",
                    encrypted: "true",
                    fsType: "ext4"
                },
                volumeBindingMode: "WaitForFirstConsumer",
                allowVolumeExpansion: true
            },
            {
                parent: this,
                provider: k8sProvider
            }
        );

        // Deploy Loki if enabled
        if (args.stack.loki?.enabled) {
            this.lokiComponent = this.deployLoki(args);
            this.loki = {
                endpoint: this.lokiComponent.endpoint,
                bucketName: this.lokiComponent.bucketName
            };
        }

        // Deploy Tempo if enabled
        if (args.stack.tempo?.enabled) {
            this.tempoComponent = this.deployTempo(args);
            this.tempo = {
                queryEndpoint: this.tempoComponent.queryEndpoint,
                distributorEndpoint: this.tempoComponent.distributorEndpoint,
                bucketName: this.tempoComponent.bucketName
            };
        }

        // Deploy Mimir if enabled
        if (args.stack.mimir?.enabled) {
            this.mimirComponent = this.deployMimir(args);
            this.mimir = {
                queryEndpoint: this.mimirComponent.queryEndpoint,
                distributorEndpoint: this.mimirComponent.distributorEndpoint,
                bucketName: this.mimirComponent.bucketName
            };
        }

        // Deploy OpenTelemetry Collector if enabled (before Grafana, so it can send metrics)
        if (args.stack.otelCollector?.enabled) {
            this.otelCollectorComponent = this.deployOTelCollector(args);
            this.otelCollector = {
                otlpGrpcEndpoint: this.otelCollectorComponent.otlpGrpcEndpoint,
                otlpHttpEndpoint: this.otelCollectorComponent.otlpHttpEndpoint
            };
        }

        // Deploy Grafana if enabled (last, so all datasources are available)
        if (args.stack.grafana?.enabled) {
            this.grafanaComponent = this.deployGrafana(args);
            this.grafana = {
                endpoint: this.grafanaComponent.endpoint,
                adminPassword: this.grafanaComponent.adminPassword,
                externalUrl: this.grafanaComponent.externalUrl
            };
        }

        // Register outputs
        this.registerOutputs({
            loki: this.loki,
            tempo: this.tempo,
            mimir: this.mimir,
            grafana: this.grafana,
            otelCollector: this.otelCollector
        });
    }

    /**
     * Deploy Loki component
     */
    private deployLoki(args: ObservabilityStackArgs): LokiComponent {
        const lokiArgs = {
            ...args.stack.loki?.config,
            region: args.region,
            clusterName: args.clusterName,
            clusterEndpoint: args.clusterEndpoint,
            clusterCertificateAuthority: args.clusterCertificateAuthority,
            oidcProviderArn: args.oidcProviderArn,
            oidcProviderUrl: args.oidcProviderUrl,
            roleArn: args.roleArn,
            storage: {
                type: "s3" as const,
                s3: {
                    versioning: true,
                    encryption: {
                        enabled: true
                    },
                    lifecycleRules: args.commonS3LifecycleRules || {
                        enabled: true,
                        transitionToIA: 30,
                        transitionToGlacier: 90,
                        expiration: 365
                    }
                }
            },
            helm: {
                namespace: "loki",
                replicas: 3,
                gateway: {
                    enabled: true,
                    replicas: 2
                }
            },
            tags: args.tags
        } as LokiComponentArgs;

        return new LokiComponent(
            `${this.getResourceName()}-loki`,
            lokiArgs,
            { parent: this }
        );
    }

    /**
     * Deploy Tempo component
     */
    private deployTempo(args: ObservabilityStackArgs): TempoComponent {
        const tempoArgs = {
            ...args.stack.tempo?.config,
            region: args.region,
            clusterName: args.clusterName,
            clusterEndpoint: args.clusterEndpoint,
            clusterCertificateAuthority: args.clusterCertificateAuthority,
            oidcProviderArn: args.oidcProviderArn,
            oidcProviderUrl: args.oidcProviderUrl,
            roleArn: args.roleArn,
            storage: {
                type: "s3" as const,
                s3: {
                    versioning: false,
                    encryption: {
                        enabled: true
                    },
                    lifecycleRules: args.commonS3LifecycleRules || {
                        enabled: true,
                        transitionToIA: 7,
                        transitionToGlacier: 30,
                        expiration: 90
                    }
                }
            },
            helm: {
                namespace: "tempo",
                retentionPeriod: "720h",
                search: {
                    enabled: true
                },
                metricsGenerator: {
                    enabled: args.stack.mimir?.enabled ?? false,
                    remoteWriteUrl: args.stack.mimir?.enabled
                        ? "http://mimir-distributor.mimir.svc.cluster.local:8080/api/v1/push"
                        : undefined
                }
            },
            distributed: true,
            tags: args.tags
        } as TempoComponentArgs;

        return new TempoComponent(
            `${this.getResourceName()}-tempo`,
            tempoArgs,
            { parent: this }
        );
    }

    /**
     * Deploy Mimir component
     */
    private deployMimir(args: ObservabilityStackArgs): MimirComponent {
        const mimirArgs = {
            ...args.stack.mimir?.config,
            region: args.region,
            clusterName: args.clusterName,
            clusterEndpoint: args.clusterEndpoint,
            clusterCertificateAuthority: args.clusterCertificateAuthority,
            oidcProviderArn: args.oidcProviderArn,
            oidcProviderUrl: args.oidcProviderUrl,
            roleArn: args.roleArn,
            storage: {
                type: "s3" as const,
                s3: {
                    versioning: false,
                    encryption: {
                        enabled: true
                    },
                    lifecycleRules: args.commonS3LifecycleRules || {
                        enabled: true,
                        transitionToIA: 30,
                        transitionToGlacier: 90,
                        expiration: 365
                    }
                }
            },
            helm: {
                namespace: "mimir",
                retentionPeriod: "90d",
                replicas: {
                    distributor: 3,
                    ingester: 3,
                    querier: 2,
                    queryFrontend: 2,
                    storeGateway: 3,
                    compactor: 1
                },
                ruler: {
                    enabled: true,
                    replicas: 2
                },
                alertmanager: {
                    enabled: true,
                    replicas: 3
                }
            },
            multiTenancy: false,
            tags: args.tags
        } as MimirComponentArgs;

        return new MimirComponent(
            `${this.getResourceName()}-mimir`,
            mimirArgs,
            { parent: this }
        );
    }

    /**
     * Deploy Grafana component with auto-configured datasources
     */
    private deployGrafana(args: ObservabilityStackArgs): GrafanaComponent {
        const datasources: GrafanaDatasource[] = [];

        // Add Mimir/Prometheus datasource if enabled
        if (this.mimirComponent) {
            datasources.push({
                name: "Prometheus",
                type: "prometheus",
                url: this.mimirComponent.getMimirQueryEndpoint(),
                isDefault: true
            });
        }

        // Add Loki datasource if enabled
        if (this.lokiComponent) {
            datasources.push({
                name: "Loki",
                type: "loki",
                url: this.lokiComponent.getQueryEndpoint()
            });
        }

        // Add Tempo datasource if enabled
        if (this.tempoComponent) {
            datasources.push({
                name: "Tempo",
                type: "tempo",
                url: this.tempoComponent.getTempoQueryEndpoint()
            });
        }

        const grafanaArgs = {
            ...args.stack.grafana?.config,
            region: args.region,
            clusterName: args.clusterName,
            clusterEndpoint: args.clusterEndpoint,
            clusterCertificateAuthority: args.clusterCertificateAuthority,
            roleArn: args.roleArn,
            datasources: datasources,
            helm: {
                namespace: "grafana",
                replicas: 2,
                persistence: {
                    enabled: true,
                    size: "10Gi"
                },
                plugins: [
                    "grafana-clock-panel",
                    "grafana-piechart-panel"
                ]
            },
            anonymousAuth: false,
            tags: args.tags
        } as GrafanaComponentArgs;

        const grafanaDependencies: any[] = [];
        if (this.lokiComponent) grafanaDependencies.push(this.lokiComponent);
        if (this.tempoComponent) grafanaDependencies.push(this.tempoComponent);
        if (this.mimirComponent) grafanaDependencies.push(this.mimirComponent);

        return new GrafanaComponent(
            `${this.getResourceName()}-grafana`,
            grafanaArgs,
            {
                parent: this,
                dependsOn: grafanaDependencies.length > 0 ? grafanaDependencies : undefined
            }
        );
    }

    /**
     * Deploy OpenTelemetry Collector component
     */
    private deployOTelCollector(args: ObservabilityStackArgs): OTelCollectorComponent {
        const otelArgs = {
            ...args.stack.otelCollector?.config,
            region: args.region,
            clusterName: args.clusterName,
            clusterEndpoint: args.clusterEndpoint,
            clusterCertificateAuthority: args.clusterCertificateAuthority,
            roleArn: args.roleArn,
            mode: "daemonset" as const,
            tempoEndpoint: this.tempoComponent?.getDistributorEndpoint(),
            mimirEndpoint: this.mimirComponent?.getDistributorEndpoint(),
            lokiEndpoint: this.lokiComponent?.getQueryEndpoint(),
            helm: {
                namespace: "opentelemetry",
                resources: {
                    requests: {
                        cpu: "200m",
                        memory: "256Mi"
                    },
                    limits: {
                        cpu: "1",
                        memory: "2Gi"
                    }
                }
            },
            tags: args.tags
        } as OTelCollectorComponentArgs;

        const otelDependencies: any[] = [];
        if (this.lokiComponent) otelDependencies.push(this.lokiComponent);
        if (this.tempoComponent) otelDependencies.push(this.tempoComponent);
        if (this.mimirComponent) otelDependencies.push(this.mimirComponent);

        return new OTelCollectorComponent(
            `${this.getResourceName()}-otel-collector`,
            otelArgs,
            {
                parent: this,
                dependsOn: otelDependencies.length > 0 ? otelDependencies : undefined
            }
        );
    }

    /**
     * Get Grafana endpoint
     */
    public getGrafanaEndpoint(): pulumi.Output<string> | undefined {
        return this.grafanaComponent?.getGrafanaEndpoint();
    }

    /**
     * Get Grafana admin password
     */
    public getGrafanaAdminPassword(): pulumi.Output<string> | undefined {
        return this.grafanaComponent?.getAdminPassword();
    }

    /**
     * Get OpenTelemetry Collector OTLP endpoint
     */
    public getOTelCollectorEndpoint(): pulumi.Output<string> | undefined {
        return this.otelCollectorComponent?.getOtlpGrpcEndpoint();
    }
}

// Re-export all components for convenience
export { LokiComponent, LokiComponentArgs } from "./loki";
export { TempoComponent, TempoComponentArgs } from "./tempo";
export { MimirComponent, MimirComponentArgs } from "./mimir";
export { GrafanaComponent, GrafanaComponentArgs, GrafanaDatasource } from "./grafana";
export { OTelCollectorComponent, OTelCollectorComponentArgs } from "./opentelemetry-collector";
