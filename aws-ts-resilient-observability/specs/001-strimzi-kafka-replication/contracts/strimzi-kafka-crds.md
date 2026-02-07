# Strimzi CRD Contracts

**Feature**: 001-strimzi-kafka-replication
**Date**: 2026-02-07

These contracts define the Kubernetes custom resources that the
Pulumi components will create via `k8s.apiextensions.CustomResource`.

## 1. KafkaNodePool

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaNodePool
metadata:
  name: dual-role
  namespace: kafka
  labels:
    strimzi.io/cluster: workload-kafka
spec:
  replicas: 1
  roles:
    - controller
    - broker
  storage:
    type: ephemeral
  resources:
    requests:
      cpu: "200m"
      memory: "512Mi"
    limits:
      cpu: "500m"
      memory: "1Gi"
```

## 2. Kafka Cluster

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: workload-kafka
  namespace: kafka
  annotations:
    strimzi.io/node-pools: enabled
    strimzi.io/kraft: enabled
spec:
  kafka:
    version: "4.0.0"
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
      - name: external
        port: 9094
        type: loadbalancer
        tls: false
        configuration:
          bootstrap:
            annotations:
              service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
              service.beta.kubernetes.io/aws-load-balancer-scheme: "internal"
          brokers:
            - broker: 0
              annotations:
                service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
                service.beta.kubernetes.io/aws-load-balancer-scheme: "internal"
    config:
      offsets.topic.replication.factor: 1
      transaction.state.log.replication.factor: 1
      transaction.state.log.min.isr: 1
      default.replication.factor: 1
      min.insync.replicas: 1
      auto.create.topics.enable: true
      log.retention.hours: 24
      log.retention.bytes: 1073741824
    metricsConfig:
      type: jmxPrometheusExporter
      valueFrom:
        configMapKeyRef:
          name: kafka-metrics
          key: kafka-metrics-config.yml
  entityOperator:
    topicOperator: {}
    userOperator: {}
```

## 3. KafkaTopic

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: events
  namespace: kafka
  labels:
    strimzi.io/cluster: workload-kafka
spec:
  partitions: 3
  replicas: 1
  config:
    retention.ms: "86400000"
    segment.bytes: "107374182"
    cleanup.policy: delete
```

## 4. KafkaMirrorMaker2 (Primary Region Instance)

Deployed in the primary region, replicates FROM secondary TO primary.

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaMirrorMaker2
metadata:
  name: mm2-from-secondary
  namespace: kafka
spec:
  version: "4.0.0"
  replicas: 1
  connectCluster: primary
  clusters:
    - alias: primary
      bootstrapServers: workload-kafka-kafka-bootstrap.kafka.svc:9092
    - alias: secondary
      bootstrapServers: <secondary-nlb-dns>:9094
  mirrors:
    - sourceCluster: secondary
      targetCluster: primary
      topicsPattern: "events"
      topicsExcludePattern: ".*[\\-.]internal,__.*"
      groupsPattern: ".*"
      sourceConnector:
        tasksMax: 1
        config:
          replication.factor: 1
          offset-syncs.topic.replication.factor: 1
          sync.topic.acls.enabled: "false"
          replication.policy.class: >-
            org.apache.kafka.connect.mirror.IdentityReplicationPolicy
          refresh.topics.interval.seconds: 60
      checkpointConnector:
        tasksMax: 1
        config:
          checkpoints.topic.replication.factor: 1
          replication.policy.class: >-
            org.apache.kafka.connect.mirror.IdentityReplicationPolicy
          sync.group.offsets.enabled: "true"
          refresh.groups.interval.seconds: 60
          emit.checkpoints.interval.seconds: 60
      heartbeatConnector:
        config:
          heartbeats.topic.replication.factor: 1
  metricsConfig:
    type: jmxPrometheusExporter
    valueFrom:
      configMapKeyRef:
        name: mm2-metrics
        key: metrics-config.yml
```

## 5. KafkaMirrorMaker2 (Secondary Region Instance)

Deployed in the secondary region, replicates FROM primary TO
secondary. Identical structure with swapped aliases and bootstrap
servers.

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaMirrorMaker2
metadata:
  name: mm2-from-primary
  namespace: kafka
spec:
  version: "4.0.0"
  replicas: 1
  connectCluster: secondary
  clusters:
    - alias: secondary
      bootstrapServers: workload-kafka-kafka-bootstrap.kafka.svc:9092
    - alias: primary
      bootstrapServers: <primary-nlb-dns>:9094
  mirrors:
    - sourceCluster: primary
      targetCluster: secondary
      topicsPattern: "events"
      topicsExcludePattern: ".*[\\-.]internal,__.*"
      groupsPattern: ".*"
      sourceConnector:
        tasksMax: 1
        config:
          replication.factor: 1
          offset-syncs.topic.replication.factor: 1
          sync.topic.acls.enabled: "false"
          replication.policy.class: >-
            org.apache.kafka.connect.mirror.IdentityReplicationPolicy
          refresh.topics.interval.seconds: 60
      checkpointConnector:
        tasksMax: 1
        config:
          checkpoints.topic.replication.factor: 1
          replication.policy.class: >-
            org.apache.kafka.connect.mirror.IdentityReplicationPolicy
          sync.group.offsets.enabled: "true"
          refresh.groups.interval.seconds: 60
          emit.checkpoints.interval.seconds: 60
      heartbeatConnector:
        config:
          heartbeats.topic.replication.factor: 1
  metricsConfig:
    type: jmxPrometheusExporter
    valueFrom:
      configMapKeyRef:
        name: mm2-metrics
        key: metrics-config.yml
```

## 6. Metrics ConfigMaps

### kafka-metrics ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-metrics
  namespace: kafka
data:
  kafka-metrics-config.yml: |
    lowercaseOutputName: true
    rules:
      - pattern: kafka.server<type=(.+), name=(.+)><>Count
        name: kafka_server_$1_$2_total
        type: COUNTER
      - pattern: kafka.server<type=(.+), name=(.+)><>Value
        name: kafka_server_$1_$2
        type: GAUGE
      - pattern: kafka.controller<type=(.+), name=(.+)><>(Count|Value)
        name: kafka_controller_$1_$2
        type: GAUGE
```

### mm2-metrics ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mm2-metrics
  namespace: kafka
data:
  metrics-config.yml: |
    lowercaseOutputName: true
    rules:
      - pattern: kafka.connect<type=(.+), name=(.+)><>Value
        name: kafka_connect_$1_$2
        type: GAUGE
      - pattern: kafka.connect<type=(.+), name=(.+)><>Count
        name: kafka_connect_$1_$2_total
        type: COUNTER
```
