# Quickstart: Strimzi Kafka with Multi-Region Topic Replication

**Feature**: 001-strimzi-kafka-replication
**Date**: 2026-02-07

## Prerequisites

- Node.js and npm installed
- Pulumi CLI installed
- Project dependencies installed (`npm install`)

## Verify the Implementation

Since this feature is tests-only (no cloud deployment), validation
is performed through unit tests and `pulumi preview`.

### 1. Run Unit Tests

```bash
# Run all unit tests (includes Kafka component tests)
npm test

# Run only Kafka-related unit tests
npx jest tests/unit/strimzi-kafka.test.ts
npx jest tests/unit/kafka-mirror-maker.test.ts
```

### 2. Run Integration Tests

```bash
# Run Kafka integration tests (validates cross-stack references)
npx jest --config jest.integration.config.js \
  tests/integration/kafka-replication.test.ts
```

### 3. Preview Deployment (Optional)

If AWS credentials are available:

```bash
# Preview workloads-apps-primary stack
npm run preview:multi-region
```

This runs `pulumi preview` via the Automation API against all stacks
defined in `deployment-config.yaml`, including the new Kafka
components.

## What Was Added

### New Components

1. **`components/kafka/strimzi/index.ts`**
   (`StrimziKafkaComponent`):
   - Deploys Strimzi operator via Helm
   - Creates Kafka cluster (KRaft, single broker)
   - Creates `events` topic (3 partitions)
   - Enables JMX Prometheus metrics
   - Optionally creates internal NLB listener

2. **`components/kafka/mirror-maker/index.ts`**
   (`KafkaMirrorMaker2Component`):
   - Deploys MirrorMaker 2 for unidirectional replication
   - Uses IdentityReplicationPolicy (same topic names)
   - Configures offset sync and checkpoint connectors
   - Enables JMX Prometheus metrics

### Updated Files

- **`deployment-config.yaml`**: New `strimzi-kafka` and
  `kafka-mirror-maker-2` components in `workloads-apps-primary`
  and `workloads-apps-secondary` stacks
- **`workloads/apps/index.ts`**: Instantiates
  `StrimziKafkaComponent` and `KafkaMirrorMaker2Component`
  alongside the existing OTel Collector agent

### Configuration in deployment-config.yaml

The new components appear under `workloads-apps-primary` and
`workloads-apps-secondary` stacks:

```yaml
- name: strimzi-kafka
  type: strimzi-kafka
  config:
    region: us-east-1      # or us-west-2
    primary: true           # or false
    clusterName: workload-kafka
    enableLoadBalancer: true
    enableMetrics: true
    topics:
      - name: events
        partitions: 3
        replicas: 1

- name: kafka-mirror-maker
  type: kafka-mirror-maker-2
  config:
    region: us-east-1      # or us-west-2
    primary: true           # or false
    localClusterAlias: primary    # or secondary
    remoteClusterAlias: secondary # or primary
    topicsPattern: events
```

## Architecture Summary

```
us-east-1 (primary)              us-west-2 (secondary)
┌─────────────────────┐         ┌─────────────────────┐
│ Workload EKS        │         │ Workload EKS        │
│                     │         │                     │
│ ┌─────────────────┐ │         │ ┌─────────────────┐ │
│ │ Strimzi Operator│ │         │ │ Strimzi Operator│ │
│ └─────────────────┘ │         │ └─────────────────┘ │
│                     │         │                     │
│ ┌─────────────────┐ │  MM2   │ ┌─────────────────┐ │
│ │ Kafka (1 broker)│◄├─────────┤►│ Kafka (1 broker)│ │
│ │ Topic: events   │ │ (bidir)│ │ Topic: events   │ │
│ └───────┬─────────┘ │         │ └───────┬─────────┘ │
│         │ NLB       │         │         │ NLB       │
└─────────┼───────────┘         └─────────┼───────────┘
          │                               │
          └──────────┬────────────────────┘
                     │
          Route 53 Latency Record
          kafka-bootstrap.workloads...
```
