import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, CommonValidationRules } from "../../shared/base";
import { createEKSKubernetesProvider } from "../../shared/utils/kubernetes-helpers";
import { StrimziKafkaComponentArgs, StrimziKafkaOutputs } from "../types";
import { kafkaMetricsConfig } from "../metrics";

/**
 * StrimziKafkaComponent
 *
 * Deploys a complete Kafka cluster managed by the Strimzi operator:
 * - Strimzi operator via Helm chart
 * - KafkaNodePool (KRaft, dual-role: controller + broker)
 * - Kafka cluster with internal and optional loadbalancer listeners
 * - KafkaTopic resources
 * - JMX Prometheus metrics ConfigMap
 */
export class StrimziKafkaComponent extends BaseAWSComponent implements StrimziKafkaOutputs {
    public readonly clusterName: pulumi.Output<string>;
    public readonly bootstrapServers: pulumi.Output<string>;
    public readonly bootstrapNlbDnsName: pulumi.Output<string>;
    public readonly bootstrapNlbHostedZoneId: pulumi.Output<string>;
    public readonly namespace: string;
    public readonly metricsPort: number;

    private readonly k8sProvider: k8s.Provider;

    constructor(
        name: string,
        args: StrimziKafkaComponentArgs,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super("custom:aws:kafka:StrimziKafka", name, args, opts);

        this.validateArgs(args, [
            CommonValidationRules.required<StrimziKafkaComponentArgs>("clusterName"),
            CommonValidationRules.required<StrimziKafkaComponentArgs>("kubeconfig"),
        ]);

        const kafkaNamespace = args.namespace ?? "kafka";
        const operatorNamespace = args.operatorNamespace ?? "strimzi";
        const strimziVersion = args.strimziVersion ?? "0.50.0";
        const kafkaVersion = args.kafkaVersion ?? "4.0.0";
        const brokerReplicas = args.brokerReplicas ?? 1;
        const enableMetrics = args.enableMetrics ?? true;
        const enableLoadBalancer = args.enableLoadBalancer ?? false;
        const storage = args.storage ?? { type: "ephemeral" as const };
        const resourceSpec = args.resources ?? {
            requests: { cpu: "200m", memory: "512Mi" },
            limits: { cpu: "500m", memory: "1Gi" },
        };

        this.namespace = kafkaNamespace;
        this.metricsPort = 9404;

        // Create Kubernetes provider for the target EKS cluster
        this.k8sProvider = createEKSKubernetesProvider(
            `${this.getResourceName()}-k8s-provider`,
            {
                clusterName: args.clusterName,
                clusterEndpoint: args.clusterEndpoint,
                clusterCertificateAuthority: args.clusterCertificateAuthority,
                region: this.region,
            },
            { parent: this },
        );

        // 1. Deploy Strimzi operator via Helm
        const strimziOperator = new k8s.helm.v3.Release(
            `${this.getResourceName()}-strimzi-operator`,
            {
                chart: "strimzi-kafka-operator",
                version: strimziVersion,
                namespace: operatorNamespace,
                createNamespace: true,
                repositoryOpts: {
                    repo: "https://strimzi.io/charts/",
                },
                values: {
                    watchAnyNamespace: true,
                },
                skipAwait: false,
                timeout: 600,
            },
            { parent: this, provider: this.k8sProvider },
        );

        // 2. Create kafka namespace
        const kafkaNs = new k8s.core.v1.Namespace(
            `${this.getResourceName()}-kafka-ns`,
            {
                metadata: { name: kafkaNamespace },
            },
            { parent: this, provider: this.k8sProvider },
        );

        // 3. Create metrics ConfigMap (if enabled)
        let metricsConfigMap: k8s.core.v1.ConfigMap | undefined;
        if (enableMetrics) {
            metricsConfigMap = new k8s.core.v1.ConfigMap(
                `${this.getResourceName()}-kafka-metrics`,
                {
                    metadata: {
                        name: "kafka-metrics",
                        namespace: kafkaNamespace,
                    },
                    data: {
                        "kafka-metrics-config.yml": kafkaMetricsConfig,
                    },
                },
                { parent: this, provider: this.k8sProvider, dependsOn: [kafkaNs] },
            );
        }

        // 4. Create KafkaNodePool (dual-role: controller + broker)
        const nodePool = new k8s.apiextensions.CustomResource(
            `${this.getResourceName()}-node-pool`,
            {
                apiVersion: "kafka.strimzi.io/v1beta2",
                kind: "KafkaNodePool",
                metadata: {
                    name: "dual-role",
                    namespace: kafkaNamespace,
                    labels: {
                        "strimzi.io/cluster": args.clusterName,
                    },
                },
                spec: {
                    replicas: brokerReplicas,
                    roles: ["controller", "broker"],
                    storage: storage.type === "persistent-claim"
                        ? { type: "persistent-claim", size: storage.size ?? "10Gi", class: storage.class }
                        : { type: "ephemeral" },
                    resources: resourceSpec,
                },
            },
            { parent: this, provider: this.k8sProvider, dependsOn: [strimziOperator, kafkaNs] },
        );

        // 5. Build Kafka listeners
        const listeners: any[] = [
            {
                name: "plain",
                port: 9092,
                type: "internal",
                tls: false,
            },
        ];

        if (enableLoadBalancer) {
            listeners.push({
                name: "external",
                port: 9094,
                type: "loadbalancer",
                tls: false,
                configuration: {
                    bootstrap: {
                        annotations: {
                            "service.beta.kubernetes.io/aws-load-balancer-type": "nlb",
                            "service.beta.kubernetes.io/aws-load-balancer-scheme": "internal",
                        },
                    },
                    brokers: [
                        {
                            broker: 0,
                            annotations: {
                                "service.beta.kubernetes.io/aws-load-balancer-type": "nlb",
                                "service.beta.kubernetes.io/aws-load-balancer-scheme": "internal",
                            },
                        },
                    ],
                },
            });
        }

        // 6. Build Kafka spec
        const kafkaSpec: any = {
            kafka: {
                version: kafkaVersion,
                listeners: listeners,
                config: {
                    "offsets.topic.replication.factor": 1,
                    "transaction.state.log.replication.factor": 1,
                    "transaction.state.log.min.isr": 1,
                    "default.replication.factor": 1,
                    "min.insync.replicas": 1,
                    "auto.create.topics.enable": true,
                    "log.retention.hours": 24,
                    "log.retention.bytes": 1073741824,
                },
            },
            entityOperator: {
                topicOperator: {},
                userOperator: {},
            },
        };

        if (enableMetrics && metricsConfigMap) {
            kafkaSpec.kafka.metricsConfig = {
                type: "jmxPrometheusExporter",
                valueFrom: {
                    configMapKeyRef: {
                        name: "kafka-metrics",
                        key: "kafka-metrics-config.yml",
                    },
                },
            };
        }

        // 7. Create Kafka cluster
        const kafkaCluster = new k8s.apiextensions.CustomResource(
            `${this.getResourceName()}-kafka-cluster`,
            {
                apiVersion: "kafka.strimzi.io/v1beta2",
                kind: "Kafka",
                metadata: {
                    name: args.clusterName,
                    namespace: kafkaNamespace,
                    annotations: {
                        "strimzi.io/node-pools": "enabled",
                        "strimzi.io/kraft": "enabled",
                    },
                },
                spec: kafkaSpec,
            },
            {
                parent: this,
                provider: this.k8sProvider,
                dependsOn: [
                    strimziOperator,
                    nodePool,
                    ...(metricsConfigMap ? [metricsConfigMap] : []),
                ],
            },
        );

        // 8. Create KafkaTopics
        const topics = args.topics ?? [];
        for (const topic of topics) {
            new k8s.apiextensions.CustomResource(
                `${this.getResourceName()}-topic-${topic.name}`,
                {
                    apiVersion: "kafka.strimzi.io/v1beta2",
                    kind: "KafkaTopic",
                    metadata: {
                        name: topic.name,
                        namespace: kafkaNamespace,
                        labels: {
                            "strimzi.io/cluster": args.clusterName,
                        },
                    },
                    spec: {
                        partitions: topic.partitions,
                        replicas: topic.replicas,
                        config: topic.config ?? {},
                    },
                },
                { parent: this, provider: this.k8sProvider, dependsOn: [kafkaCluster] },
            );
        }

        // Set outputs
        this.clusterName = pulumi.output(args.clusterName);
        this.bootstrapServers = pulumi.output(
            `${args.clusterName}-kafka-bootstrap.${kafkaNamespace}.svc:9092`,
        );

        // NLB outputs (only meaningful when loadbalancer is enabled)
        if (enableLoadBalancer) {
            this.bootstrapNlbDnsName = pulumi.output(
                `${args.clusterName}-kafka-external-bootstrap.${kafkaNamespace}.svc`,
            );
            this.bootstrapNlbHostedZoneId = pulumi.output("placeholder-hosted-zone-id");
        } else {
            this.bootstrapNlbDnsName = pulumi.output("");
            this.bootstrapNlbHostedZoneId = pulumi.output("");
        }

        this.registerOutputs({
            clusterName: this.clusterName,
            bootstrapServers: this.bootstrapServers,
            bootstrapNlbDnsName: this.bootstrapNlbDnsName,
            bootstrapNlbHostedZoneId: this.bootstrapNlbHostedZoneId,
            namespace: this.namespace,
            metricsPort: this.metricsPort,
        });
    }
}
