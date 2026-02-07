# Data Model: Strimzi Kafka with Multi-Region Topic Replication

**Feature**: 001-strimzi-kafka-replication
**Date**: 2026-02-07

## Entities

### StrimziKafkaComponent

Pulumi ComponentResource that deploys a complete Kafka cluster.

**Inputs** (`StrimziKafkaComponentArgs`):

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| clusterName | string | yes | — | Kafka cluster name (used in CRD metadata) |
| clusterEndpoint | pulumi.Output\<string\> | yes | — | EKS cluster endpoint (from infra stack) |
| clusterCertificateAuthority | pulumi.Output\<string\> | yes | — | EKS cluster CA (from infra stack) |
| kubeconfig | pulumi.Output\<string\> | yes | — | EKS kubeconfig (from infra stack) |
| kafkaVersion | string | no | "4.0.0" | Kafka version |
| strimziVersion | string | no | "0.50.0" | Strimzi Helm chart version |
| brokerReplicas | number | no | 1 | Number of broker nodes |
| namespace | string | no | "kafka" | Kubernetes namespace for Kafka |
| operatorNamespace | string | no | "strimzi" | Kubernetes namespace for operator |
| topics | TopicSpec[] | no | [] | Topics to create |
| enableMetrics | boolean | no | true | Enable JMX Prometheus exporter |
| enableLoadBalancer | boolean | no | false | Enable NLB listener for cross-VPC access |
| storage | StorageSpec | no | {type:"ephemeral"} | Broker storage configuration |
| resources | ResourceSpec | no | (see below) | CPU/memory for broker |
| region | string | yes | — | AWS region |
| tags | Record\<string,string\> | no | {} | AWS resource tags |

**Sub-types**:

```
TopicSpec {
  name: string           # e.g., "events"
  partitions: number     # e.g., 3
  replicas: number       # e.g., 1
  config: Record<string, string>  # e.g., {"retention.ms":"86400000"}
}

StorageSpec {
  type: "ephemeral" | "persistent-claim"
  size?: string          # e.g., "10Gi"
  class?: string         # e.g., "gp3-encrypted"
}

ResourceSpec {
  requests: { cpu: string, memory: string }
  limits: { cpu: string, memory: string }
}
```

**Outputs** (`StrimziKafkaOutputs`):

| Field | Type | Description |
|-------|------|-------------|
| clusterName | pulumi.Output\<string\> | Kafka cluster name |
| bootstrapServers | pulumi.Output\<string\> | Internal bootstrap address |
| bootstrapNlbDnsName | pulumi.Output\<string\> | NLB DNS (if loadbalancer enabled) |
| bootstrapNlbHostedZoneId | pulumi.Output\<string\> | NLB hosted zone ID (for Route 53) |
| namespace | string | Kafka namespace |
| metricsPort | number | 9404 (JMX exporter port) |

### KafkaMirrorMaker2Component

Pulumi ComponentResource that deploys MirrorMaker 2 for
unidirectional replication from a remote cluster to the local cluster.

**Inputs** (`KafkaMirrorMaker2Args`):

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| localClusterAlias | string | yes | — | Alias for the local Kafka cluster |
| localBootstrapServers | string | yes | — | Bootstrap address of local cluster |
| remoteClusterAlias | string | yes | — | Alias for the remote Kafka cluster |
| remoteBootstrapServers | pulumi.Output\<string\> | yes | — | Bootstrap address of remote cluster (via NLB) |
| topicsPattern | string | no | "events" | Topics to replicate |
| topicsExcludePattern | string | no | (internal topics) | Topics to exclude |
| kafkaVersion | string | no | "4.0.0" | Kafka version for MM2 |
| replicas | number | no | 1 | MM2 connector replicas |
| namespace | string | no | "kafka" | Kubernetes namespace |
| kubeconfig | pulumi.Output\<string\> | yes | — | EKS kubeconfig |
| enableMetrics | boolean | no | true | Enable JMX Prometheus exporter |
| region | string | yes | — | AWS region |
| tags | Record\<string,string\> | no | {} | Resource tags |

**Outputs** (`KafkaMirrorMaker2Outputs`):

| Field | Type | Description |
|-------|------|-------------|
| name | pulumi.Output\<string\> | MM2 resource name |
| sourceCluster | string | Remote cluster alias |
| targetCluster | string | Local cluster alias |
| replicatedTopics | string | Topics pattern being replicated |

### deployment-config.yaml Additions

New component entries in the workloads-apps stacks:

```yaml
# In workloads-apps-primary
- name: strimzi-kafka
  type: strimzi-kafka
  config:
    region: us-east-1
    primary: true
    clusterName: workload-kafka
    enableLoadBalancer: true
    enableMetrics: true
    topics:
      - name: events
        partitions: 3
        replicas: 1
        config:
          retention.ms: "86400000"

- name: kafka-mirror-maker
  type: kafka-mirror-maker-2
  config:
    region: us-east-1
    primary: true
    localClusterAlias: primary
    remoteClusterAlias: secondary
    topicsPattern: events

# In workloads-apps-secondary (similar, swapped aliases)
```

### Route 53 Record

Added to the existing `route53` component config in workloads-infra:

```yaml
- name: kafka-bootstrap-dns
  type: route53-record
  config:
    recordName: kafka-bootstrap
    type: A
    setIdentifier: us-east-1  # or us-west-2
    latencyRoutingPolicy:
      region: us-east-1       # or us-west-2
    aliasTarget:
      name: <NLB DNS from StrimziKafkaComponent output>
      evaluateTargetHealth: true
```

## Relationships

```
deployment-config.yaml
  └── workloads-apps-primary
  │     ├── strimzi-kafka (StrimziKafkaComponent)
  │     │     ├── Strimzi Operator (Helm Release)
  │     │     ├── KafkaNodePool (CustomResource)
  │     │     ├── Kafka cluster (CustomResource)
  │     │     ├── KafkaTopic "events" (CustomResource)
  │     │     └── Metrics ConfigMap
  │     └── kafka-mirror-maker (KafkaMirrorMaker2Component)
  │           └── KafkaMirrorMaker2 (CustomResource)
  │                 source: secondary → target: primary
  └── workloads-apps-secondary
        ├── strimzi-kafka (StrimziKafkaComponent)
        │     └── (same as primary)
        └── kafka-mirror-maker (KafkaMirrorMaker2Component)
              └── KafkaMirrorMaker2 (CustomResource)
                    source: primary → target: secondary

Route 53 latency record
  ├── us-east-1 → primary NLB → primary Kafka bootstrap
  └── us-west-2 → secondary NLB → secondary Kafka bootstrap
```

## State Transitions

### Kafka Cluster Lifecycle

```
Not Deployed → Operator Installing → Operator Ready →
  NodePool Creating → Kafka Creating → Kafka Ready →
  Topics Creating → Topics Ready → Metrics Enabled →
  LoadBalancer Provisioning → NLB Ready → OPERATIONAL
```

### MirrorMaker 2 Lifecycle

```
Not Deployed → MM2 Creating → Connectors Starting →
  Source Connector Running → Checkpoint Connector Running →
  Heartbeat Connector Running → REPLICATING
```

### Failover Sequence

```
ACTIVE-ACTIVE (normal) →
  Primary Health Check Fails →
  Route 53 removes primary endpoint →
  All producer traffic → secondary cluster →
  MM2 in primary stops (no connectivity) →
  MM2 in secondary continues (nothing to replicate) →
  SINGLE-REGION ACTIVE

Primary recovers →
  Route 53 re-adds primary endpoint →
  MM2 in primary resumes from last offset →
  Backlog replicated to primary →
  ACTIVE-ACTIVE (normal)
```
