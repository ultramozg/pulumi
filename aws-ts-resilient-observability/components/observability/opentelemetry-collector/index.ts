import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, BaseComponentArgs } from "../shared/base";
import { CommonValidationRules } from "../shared/base";

/**
 * OpenTelemetry receiver configuration
 */
export interface OTelReceiver {
    /**
     * Receiver name (otlp, jaeger, zipkin, prometheus, etc.)
     */
    name: string;

    /**
     * Receiver configuration
     */
    config: any;
}

/**
 * OpenTelemetry processor configuration
 */
export interface OTelProcessor {
    /**
     * Processor name (batch, memory_limiter, resource, attributes, etc.)
     */
    name: string;

    /**
     * Processor configuration
     */
    config: any;
}

/**
 * OpenTelemetry exporter configuration
 */
export interface OTelExporter {
    /**
     * Exporter name (otlp, prometheus, loki, logging, etc.)
     */
    name: string;

    /**
     * Exporter type (traces, metrics, logs)
     */
    type: "traces" | "metrics" | "logs";

    /**
     * Exporter configuration
     */
    config: any;
}

/**
 * OpenTelemetry pipeline configuration
 */
export interface OTelPipeline {
    /**
     * Pipeline type (traces, metrics, logs)
     */
    type: "traces" | "metrics" | "logs";

    /**
     * Receivers to use in this pipeline
     */
    receivers: string[];

    /**
     * Processors to use in this pipeline
     */
    processors: string[];

    /**
     * Exporters to use in this pipeline
     */
    exporters: string[];
}

/**
 * OpenTelemetry Collector Helm configuration
 */
export interface OTelCollectorHelmConfig {
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
     * Replica count (for deployment mode)
     */
    replicas?: number;

    /**
     * Service configuration for external access
     */
    service?: {
        type?: "ClusterIP" | "LoadBalancer" | "NodePort";
        annotations?: { [key: string]: string };
        otlpGrpcPort?: number;
        otlpHttpPort?: number;
    };
}

/**
 * Arguments for OpenTelemetry Collector Component
 */
export interface OTelCollectorComponentArgs extends BaseComponentArgs {
    /**
     * EKS cluster name where OTel Collector will be deployed
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
     * Deployment mode (daemonset or deployment)
     * - daemonset: Runs on every node (recommended for node-level telemetry)
     * - deployment: Centralized collector (recommended for cluster-level aggregation)
     */
    mode: "daemonset" | "deployment";

    /**
     * Receivers configuration
     */
    receivers?: OTelReceiver[];

    /**
     * Processors configuration
     */
    processors?: OTelProcessor[];

    /**
     * Exporters configuration
     */
    exporters?: OTelExporter[];

    /**
     * Pipelines configuration
     */
    pipelines?: OTelPipeline[];

    /**
     * Helm configuration
     */
    helm: OTelCollectorHelmConfig;

    /**
     * Tempo endpoint for trace export
     */
    tempoEndpoint?: pulumi.Input<string>;

    /**
     * Mimir/Prometheus endpoint for metrics export
     */
    mimirEndpoint?: pulumi.Input<string>;

    /**
     * Loki endpoint for logs export
     */
    lokiEndpoint?: pulumi.Input<string>;
}

/**
 * Outputs from OpenTelemetry Collector Component
 */
export interface OTelCollectorComponentOutputs {
    /**
     * OTel Collector OTLP gRPC endpoint
     */
    otlpGrpcEndpoint: pulumi.Output<string>;

    /**
     * OTel Collector OTLP HTTP endpoint
     */
    otlpHttpEndpoint: pulumi.Output<string>;

    /**
     * Helm release name
     */
    releaseName: pulumi.Output<string>;

    /**
     * Namespace where OTel Collector is deployed
     */
    namespace: pulumi.Output<string>;
}

/**
 * OpenTelemetry Collector Component
 *
 * This component deploys the OpenTelemetry Collector as a unified
 * telemetry collection agent for traces, metrics, and logs.
 *
 * Features:
 * - Daemonset or Deployment mode
 * - OTLP gRPC and HTTP receivers
 * - Automatic export to Tempo, Mimir, and Loki
 * - Resource detection and enrichment
 * - Batch processing for efficiency
 * - Memory limiting to prevent OOM
 * - Customizable receivers, processors, and exporters
 * - Kubernetes metadata enrichment
 */
export class OTelCollectorComponent extends BaseAWSComponent implements OTelCollectorComponentOutputs {
    public readonly otlpGrpcEndpoint: pulumi.Output<string>;
    public readonly otlpHttpEndpoint: pulumi.Output<string>;
    public readonly releaseName: pulumi.Output<string>;
    public readonly namespace: pulumi.Output<string>;

    private readonly provider: aws.Provider;
    private readonly k8sProvider: k8s.Provider;
    private helmRelease: k8s.helm.v3.Release;

    constructor(
        name: string,
        args: OTelCollectorComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:observability:OTelCollector", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [
            CommonValidationRules.required("clusterName"),
            CommonValidationRules.required("mode"),
            CommonValidationRules.required("helm"),
            CommonValidationRules.enumValue("mode", ["daemonset", "deployment"])
        ]);

        // Create AWS provider
        this.provider = this.createProvider(args.region);

        // Create Kubernetes provider
        this.k8sProvider = this.createK8sProvider(args);

        // Deploy OTel Collector via Helm
        this.helmRelease = this.deployOTelCollectorHelm(args);

        // Set outputs
        this.releaseName = this.helmRelease.name;
        this.namespace = pulumi.output(args.helm.namespace || "opentelemetry");

        // Endpoints depend on deployment mode
        const serviceName = args.mode === "daemonset"
            ? "opentelemetry-collector"
            : "opentelemetry-collector";

        this.otlpGrpcEndpoint = pulumi.interpolate`${serviceName}.${this.namespace}.svc.cluster.local:4317`;
        this.otlpHttpEndpoint = pulumi.interpolate`${serviceName}.${this.namespace}.svc.cluster.local:4318`;

        // Register outputs
        this.registerOutputs({
            otlpGrpcEndpoint: this.otlpGrpcEndpoint,
            otlpHttpEndpoint: this.otlpHttpEndpoint,
            releaseName: this.releaseName,
            namespace: this.namespace
        });
    }

    /**
     * Create Kubernetes provider for EKS cluster
     */
    private createK8sProvider(args: OTelCollectorComponentArgs): k8s.Provider {
        const kubeconfig = pulumi.all([
            args.clusterName,
            args.clusterEndpoint,
            args.clusterCertificateAuthority
        ]).apply(([name, endpoint, ca]) => {
            return JSON.stringify({
                apiVersion: "v1",
                kind: "Config",
                clusters: [{
                    cluster: {
                        server: endpoint,
                        "certificate-authority-data": ca
                    },
                    name: "kubernetes"
                }],
                contexts: [{
                    context: {
                        cluster: "kubernetes",
                        user: "aws"
                    },
                    name: "aws"
                }],
                "current-context": "aws",
                users: [{
                    name: "aws",
                    user: {
                        exec: {
                            apiVersion: "client.authentication.k8s.io/v1beta1",
                            command: "aws",
                            args: [
                                "eks",
                                "get-token",
                                "--cluster-name",
                                name,
                                "--region",
                                this.region
                            ]
                        }
                    }
                }]
            });
        });

        return new k8s.Provider(`${this.getResourceName()}-k8s-provider`, {
            kubeconfig: kubeconfig
        }, { parent: this });
    }

    /**
     * Deploy OpenTelemetry Collector using Helm chart
     */
    private deployOTelCollectorHelm(args: OTelCollectorComponentArgs): k8s.helm.v3.Release {
        const namespace = args.helm.namespace || "opentelemetry";
        const chartVersion = args.helm.chartVersion || "0.111.0";
        const repository = args.helm.repository || "https://open-telemetry.github.io/opentelemetry-helm-charts";

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

        // Deploy OTel Collector Helm chart
        return new k8s.helm.v3.Release(
            `${this.getResourceName()}-helm`,
            {
                chart: "opentelemetry-collector",
                version: chartVersion,
                namespace: namespace,
                repositoryOpts: {
                    repo: repository
                },
                values: values,
                skipAwait: false,
                timeout: 600
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
    private buildHelmValues(args: OTelCollectorComponentArgs): any {
        const baseValues: any = {
            mode: args.mode,
            config: {
                receivers: this.buildReceivers(args),
                processors: this.buildProcessors(args),
                exporters: this.buildExporters(args),
                service: {
                    pipelines: this.buildPipelines(args)
                }
            }
        };

        // Configure replicas for deployment mode
        if (args.mode === "deployment") {
            baseValues.replicaCount = args.helm.replicas || 2;
        }

        // Configure resources
        if (args.helm.resources) {
            baseValues.resources = args.helm.resources;
        }

        // Configure service for external access
        if (args.helm.service) {
            const serviceAnnotations = args.helm.service.type === "LoadBalancer" ? {
                "service.beta.kubernetes.io/aws-load-balancer-type": "nlb",
                "service.beta.kubernetes.io/aws-load-balancer-internal": "true",
                "service.beta.kubernetes.io/aws-load-balancer-scheme": "internal",
                "service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled": "true",
                ...args.helm.service.annotations
            } : args.helm.service.annotations || {};

            baseValues.service = {
                type: args.helm.service.type || "ClusterIP",
                annotations: serviceAnnotations
            };

            // Configure ports if LoadBalancer
            if (args.helm.service.type === "LoadBalancer") {
                baseValues.ports = {
                    "otlp-grpc": {
                        enabled: true,
                        containerPort: 4317,
                        servicePort: args.helm.service.otlpGrpcPort || 4317,
                        protocol: "TCP"
                    },
                    "otlp-http": {
                        enabled: true,
                        containerPort: 4318,
                        servicePort: args.helm.service.otlpHttpPort || 4318,
                        protocol: "TCP"
                    }
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
     * Build receivers configuration
     */
    private buildReceivers(args: OTelCollectorComponentArgs): any {
        const receivers: any = {
            // Default OTLP receiver (gRPC and HTTP)
            otlp: {
                protocols: {
                    grpc: {
                        endpoint: "0.0.0.0:4317"
                    },
                    http: {
                        endpoint: "0.0.0.0:4318"
                    }
                }
            }
        };

        // Add custom receivers
        if (args.receivers) {
            args.receivers.forEach(receiver => {
                receivers[receiver.name] = receiver.config;
            });
        }

        return receivers;
    }

    /**
     * Build processors configuration
     */
    private buildProcessors(args: OTelCollectorComponentArgs): any {
        const processors: any = {
            // Default batch processor for efficiency
            batch: {
                timeout: "10s",
                send_batch_size: 1024,
                send_batch_max_size: 2048
            },
            // Memory limiter to prevent OOM
            memory_limiter: {
                check_interval: "1s",
                limit_percentage: 80,
                spike_limit_percentage: 25
            },
            // Resource detection for cloud metadata
            resourcedetection: {
                detectors: ["env", "system", "eks"],
                timeout: "5s"
            },
            // Kubernetes attributes processor
            k8sattributes: {
                auth_type: "serviceAccount",
                passthrough: false,
                extract: {
                    metadata: [
                        "k8s.pod.name",
                        "k8s.pod.uid",
                        "k8s.deployment.name",
                        "k8s.namespace.name",
                        "k8s.node.name",
                        "k8s.pod.start_time"
                    ]
                }
            }
        };

        // Add custom processors
        if (args.processors) {
            args.processors.forEach(processor => {
                processors[processor.name] = processor.config;
            });
        }

        return processors;
    }

    /**
     * Build exporters configuration
     */
    private buildExporters(args: OTelCollectorComponentArgs): any {
        const exporters: any = {
            // Debug exporter for troubleshooting
            logging: {
                loglevel: "info",
                sampling_initial: 5,
                sampling_thereafter: 200
            }
        };

        // Add Tempo exporter for traces
        if (args.tempoEndpoint) {
            exporters.otlp_tempo = pulumi.output(args.tempoEndpoint).apply(endpoint => ({
                endpoint: endpoint,
                tls: {
                    insecure: true
                }
            }));
        }

        // Add Mimir/Prometheus exporter for metrics
        if (args.mimirEndpoint) {
            exporters.prometheusremotewrite = pulumi.output(args.mimirEndpoint).apply(endpoint => ({
                endpoint: `${endpoint}/api/v1/push`,
                tls: {
                    insecure: true
                }
            }));
        }

        // Add Loki exporter for logs
        if (args.lokiEndpoint) {
            exporters.loki = pulumi.output(args.lokiEndpoint).apply(endpoint => ({
                endpoint: `${endpoint}/loki/api/v1/push`,
                tls: {
                    insecure: true
                }
            }));
        }

        // Add custom exporters
        if (args.exporters) {
            args.exporters.forEach(exporter => {
                exporters[exporter.name] = exporter.config;
            });
        }

        return exporters;
    }

    /**
     * Build pipelines configuration
     */
    private buildPipelines(args: OTelCollectorComponentArgs): any {
        const pipelines: any = {};

        if (args.pipelines) {
            args.pipelines.forEach(pipeline => {
                pipelines[pipeline.type] = {
                    receivers: pipeline.receivers,
                    processors: pipeline.processors,
                    exporters: pipeline.exporters
                };
            });
        } else {
            // Default pipelines
            const defaultProcessors = ["memory_limiter", "resourcedetection", "k8sattributes", "batch"];

            // Traces pipeline
            const traceExporters = ["logging"];
            if (args.tempoEndpoint) {
                traceExporters.push("otlp_tempo");
            }
            pipelines.traces = {
                receivers: ["otlp"],
                processors: defaultProcessors,
                exporters: traceExporters
            };

            // Metrics pipeline
            const metricsExporters = ["logging"];
            if (args.mimirEndpoint) {
                metricsExporters.push("prometheusremotewrite");
            }
            pipelines.metrics = {
                receivers: ["otlp"],
                processors: defaultProcessors,
                exporters: metricsExporters
            };

            // Logs pipeline
            const logsExporters = ["logging"];
            if (args.lokiEndpoint) {
                logsExporters.push("loki");
            }
            pipelines.logs = {
                receivers: ["otlp"],
                processors: defaultProcessors,
                exporters: logsExporters
            };
        }

        return pipelines;
    }

    /**
     * Get OTLP gRPC endpoint
     */
    public getOtlpGrpcEndpoint(): pulumi.Output<string> {
        return this.otlpGrpcEndpoint;
    }

    /**
     * Get OTLP HTTP endpoint
     */
    public getOtlpHttpEndpoint(): pulumi.Output<string> {
        return this.otlpHttpEndpoint;
    }
}
