# Research: Strimzi Kafka with Multi-Region Topic Replication

**Feature**: 001-strimzi-kafka-replication
**Date**: 2026-02-07

## R1: Strimzi Operator Helm Chart Version

**Decision**: Strimzi Kafka Operator Helm chart v0.50.0 from
`https://strimzi.io/charts/`

**Rationale**: Latest stable release. Supports Kafka 4.0.0 (matching
local environment). Introduces `kafka.strimzi.io/v1` API version
while maintaining `v1beta2` backward compatibility. KafkaNodePools GA.

**Alternatives considered**:
- v0.44.0 (older, lacks KRaft GA support)
- v0.49.1 (stable but older; 0.50.0 addresses more CVEs)

## R2: Kafka Deployment Mode (KRaft vs ZooKeeper)

**Decision**: KRaft mode with combined controller+broker node
(single KafkaNodePool with `roles: [controller, broker]`)

**Rationale**: Matches local environment configuration exactly.
KRaft is the standard in Kafka 4.0.0 (ZooKeeper removed). Single
dual-role node is appropriate for a test project.

**Alternatives considered**:
- Separate controller + broker node pools (unnecessary for 1 broker)
- ZooKeeper mode (deprecated in Kafka 4.0.0)

## R3: MirrorMaker 2 Topology

**Decision**: One `KafkaMirrorMaker2` resource per region, each
performing unidirectional replication from the remote cluster to the
local cluster.

**Rationale**: Safer than a single bidirectional MM2 resource.
Avoids `connectCluster` misconfiguration issues that can cause
infinite loops (Strimzi issue #9905). Each MM2 instance runs in the
region where its target cluster resides, reducing cross-region
control-plane traffic.

**Alternatives considered**:
- Single bidirectional MM2 resource: risks loop issues with
  IdentityReplicationPolicy; harder to debug
- DefaultReplicationPolicy with prefixed topics: requires app
  changes to subscribe to prefixed topics; breaks local parity

## R4: IdentityReplicationPolicy + Cycle Prevention

**Decision**: Use `org.apache.kafka.connect.mirror.IdentityReplicationPolicy`
(Kafka-native class) with narrow `topicsPattern: "events"` and
`topicsExcludePattern` for internal topics.

**Rationale**: The native Kafka class (not the deprecated Strimzi
extension) is the maintained implementation. Narrow topic patterns
prevent accidental replication of internal topics. Header-based
provenance tracking in Kafka 3.x+ provides additional loop
protection.

**Alternatives considered**:
- Strimzi `io.strimzi.kafka.connect.mirror.IdentityReplicationPolicy`:
  archived since Nov 2023, no longer maintained
- `DefaultReplicationPolicy`: would prefix topics, requiring app
  changes

## R5: Kafka Bootstrap DNS via Route 53

**Decision**: Strimzi `loadbalancer` listener type creates internal
NLBs per region. Route 53 latency-based A record aliases to each
NLB for active-active producer routing.

**Rationale**: Strimzi natively provisions LoadBalancer services
(NLBs on AWS) for external access. Internal NLBs are accessible
cross-VPC via Transit Gateway. Route 53 latency-based routing
directs producers to the nearest cluster automatically.

**DNS chain**: Route 53 record → Internal NLB (per region) →
K8s Service (`kafka-cluster-kafka-bootstrap`) → Kafka broker pod

**Alternatives considered**:
- NodePort + manual NLB: more control but more setup; unnecessary
  for test project
- Internal K8s service only: not routable cross-VPC; no Route 53
  integration possible

## R6: Pulumi Pattern for Strimzi CRDs

**Decision**: `k8s.helm.v3.Release` for Strimzi operator;
`k8s.apiextensions.CustomResource` for Kafka, KafkaNodePool,
KafkaTopic, KafkaMirrorMaker2 CRDs.

**Rationale**: Matches existing project patterns exactly (see
observability components). Helm Release for operators that install
CRDs; CustomResource for individual CRD instances that need
fine-grained Pulumi lifecycle management.

**Dependency chain**:
1. Strimzi Operator Helm Release (installs CRDs)
2. KafkaNodePool (must exist before Kafka)
3. Kafka cluster (must exist before KafkaTopic / KafkaMirrorMaker2)
4. KafkaTopic + KafkaMirrorMaker2 (depend on Kafka cluster)

**Alternatives considered**:
- All-Helm approach (single chart with sub-charts): Strimzi doesn't
  provide a "Kafka cluster" Helm chart; CRDs are the designed path
- Raw YAML manifests via `k8s.yaml.ConfigFile`: loses Pulumi
  type-safety and output tracking

## R7: Strimzi Metrics Export for Observability

**Decision**: Enable `metricsConfig` on Kafka and MM2 CRDs with
`jmxPrometheusExporter` type, referencing a ConfigMap with JMX
exporter rules. Existing OTel Collector scrapes metrics.

**Rationale**: Strimzi has built-in JMX Prometheus exporter support.
The existing OTel Collector in each workload cluster can be
configured with a Prometheus receiver to scrape Kafka/MM2 metrics
endpoints (port 9404).

**Key metrics**:
- `kafka_server_brokertopicmetrics_messagesin_total` (throughput)
- `kafka_connect_mirror_source_connector_replication_latency_ms`
  (replication lag)
- `kafka_controller_kafkacontroller_activecontrollercount` (health)

**Alternatives considered**:
- Separate Prometheus instance: unnecessary; OTel Collector already
  handles metric forwarding to Mimir
- No metrics (simplify): violates Constitution Principle II
  (Observability-Driven)

## R8: Component Architecture

**Decision**: Two new Pulumi components:
1. `StrimziKafkaComponent` — deploys operator, Kafka cluster,
   KafkaNodePool, KafkaTopic, metrics ConfigMap, and loadbalancer
   listener
2. `KafkaMirrorMaker2Component` — deploys MM2 CRD with unidirectional
   replication from remote cluster

Both extend `BaseAWSComponent` and accept a K8s provider.

**Rationale**: Separating Kafka from MM2 allows the primary region
to deploy Kafka without MM2 (MM2 depends on both clusters existing).
Follows the existing pattern where observability is split into
Loki, Tempo, Mimir, etc.

**Alternatives considered**:
- Single combined component: MM2 has a cross-region dependency that
  doesn't fit a single-component lifecycle
- Three components (operator + cluster + MM2): operator is always
  deployed with the cluster; separating adds unnecessary complexity
