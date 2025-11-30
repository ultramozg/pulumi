import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, BaseComponentArgs } from "../../shared/base";
import { CommonValidationRules } from "../../shared/base";
import { createEKSKubernetesProvider } from "../../shared/utils/kubernetes-helpers";

/**
 * Grafana datasource configuration
 */
export interface GrafanaDatasource {
    /**
     * Datasource name
     */
    name: string;

    /**
     * Datasource type (prometheus, loki, tempo, etc.)
     */
    type: "prometheus" | "loki" | "tempo" | "alertmanager" | "jaeger" | "zipkin";

    /**
     * Datasource URL
     */
    url: pulumi.Input<string>;

    /**
     * Whether this is the default datasource
     */
    isDefault?: boolean;

    /**
     * JSON data configuration
     */
    jsonData?: any;

    /**
     * Secure JSON data (passwords, tokens, etc.)
     */
    secureJsonData?: any;
}

/**
 * Grafana Helm chart configuration
 */
export interface GrafanaHelmConfig {
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
     * Admin password (if not provided, will be auto-generated)
     */
    adminPassword?: pulumi.Input<string>;

    /**
     * Enable persistence for dashboards and plugins
     */
    persistence?: {
        enabled: boolean;
        size?: string;
        storageClassName?: string;
    };

    /**
     * Ingress configuration
     */
    ingress?: {
        enabled: boolean;
        host?: string;
        annotations?: { [key: string]: string };
        tls?: {
            enabled: boolean;
            secretName?: string;
        };
    };

    /**
     * Plugins to install
     */
    plugins?: string[];
}

/**
 * Arguments for Grafana Component
 */
export interface GrafanaComponentArgs extends BaseComponentArgs {
    /**
     * EKS cluster name where Grafana will be deployed
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
     * Datasources to configure
     */
    datasources?: GrafanaDatasource[];

    /**
     * Helm configuration
     */
    helm: GrafanaHelmConfig;

    /**
     * Enable anonymous authentication (read-only)
     */
    anonymousAuth?: boolean;

    /**
     * Optional IAM role ARN to assume when authenticating to EKS
     */
    roleArn?: pulumi.Input<string>;
}

/**
 * Outputs from Grafana Component
 */
export interface GrafanaComponentOutputs {
    /**
     * Grafana endpoint (internal cluster DNS)
     */
    endpoint: pulumi.Output<string>;

    /**
     * Admin password (auto-generated if not provided)
     */
    adminPassword: pulumi.Output<string>;

    /**
     * Helm release name
     */
    releaseName: pulumi.Output<string>;

    /**
     * Namespace where Grafana is deployed
     */
    namespace: pulumi.Output<string>;

    /**
     * External URL (if ingress is enabled)
     */
    externalUrl?: pulumi.Output<string>;
}

/**
 * Grafana Component for unified observability visualization
 *
 * This component deploys Grafana with pre-configured datasources for
 * Loki, Tempo, and Mimir (or Prometheus).
 *
 * Features:
 * - Automatic datasource configuration for observability stack
 * - Dashboard persistence with PVC
 * - Plugin installation support
 * - Ingress support for external access
 * - LDAP/OAuth integration support (via custom values)
 * - High availability mode with multiple replicas
 * - Anonymous read-only access option
 */
export class GrafanaComponent extends BaseAWSComponent implements GrafanaComponentOutputs {
    public readonly endpoint: pulumi.Output<string>;
    public readonly adminPassword: pulumi.Output<string>;
    public readonly releaseName: pulumi.Output<string>;
    public readonly namespace: pulumi.Output<string>;
    public readonly externalUrl?: pulumi.Output<string>;

    private readonly provider: aws.Provider;
    private readonly k8sProvider: k8s.Provider;
    private helmRelease: k8s.helm.v3.Release;
    private adminPasswordSecret?: k8s.core.v1.Secret;

    constructor(
        name: string,
        args: GrafanaComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:observability:Grafana", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [
            CommonValidationRules.required("clusterName"),
            CommonValidationRules.required("helm")
        ]);

        // Create AWS provider
        this.provider = this.createProvider(args.region);

        // Create Kubernetes provider
        this.k8sProvider = this.createK8sProvider(args);

        // Generate or use provided admin password
        if (args.helm.adminPassword) {
            this.adminPassword = pulumi.output(args.helm.adminPassword);
        } else {
            this.adminPassword = this.generateAdminPassword();
        }

        // Deploy Grafana via Helm
        this.helmRelease = this.deployGrafanaHelm(args);

        // Set outputs
        this.releaseName = this.helmRelease.name;
        this.namespace = pulumi.output(args.helm.namespace || "grafana");
        this.endpoint = pulumi.interpolate`grafana.${this.namespace}.svc.cluster.local`;

        if (args.helm.ingress?.enabled && args.helm.ingress.host) {
            const protocol = args.helm.ingress.tls?.enabled ? "https" : "http";
            this.externalUrl = pulumi.output(`${protocol}://${args.helm.ingress.host}`);
        }

        // Register outputs
        this.registerOutputs({
            endpoint: this.endpoint,
            adminPassword: this.adminPassword,
            releaseName: this.releaseName,
            namespace: this.namespace,
            externalUrl: this.externalUrl
        });
    }

    /**
     * Create Kubernetes provider for EKS cluster
     */
    private createK8sProvider(args: GrafanaComponentArgs): k8s.Provider {
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
     * Generate a random admin password
     */
    private generateAdminPassword(): pulumi.Output<string> {
        const random = new aws.secretsmanager.Secret(
            `${this.getResourceName()}-admin-password`,
            {
                description: "Grafana admin password",
                tags: this.mergeTags({
                    Purpose: "GrafanaAdminPassword"
                })
            },
            { parent: this, provider: this.provider }
        );

        // Generate random password
        const password = new aws.secretsmanager.SecretVersion(
            `${this.getResourceName()}-admin-password-version`,
            {
                secretId: random.id,
                secretString: pulumi.all([]).apply(() => {
                    // Generate a random 32-character password
                    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
                    let password = "";
                    for (let i = 0; i < 32; i++) {
                        password += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    return password;
                })
            },
            { parent: random, provider: this.provider }
        );

        return pulumi.output(password.secretString).apply(s => s || "");
    }

    /**
     * Deploy Grafana using Helm chart
     */
    private deployGrafanaHelm(args: GrafanaComponentArgs): k8s.helm.v3.Release {
        const namespace = args.helm.namespace || "grafana";
        const chartVersion = args.helm.chartVersion || "8.8.2";
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

        // Deploy Grafana Helm chart
        return new k8s.helm.v3.Release(
            `${this.getResourceName()}-helm`,
            {
                chart: "grafana",
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
    private buildHelmValues(args: GrafanaComponentArgs): any {
        const baseValues: any = {
            replicas: args.helm.replicas || 1,
            adminPassword: this.adminPassword,
            plugins: args.helm.plugins || [],
            datasources: {
                "datasources.yaml": {
                    apiVersion: 1,
                    datasources: this.buildDatasources(args)
                }
            },
            "grafana.ini": {
                server: {
                    root_url: args.helm.ingress?.enabled && args.helm.ingress.host
                        ? `${args.helm.ingress.tls?.enabled ? "https" : "http"}://${args.helm.ingress.host}`
                        : undefined
                },
                "auth.anonymous": {
                    enabled: args.anonymousAuth ?? false,
                    org_role: "Viewer"
                }
            }
        };

        // Configure persistence
        if (args.helm.persistence?.enabled) {
            baseValues.persistence = {
                enabled: true,
                size: args.helm.persistence.size || "10Gi",
                storageClassName: args.helm.persistence.storageClassName || "gp3"
            };
        }

        // Configure resources
        if (args.helm.resources) {
            baseValues.resources = args.helm.resources;
        }

        // Configure ingress or LoadBalancer service
        if (args.helm.ingress?.enabled) {
            baseValues.ingress = {
                enabled: true,
                hosts: args.helm.ingress.host ? [args.helm.ingress.host] : [],
                annotations: args.helm.ingress.annotations || {},
                tls: args.helm.ingress.tls?.enabled ? [{
                    secretName: args.helm.ingress.tls.secretName || "grafana-tls",
                    hosts: args.helm.ingress.host ? [args.helm.ingress.host] : []
                }] : []
            };
        }

        // Configure service with internal NLB annotations if LoadBalancer
        baseValues.service = baseValues.service || {};
        if (baseValues.service.type === "LoadBalancer") {
            baseValues.service.annotations = {
                "service.beta.kubernetes.io/aws-load-balancer-type": "nlb",
                "service.beta.kubernetes.io/aws-load-balancer-internal": "true",
                "service.beta.kubernetes.io/aws-load-balancer-scheme": "internal",
                "service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled": "true",
                ...baseValues.service.annotations
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
     * Build datasources configuration
     */
    private buildDatasources(args: GrafanaComponentArgs): any[] {
        const datasources: any[] = [];

        if (args.datasources) {
            args.datasources.forEach(ds => {
                const datasource: any = {
                    name: ds.name,
                    type: ds.type,
                    url: ds.url,
                    isDefault: ds.isDefault ?? false,
                    access: "proxy",
                    editable: true
                };

                // Add type-specific configuration
                if (ds.type === "tempo") {
                    datasource.jsonData = {
                        ...ds.jsonData,
                        tracesToLogsV2: {
                            datasourceUid: "loki", // Link traces to logs
                            tags: ["job", "instance", "pod", "namespace"]
                        },
                        tracesToMetrics: {
                            datasourceUid: "prometheus", // Link traces to metrics
                            tags: [{ key: "service.name", value: "service" }]
                        },
                        serviceMap: {
                            datasourceUid: "prometheus"
                        }
                    };
                } else if (ds.type === "loki") {
                    datasource.jsonData = {
                        ...ds.jsonData,
                        derivedFields: [
                            {
                                datasourceUid: "tempo",
                                matcherRegex: "trace_id=(\\w+)",
                                name: "TraceID",
                                url: "${__value.raw}"
                            }
                        ]
                    };
                } else if (ds.jsonData) {
                    datasource.jsonData = ds.jsonData;
                }

                if (ds.secureJsonData) {
                    datasource.secureJsonData = ds.secureJsonData;
                }

                datasources.push(datasource);
            });
        }

        return datasources;
    }

    /**
     * Get Grafana endpoint
     */
    public getGrafanaEndpoint(): pulumi.Output<string> {
        return this.endpoint;
    }

    /**
     * Get admin password
     */
    public getAdminPassword(): pulumi.Output<string> {
        return this.adminPassword;
    }
}
