import * as pulumi from "@pulumi/pulumi";
import { BaseComponentArgs } from "../shared/base";

/**
 * Kafka topic specification
 */
export interface TopicSpec {
    name: string;
    partitions: number;
    replicas: number;
    config?: Record<string, string>;
}

/**
 * Kafka broker storage configuration
 */
export interface StorageSpec {
    type: "ephemeral" | "persistent-claim";
    size?: string;
    class?: string;
}

/**
 * Kubernetes resource requests/limits
 */
export interface ResourceSpec {
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
}

/**
 * Arguments for StrimziKafkaComponent
 */
export interface StrimziKafkaComponentArgs extends BaseComponentArgs {
    clusterName: string;
    clusterEndpoint: pulumi.Input<string>;
    clusterCertificateAuthority: pulumi.Input<string>;
    kubeconfig: pulumi.Input<string>;
    kafkaVersion?: string;
    strimziVersion?: string;
    brokerReplicas?: number;
    namespace?: string;
    operatorNamespace?: string;
    topics?: TopicSpec[];
    enableMetrics?: boolean;
    enableLoadBalancer?: boolean;
    storage?: StorageSpec;
    resources?: ResourceSpec;
}

/**
 * Outputs from StrimziKafkaComponent
 */
export interface StrimziKafkaOutputs {
    clusterName: pulumi.Output<string>;
    bootstrapServers: pulumi.Output<string>;
    bootstrapNlbDnsName: pulumi.Output<string>;
    bootstrapNlbHostedZoneId: pulumi.Output<string>;
    namespace: string;
    metricsPort: number;
}

/**
 * Arguments for KafkaMirrorMaker2Component
 */
export interface KafkaMirrorMaker2Args extends BaseComponentArgs {
    localClusterAlias: string;
    localBootstrapServers: string;
    remoteClusterAlias: string;
    remoteBootstrapServers: pulumi.Input<string>;
    topicsPattern?: string;
    topicsExcludePattern?: string;
    kafkaVersion?: string;
    replicas?: number;
    namespace?: string;
    kubeconfig: pulumi.Input<string>;
    enableMetrics?: boolean;
}

/**
 * Outputs from KafkaMirrorMaker2Component
 */
export interface KafkaMirrorMaker2Outputs {
    name: pulumi.Output<string>;
    sourceCluster: string;
    targetCluster: string;
    replicatedTopics: string;
}
