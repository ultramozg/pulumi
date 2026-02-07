# Implementation Plan: Strimzi Kafka with Multi-Region Topic Replication

**Branch**: `001-strimzi-kafka-replication` | **Date**: 2026-02-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-strimzi-kafka-replication/spec.md`

## Summary

Deploy Strimzi-managed Kafka clusters (single broker, KRaft mode) to
both regional workload EKS clusters with MirrorMaker 2 for
bidirectional topic replication using IdentityReplicationPolicy. The
feature adds new Pulumi components (`StrimziKafkaComponent`,
`KafkaMirrorMaker2Component`) following the existing
`BaseAWSComponent` pattern, new stack entries in
`deployment-config.yaml`, and Route 53 latency-based DNS for
active-active producer routing. Validation is via unit tests and
`pulumi preview` only — no actual cloud deployment.

## Technical Context

**Language/Version**: TypeScript / Node.js (matches existing project)
**Primary Dependencies**: `@pulumi/pulumi`, `@pulumi/aws`,
`@pulumi/kubernetes` (existing); Strimzi Helm chart v0.50.0, Kafka
4.0.0 (new)
**Storage**: Kafka ephemeral or persistent-claim (gp3-encrypted
StorageClass on EKS); no external database
**Testing**: Jest (unit: `jest.config.js`, integration:
`jest.integration.config.js`); Pulumi `runtime.setMocks` pattern
**Target Platform**: AWS EKS (us-east-1, us-west-2)
**Project Type**: Infrastructure-as-Code (Pulumi multi-stack)
**Performance Goals**: < 5s end-to-end produce/consume; < 60s
cross-region replication lag at < 1000 msg/sec
**Constraints**: Tests only, no deployment; 1 broker per region;
Automation API via `deployment-config.yaml` is source of truth
**Scale/Scope**: 2 regions, 1 broker each, 1 topic (`events`, 3
partitions), bidirectional replication

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. IaC-First | PASS | All components via Pulumi; Helm via `k8s.helm.v3.Release`; CRDs via `k8s.apiextensions.CustomResource`; config in `deployment-config.yaml` |
| II. Observability-Driven | PASS | Kafka JMX metrics via Strimzi `metricsConfig`; scraped by existing OTel Collector; Grafana dashboards as code |
| III. Resilience by Design | PASS | Kafka in both regions; MirrorMaker 2 bidirectional; Route 53 latency-based active-active routing |
| IV. Testing Discipline | PASS | Unit tests for both components; integration tests for cross-stack references; `pulumi preview` gate |
| V. Simplicity / YAGNI | PASS | 1 broker per region (test project); reuses existing patterns (`BaseAWSComponent`, Helm Release); no over-engineering |

**Gate result: ALL PASS** — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-strimzi-kafka-replication/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (Strimzi CRD specs)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
components/
├── kafka/
│   ├── strimzi/
│   │   └── index.ts             # StrimziKafkaComponent
│   └── mirror-maker/
│       └── index.ts             # KafkaMirrorMaker2Component
workloads/
├── apps/
│   └── index.ts                 # Updated: instantiate Kafka + MM2

tests/
├── unit/
│   ├── strimzi-kafka.test.ts    # Unit tests for StrimziKafkaComponent
│   └── kafka-mirror-maker.test.ts # Unit tests for MM2Component
├── integration/
│   └── kafka-replication.test.ts  # Cross-stack integration tests

deployment-config.yaml             # Updated: new components in
                                   # workloads-apps-primary/secondary
```

**Structure Decision**: New components follow the existing
`components/<domain>/<component>/index.ts` pattern. Kafka components
live under `components/kafka/` parallel to `components/observability/`
and `components/aws/`. The workloads apps stack (`workloads/apps/`)
is updated to instantiate Kafka alongside the existing OTel agent.

## Complexity Tracking

> No Constitution Check violations — this section is not required.
