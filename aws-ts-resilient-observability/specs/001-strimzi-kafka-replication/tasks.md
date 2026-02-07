# Tasks: Strimzi Kafka with Multi-Region Topic Replication

**Input**: Design documents from `/specs/001-strimzi-kafka-replication/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/strimzi-kafka-crds.md
**Tests**: Required (per spec — tests-only delivery, no cloud deployment)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directory structure and shared TypeScript types for both Kafka components

- [ ] T001 Create directory structure: `components/kafka/strimzi/` and `components/kafka/mirror-maker/`
- [ ] T002 [P] Create shared TypeScript interfaces in `components/kafka/types.ts` — `TopicSpec`, `StorageSpec`, `ResourceSpec`, `StrimziKafkaComponentArgs`, `StrimziKafkaOutputs`, `KafkaMirrorMaker2Args`, `KafkaMirrorMaker2Outputs` (per data-model.md)
- [ ] T003 [P] Create metrics ConfigMap data constants in `components/kafka/metrics.ts` — Kafka JMX exporter rules and MM2 JMX exporter rules (per contracts section 6)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update deployment-config.yaml and workloads/apps/index.ts to wire Kafka components into the Automation API

**CRITICAL**: Component registration in deployment-config.yaml MUST be complete before user story implementations can be validated

- [ ] T004 Update `deployment-config.yaml` — add `strimzi-kafka` and `kafka-mirror-maker` component entries to both `workloads-apps-primary` and `workloads-apps-secondary` stacks (per data-model.md section "deployment-config.yaml Additions")
- [ ] T005 Update `workloads/apps/index.ts` — add conditional instantiation of `StrimziKafkaComponent` and `KafkaMirrorMaker2Component` alongside the existing OTel Collector, reading config from `deployment-config.yaml` via the component config pattern

**Checkpoint**: Deployment config and workload wiring ready — component implementations can now begin

---

## Phase 3: User Story 1 — Deploy Kafka Cluster to Primary Region (Priority: P1) MVP

**Goal**: StrimziKafkaComponent deploys Strimzi operator (Helm), Kafka cluster (KRaft), KafkaNodePool, KafkaTopic, metrics ConfigMap, and optional NLB listener — all as Pulumi resources

**Independent Test**: `npx jest tests/unit/strimzi-kafka.test.ts` passes; `pulumi preview` includes all Kafka resources

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T006 [US1] Create unit test file `tests/unit/strimzi-kafka.test.ts` with Pulumi `runtime.setMocks` pattern:
  - Test: Strimzi Helm Release is created with correct chart version (0.50.0) and repository
  - Test: KafkaNodePool CustomResource has roles `[controller, broker]` and 1 replica
  - Test: Kafka CustomResource has KRaft annotations, internal + loadbalancer listeners, metricsConfig reference
  - Test: KafkaTopic CustomResource creates `events` topic with 3 partitions, 1 replica, 24h retention
  - Test: Kafka metrics ConfigMap is created in the kafka namespace
  - Test: When `enableLoadBalancer: false`, no loadbalancer listener is configured
  - Test: When `enableMetrics: false`, no metricsConfig is set on Kafka CRD
  - Test: Component outputs include `bootstrapServers` and `clusterName`

### Implementation for User Story 1

- [ ] T007 [US1] Implement `StrimziKafkaComponent` in `components/kafka/strimzi/index.ts`:
  - Extend `BaseAWSComponent` pattern (per `components/shared/base.ts`)
  - Create K8s namespaces (operator + kafka) if not existing
  - Deploy Strimzi operator via `k8s.helm.v3.Release` (chart v0.50.0 from strimzi.io/charts)
  - Create Kafka metrics ConfigMap (from `components/kafka/metrics.ts`)
  - Create KafkaNodePool CustomResource (per contracts section 1)
  - Create Kafka CustomResource (per contracts section 2), dependent on operator + node pool
  - Create KafkaTopic CustomResource for each topic in args (per contracts section 3)
  - Conditionally configure `loadbalancer` listener with internal NLB annotations
  - Conditionally configure `metricsConfig` on Kafka CRD
  - Export `StrimziKafkaOutputs`: clusterName, bootstrapServers, bootstrapNlbDnsName, bootstrapNlbHostedZoneId, namespace, metricsPort

- [ ] T008 [US1] Verify unit tests pass: run `npx jest tests/unit/strimzi-kafka.test.ts`

**Checkpoint**: StrimziKafkaComponent fully implemented and tested — primary Kafka cluster deployable

---

## Phase 4: User Story 2 — Deploy Kafka Cluster to Secondary Region (Priority: P2)

**Goal**: Secondary region uses the same `StrimziKafkaComponent` with region-specific config in deployment-config.yaml; no new component code required

**Independent Test**: Unit tests from US1 cover the component; this phase validates deployment-config correctness

### Tests for User Story 2

- [ ] T009 [US2] Add test cases to `tests/unit/strimzi-kafka.test.ts`:
  - Test: Component accepts `region: "us-west-2"` and produces valid resources
  - Test: `primary: false` configuration is handled correctly (same component, different config)

### Implementation for User Story 2

- [ ] T010 [US2] Verify `deployment-config.yaml` secondary stack entries match primary (same component type, swapped region); already added in T004 — validate correctness
- [ ] T011 [US2] Verify `workloads/apps/index.ts` handles both primary and secondary stacks without code duplication — the same code path instantiates `StrimziKafkaComponent` with stack-specific config

**Checkpoint**: Both regional Kafka clusters deployable via the same component — secondary config validated

---

## Phase 5: User Story 3 — Cross-Region Replication via MirrorMaker 2 (Priority: P3)

**Goal**: KafkaMirrorMaker2Component deploys MM2 CRD for unidirectional replication from remote to local cluster; Route 53 latency-based DNS for active-active routing

**Independent Test**: `npx jest tests/unit/kafka-mirror-maker.test.ts` passes; integration test validates cross-stack references

### Tests for User Story 3

> **Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T012 [P] [US3] Create unit test file `tests/unit/kafka-mirror-maker.test.ts` with Pulumi `runtime.setMocks` pattern:
  - Test: KafkaMirrorMaker2 CustomResource is created with correct connectCluster (local alias)
  - Test: Clusters array has local (internal:9092) and remote (NLB:9094) bootstrap servers
  - Test: Mirror config uses `IdentityReplicationPolicy` class name
  - Test: topicsPattern is "events" and topicsExcludePattern excludes internal topics
  - Test: sourceConnector, checkpointConnector, heartbeatConnector are configured with replication.factor 1
  - Test: MM2 metrics ConfigMap is created when `enableMetrics: true`
  - Test: Component outputs include name, sourceCluster, targetCluster, replicatedTopics

- [ ] T013 [P] [US3] Create integration test file `tests/integration/kafka-replication.test.ts`:
  - Test: StrimziKafkaComponent outputs (bootstrapNlbDnsName) can be referenced by KafkaMirrorMaker2Component inputs
  - Test: deployment-config.yaml correctly defines both strimzi-kafka and kafka-mirror-maker in both regional stacks
  - Test: Cross-stack dependency resolution works (MM2 depends on remote Kafka outputs)

### Implementation for User Story 3

- [ ] T014 [US3] Implement `KafkaMirrorMaker2Component` in `components/kafka/mirror-maker/index.ts`:
  - Extend `BaseAWSComponent` pattern
  - Create MM2 metrics ConfigMap (from `components/kafka/metrics.ts`)
  - Create KafkaMirrorMaker2 CustomResource (per contracts sections 4/5):
    - `connectCluster` set to local cluster alias
    - Clusters array with local (internal bootstrap) and remote (NLB bootstrap)
    - Mirror config: sourceConnector with IdentityReplicationPolicy, checkpointConnector with offset sync, heartbeatConnector
    - topicsPattern and topicsExcludePattern from args
  - Conditionally configure `metricsConfig` on MM2 CRD
  - Export `KafkaMirrorMaker2Outputs`: name, sourceCluster, targetCluster, replicatedTopics

- [ ] T015 [US3] Verify unit tests pass: run `npx jest tests/unit/kafka-mirror-maker.test.ts`

- [ ] T016 [US3] Verify integration tests pass: run `npx jest --config jest.integration.config.js tests/integration/kafka-replication.test.ts`

**Checkpoint**: MirrorMaker 2 cross-region replication component fully implemented and tested

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, Route 53 DNS config, and end-to-end verification

- [ ] T017 [P] Add Route 53 latency-based DNS record configuration to `deployment-config.yaml` — `kafka-bootstrap` A record aliased to NLB per region (per data-model.md Route 53 section)
- [ ] T018 [P] Verify all tests pass together: `npm test`
- [ ] T019 Run quickstart.md validation steps (unit tests, integration tests, optional preview)
- [ ] T020 Code review: verify all components follow `BaseAWSComponent` pattern, all CRDs match contracts, all config in deployment-config.yaml

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T002 (shared types) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 completion; T006 (tests) before T007 (implementation)
- **US2 (Phase 4)**: Depends on US1 completion (same component, validated with region-specific config)
- **US3 (Phase 5)**: Depends on Phase 2 completion; can start in parallel with US1/US2 for test writing
- **Polish (Phase 6)**: Depends on all user stories being complete

### Critical Path

```
T001 → T002/T003 → T004/T005 → T006 → T007 → T008 → T009 → T012/T013 → T014 → T015/T016 → T017/T018 → T019 → T020
```

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Component code before wiring
- Unit tests before integration tests
- Story complete before moving to next priority

### Parallel Opportunities

- T002, T003 can run in parallel (different files)
- T004, T005 can run in parallel (different files)
- T012, T013 can run in parallel (different test files)
- T017, T018 can run in parallel (config vs test run)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (directory + types)
2. Complete Phase 2: Foundational (deployment-config + workloads wiring)
3. Complete Phase 3: US1 (StrimziKafkaComponent + tests)
4. **STOP and VALIDATE**: `npx jest tests/unit/strimzi-kafka.test.ts`
5. Demonstrate single-region Kafka deployment via `pulumi preview`

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1: StrimziKafkaComponent → Test → MVP Kafka cluster
3. US2: Secondary region validation → Test → Both clusters
4. US3: KafkaMirrorMaker2Component + Route 53 → Test → Full replication
5. Polish: End-to-end validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Tests-only delivery: no `pulumi up`, validate via `jest` and `pulumi preview`
- Automation API + `deployment-config.yaml` is source of truth for all component config
- All CRDs MUST match contracts in `contracts/strimzi-kafka-crds.md`
- Both components extend `BaseAWSComponent` from `components/shared/base.ts`
