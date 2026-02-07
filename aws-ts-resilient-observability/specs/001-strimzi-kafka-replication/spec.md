# Feature Specification: Strimzi Kafka with Multi-Region Topic Replication

**Feature Branch**: `001-strimzi-kafka-replication`
**Created**: 2026-02-07
**Status**: Draft
**Input**: User description: "In the local directory we have local k8s cluster with some test application we need to build something similar, in local everything is working fine. One additional if we're planning to use multi region we need replicate topic so I think MirrorMaker 2.0 would be great fit an additional Strimzi"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy Kafka Cluster to Workload EKS (Priority: P1)

As a platform operator, I want a Kafka cluster running in the primary
region workload EKS cluster so that the existing producer and consumer
applications (app1, app2) can exchange domain events (orders, payments,
shipments) the same way they do in the local environment.

**Why this priority**: Without a running Kafka cluster in the primary
region there is no message bus for the workload applications. Every
other story depends on this.

**Independent Test**: Deploy the Kafka cluster, connect a test producer
and consumer, send a message to the `events` topic, and confirm it is
received within 5 seconds.

**Acceptance Scenarios**:

1. **Given** the workload EKS cluster is running in us-east-1,
   **When** the Strimzi operator and Kafka cluster are deployed,
   **Then** the Kafka cluster is healthy and the `events` topic (3
   partitions) is accessible from pods in the workload namespace.

2. **Given** app1-producer is deployed in the same cluster,
   **When** app1 publishes an order event to the `events` topic,
   **Then** the message is persisted in Kafka and available for
   consumption within 2 seconds.

3. **Given** app2-consumer is deployed and subscribed to the `events`
   topic,
   **When** an event is published by app1,
   **Then** app2 consumes and processes the event, and the full
   distributed trace (producer -> Kafka -> consumer) is visible in the
   observability stack.

---

### User Story 2 - Deploy Kafka Cluster to Secondary Region (Priority: P2)

As a platform operator, I want an identical Kafka cluster running in
the secondary region (us-west-2) so that the DR workload environment
has its own message bus ready for failover.

**Why this priority**: Multi-region resilience requires both regions to
have a working Kafka cluster before replication can be configured.

**Independent Test**: Deploy the Kafka cluster in us-west-2, run the
same producer/consumer connectivity test as US1, and confirm the
`events` topic is functional.

**Acceptance Scenarios**:

1. **Given** the workload EKS cluster is running in us-west-2,
   **When** the Strimzi operator and Kafka cluster are deployed,
   **Then** the Kafka cluster is healthy with the same topic
   configuration as the primary region.

2. **Given** the secondary Kafka cluster is running,
   **When** a local producer sends a message to the secondary `events`
   topic,
   **Then** the message is persisted and consumable within the
   secondary region independently of the primary region.

---

### User Story 3 - Cross-Region Topic Replication via MirrorMaker 2 (Priority: P3)

As a platform operator, I want events published in the primary region
to be automatically replicated to the secondary region (and vice versa)
so that during a regional failover consumers in the surviving region
have access to the most recent events with minimal data loss.

**Why this priority**: This is the DR capability that ties the two
independent Kafka clusters together. It depends on both clusters
being operational first (US1 + US2).

**Independent Test**: Publish 1000 events to the primary `events`
topic, wait for replication, and confirm at least 999 events appear in
the secondary region's replicated topic within 60 seconds.

**Acceptance Scenarios**:

1. **Given** both Kafka clusters are running and MirrorMaker 2 is
   deployed,
   **When** a producer publishes an event to the primary `events`
   topic,
   **Then** the event is replicated to the secondary region within 30
   seconds.

2. **Given** bidirectional replication is configured,
   **When** a producer publishes an event to the secondary `events`
   topic,
   **Then** the event is replicated to the primary region within 30
   seconds.

3. **Given** the primary region becomes unavailable,
   **When** Route 53 health checks detect the outage and redirect all
   producer traffic to the secondary region,
   **Then** consumers in the secondary region continue reading from
   their local cluster (which already has replicated events), new
   producer traffic flows exclusively to the secondary cluster, and
   no messages are lost.

4. **Given** replication is running,
   **When** the replication lag is monitored,
   **Then** replication lag does not exceed 60 seconds under normal
   operating conditions (< 1000 messages/sec throughput).

---

### Edge Cases

- What happens when the cross-region network link is temporarily
  interrupted? Replication MUST resume automatically once connectivity
  is restored without manual intervention or data loss.
- What happens when the single Kafka broker restarts? The cluster
  MUST recover and resume producing/consuming within 2 minutes.
  With a single broker, messages in-flight during restart may be
  lost (accepted tradeoff for a test project).
- What happens when MirrorMaker 2 is restarted? It MUST resume
  replication from the last committed offset, not from the beginning
  or latest.
- How are infinite replication loops prevented with identity
  replication? MirrorMaker 2 MUST use exclude filters (e.g.,
  excluding topics that match the remote cluster's source connector
  internal topics) and message header provenance tracking to ensure
  an event replicated from cluster A to B is not replicated back to A.

## Clarifications

### Session 2026-02-07

- Q: How is producer traffic distributed across the two regional
  Kafka clusters? → A: Active-Active. Both regions receive producer
  traffic simultaneously via Route 53 latency-based routing.
  Consumers read from their local cluster. MirrorMaker 2 ensures
  events published in either region are available in both.
- Q: Should the feature include actual deployment or tests only?
  → A: Tests only. No actual deployment is executed; validation is
  performed through unit and integration tests using `pulumi preview`.
- Q: What is the source of truth for stack configuration?
  → A: The Pulumi Automation API with `deployment-config.yaml`. All
  stack definitions, component configurations, and cross-stack
  dependencies MUST be declared in `deployment-config.yaml` and
  orchestrated via the Automation API.
- Q: How do consumers handle replicated topics in active-active mode?
  → A: Identity replication. MirrorMaker 2 uses
  `IdentityReplicationPolicy` so remote events land in the same
  `events` topic name locally. Consumers subscribe to `events` only.
  Cycle prevention is handled via exclude filters in MirrorMaker 2
  configuration.
- Q: How many Kafka brokers per region? → A: 1 broker per region
  (matching the local setup). This is a test/learning project; fault
  tolerance via multi-broker quorum is not required.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST deploy a Kafka message broker to each
  workload EKS cluster (primary and secondary regions).
- **FR-002**: The system MUST deploy the Strimzi operator to manage
  the Kafka clusters declaratively via custom resources.
- **FR-003**: Each Kafka cluster MUST provision an `events` topic with
  3 partitions matching the local development configuration.
- **FR-004**: The system MUST deploy MirrorMaker 2 to replicate the
  `events` topic bidirectionally between the primary and secondary
  Kafka clusters.
- **FR-005**: Replication MUST use `IdentityReplicationPolicy` so
  that replicated events arrive in the same topic name (`events`) on
  the remote cluster. MirrorMaker 2 MUST be configured with exclude
  filters to prevent infinite replication loops between clusters.
- **FR-006**: The system MUST expose Kafka metrics to the shared
  observability stack so that cluster health, consumer lag, and
  replication lag are monitored.
- **FR-007**: The Kafka clusters MUST be accessible only from within
  the workload VPC and connected shared-services VPC (via Transit
  Gateway); no public internet exposure.
- **FR-008**: The system MUST support the same producer/consumer
  interaction pattern as the local environment (apps publish and
  consume from the `events` topic using internal cluster DNS).
- **FR-009**: MirrorMaker 2 MUST automatically resume replication from
  the last committed offset after restart or failure.
- **FR-010**: The system MUST retain messages for a minimum of 24
  hours, consistent with the local development configuration.
- **FR-011**: The system MUST provide a Route 53 latency-based DNS
  record for the Kafka bootstrap endpoint so that producers are
  automatically routed to the nearest regional cluster.
- **FR-012**: Both Kafka clusters MUST operate in active-active mode:
  each region independently accepts producer writes and serves
  consumer reads. MirrorMaker 2 ensures eventual consistency of
  events across both clusters.

### Key Entities

- **Kafka Cluster**: A set of broker instances managed by Strimzi,
  deployed per region. Key attributes: cluster name, broker count,
  listener configuration, resource limits.
- **Topic**: A named message channel (e.g., `events`) with defined
  partition count, replication factor, and retention policy.
- **MirrorMaker 2 Connector**: A replication bridge between two Kafka
  clusters. Key attributes: source cluster, target cluster, topic
  allowlist, replication direction, offset sync interval.
- **Consumer Group**: A logical grouping of consumers (e.g.,
  `app2-consumer-group`) that share topic partition assignments for
  load balancing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Applications can produce and consume events from the
  Kafka cluster in each region with end-to-end latency under 5
  seconds (publish to consume).
- **SC-002**: Cross-region topic replication delivers 99.9% of
  messages within 60 seconds under normal operating conditions.
- **SC-003**: During a simulated regional failover, consumers in the
  surviving region can read replicated events within 5 minutes of
  failover initiation (aligns with platform RTO target).
- **SC-004**: Kafka cluster health and replication lag are visible in
  the observability dashboards within 2 minutes of deployment.
- **SC-005**: Zero message loss during planned MirrorMaker 2 restarts
  or rolling Kafka broker upgrades.
- **SC-006**: All Pulumi components pass unit tests and `pulumi
  preview` completes without errors for both regional stacks.

### Assumptions

- The workload EKS clusters in both regions are already provisioned
  and healthy (handled by existing `workloads-infra-*` stacks).
- Transit Gateway connectivity between shared-services and workload
  VPCs is operational, enabling cross-VPC telemetry forwarding.
- The observability stack (Mimir, Loki, Tempo, Grafana) is already
  deployed in both regions and ready to receive Kafka metrics.
- The Kafka cluster will use 1 broker per region (matching the local
  setup) with a replication factor of 1. This is a test/learning
  project; production-grade multi-broker quorum is out of scope.
- Application workloads (app1, app2) will be deployed separately in a
  future feature; this feature focuses on the Kafka infrastructure.
- Cross-region Kafka communication for MirrorMaker 2 will traverse
  the Transit Gateway peering between regions (not the public
  internet).
- All new stacks and components MUST be declared in
  `deployment-config.yaml` and orchestrated via the Pulumi Automation
  API. No standalone `pulumi up` commands outside the Automation API.
- This feature delivers code and tests only; no actual cloud
  deployment is performed. Validation is via unit tests and
  `pulumi preview`.
