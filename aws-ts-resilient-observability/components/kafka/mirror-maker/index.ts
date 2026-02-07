import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, CommonValidationRules } from "../../shared/base";
import { createEKSKubernetesProvider } from "../../shared/utils/kubernetes-helpers";
import { KafkaMirrorMaker2Args, KafkaMirrorMaker2Outputs } from "../types";
import { mm2MetricsConfig } from "../metrics";

/**
 * KafkaMirrorMaker2Component
 *
 * Deploys MirrorMaker 2 for unidirectional replication from a remote
 * Kafka cluster to the local cluster using IdentityReplicationPolicy.
 *
 * Each region runs its own MM2 instance that replicates FROM the
 * remote cluster TO the local cluster. This avoids bidirectional
 * configuration in a single resource which can cause infinite loops.
 */
export class KafkaMirrorMaker2Component extends BaseAWSComponent implements KafkaMirrorMaker2Outputs {
    public readonly name: pulumi.Output<string>;
    public readonly sourceCluster: string;
    public readonly targetCluster: string;
    public readonly replicatedTopics: string;

    private readonly k8sProvider: k8s.Provider;

    constructor(
        name: string,
        args: KafkaMirrorMaker2Args,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super("custom:aws:kafka:KafkaMirrorMaker2", name, args, opts);

        this.validateArgs(args, [
            CommonValidationRules.required<KafkaMirrorMaker2Args>("localClusterAlias"),
            CommonValidationRules.required<KafkaMirrorMaker2Args>("localBootstrapServers"),
            CommonValidationRules.required<KafkaMirrorMaker2Args>("remoteClusterAlias"),
            CommonValidationRules.required<KafkaMirrorMaker2Args>("remoteBootstrapServers"),
            CommonValidationRules.required<KafkaMirrorMaker2Args>("kubeconfig"),
        ]);

        const kafkaNamespace = args.namespace ?? "kafka";
        const kafkaVersion = args.kafkaVersion ?? "4.0.0";
        const replicas = args.replicas ?? 1;
        const enableMetrics = args.enableMetrics ?? true;
        const topicsPattern = args.topicsPattern ?? "events";
        const topicsExcludePattern = args.topicsExcludePattern ?? ".*[\\-.]internal,__.*";

        // Direction: replicates FROM remote TO local
        this.sourceCluster = args.remoteClusterAlias;
        this.targetCluster = args.localClusterAlias;
        this.replicatedTopics = topicsPattern;

        // Create Kubernetes provider
        this.k8sProvider = new k8s.Provider(
            `${this.getResourceName()}-k8s-provider`,
            {
                kubeconfig: args.kubeconfig,
            },
            { parent: this },
        );

        // MM2 resource name: mm2-from-<remote>
        const mm2Name = `mm2-from-${args.remoteClusterAlias}`;

        // 1. Create MM2 metrics ConfigMap (if enabled)
        let metricsConfigMap: k8s.core.v1.ConfigMap | undefined;
        if (enableMetrics) {
            metricsConfigMap = new k8s.core.v1.ConfigMap(
                `${this.getResourceName()}-mm2-metrics`,
                {
                    metadata: {
                        name: "mm2-metrics",
                        namespace: kafkaNamespace,
                    },
                    data: {
                        "metrics-config.yml": mm2MetricsConfig,
                    },
                },
                { parent: this, provider: this.k8sProvider },
            );
        }

        // 2. Build MM2 spec per contracts sections 4/5
        const mm2Spec: any = {
            version: kafkaVersion,
            replicas: replicas,
            connectCluster: args.localClusterAlias,
            clusters: [
                {
                    alias: args.localClusterAlias,
                    bootstrapServers: args.localBootstrapServers,
                },
                {
                    alias: args.remoteClusterAlias,
                    bootstrapServers: args.remoteBootstrapServers,
                },
            ],
            mirrors: [
                {
                    sourceCluster: args.remoteClusterAlias,
                    targetCluster: args.localClusterAlias,
                    topicsPattern: topicsPattern,
                    topicsExcludePattern: topicsExcludePattern,
                    groupsPattern: ".*",
                    sourceConnector: {
                        tasksMax: 1,
                        config: {
                            "replication.factor": 1,
                            "offset-syncs.topic.replication.factor": 1,
                            "sync.topic.acls.enabled": "false",
                            "replication.policy.class":
                                "org.apache.kafka.connect.mirror.IdentityReplicationPolicy",
                            "refresh.topics.interval.seconds": 60,
                        },
                    },
                    checkpointConnector: {
                        tasksMax: 1,
                        config: {
                            "checkpoints.topic.replication.factor": 1,
                            "replication.policy.class":
                                "org.apache.kafka.connect.mirror.IdentityReplicationPolicy",
                            "sync.group.offsets.enabled": "true",
                            "refresh.groups.interval.seconds": 60,
                            "emit.checkpoints.interval.seconds": 60,
                        },
                    },
                    heartbeatConnector: {
                        config: {
                            "heartbeats.topic.replication.factor": 1,
                        },
                    },
                },
            ],
        };

        // Add metricsConfig if enabled
        if (enableMetrics && metricsConfigMap) {
            mm2Spec.metricsConfig = {
                type: "jmxPrometheusExporter",
                valueFrom: {
                    configMapKeyRef: {
                        name: "mm2-metrics",
                        key: "metrics-config.yml",
                    },
                },
            };
        }

        // 3. Create KafkaMirrorMaker2 CustomResource
        const mm2Resource = new k8s.apiextensions.CustomResource(
            `${this.getResourceName()}-mm2`,
            {
                apiVersion: "kafka.strimzi.io/v1beta2",
                kind: "KafkaMirrorMaker2",
                metadata: {
                    name: mm2Name,
                    namespace: kafkaNamespace,
                },
                spec: mm2Spec,
            },
            {
                parent: this,
                provider: this.k8sProvider,
                dependsOn: metricsConfigMap ? [metricsConfigMap] : [],
            },
        );

        // Set outputs
        this.name = pulumi.output(mm2Name);

        this.registerOutputs({
            name: this.name,
            sourceCluster: this.sourceCluster,
            targetCluster: this.targetCluster,
            replicatedTopics: this.replicatedTopics,
        });
    }
}
