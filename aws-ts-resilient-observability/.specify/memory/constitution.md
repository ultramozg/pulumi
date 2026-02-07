<!--
Sync Impact Report
===================
Version change: 0.0.0 → 1.0.0 (MAJOR — initial ratification)

Modified principles: N/A (first version)

Added sections:
  - Core Principles (5): IaC-First, Observability-Driven,
    Resilience by Design, Testing Discipline, Simplicity
  - Infrastructure Constraints
  - Development Workflow
  - Governance

Removed sections: None

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no update needed
    (Constitution Check section is already generic/dynamic)
  - .specify/templates/spec-template.md ✅ no update needed
    (requirements section is generic; principles enforced at plan gate)
  - .specify/templates/tasks-template.md ✅ no update needed
    (task phases and testing guidance remain compatible)
  - .specify/templates/checklist-template.md ✅ no update needed
    (generic template; checklists generated from live constitution)
  - .specify/templates/agent-file-template.md ✅ no update needed
    (no principle-specific references)

Follow-up TODOs: None
-->
# AWS Resilient Observability Platform Constitution

## Core Principles

### I. Infrastructure as Code First

All infrastructure MUST be defined and managed through Pulumi (TypeScript).
Manual AWS console changes are prohibited for any resource that Pulumi
manages. Every infrastructure change MUST go through a `pulumi preview`
before `pulumi up`.

- No ClickOps: if a resource exists in the deployment config, it MUST
  be provisioned exclusively via Pulumi.
- Stack configuration MUST use YAML config files
  (`Pulumi.<stack>.yaml`), not hard-coded values.
- Cross-account access MUST use IAM role assumption defined in stack
  configuration, not long-lived credentials.
- Component reuse is mandatory: shared patterns (VPC, EKS, TGW) MUST
  live in `components/` as reusable Pulumi ComponentResources.

### II. Observability-Driven

Every deployed service MUST emit traces, metrics, and logs via
OpenTelemetry. Observability is not an afterthought — it is a
prerequisite for production readiness.

- All workload clusters MUST run an OTel Collector agent forwarding
  telemetry to the shared-services observability stack.
- Grafana dashboards MUST exist for every critical service before it
  is declared production-ready.
- Alerting rules MUST be defined as code (Pulumi or Helm values),
  not configured manually in the Grafana UI.
- The observability stack (Loki, Tempo, Mimir, Grafana) MUST be
  deployed identically in both primary and secondary regions.

### III. Resilience by Design

The platform MUST maintain the multi-site disaster recovery posture
defined in the architecture. Every component MUST be deployable in
both the primary (us-east-1) and secondary (us-west-2) regions.

- RTO target: < 5 minutes. RPO target: < 1 minute.
- Database replication MUST use RDS Global Database with automatic
  cross-region failover.
- Kafka replication MUST use Strimzi + MirrorMaker2 for
  bidirectional topic mirroring.
- Route 53 health checks MUST be configured for all public-facing
  endpoints with automatic failover routing.
- New components MUST NOT introduce single-region dependencies that
  would break the DR posture.

### IV. Testing Discipline

All Pulumi components MUST have unit tests. Cross-account and
cross-region interactions MUST have integration tests. No deployment
proceeds without a passing `pulumi preview`.

- Unit tests MUST cover component resource creation and configuration
  logic (using `jest` per `jest.config.js`).
- Integration tests MUST validate cross-account provider assumptions
  and stack references (per `jest.integration.config.js`).
- `pulumi preview` MUST succeed with zero errors before any `pulumi up`.
- Deployment automation (`automation/`) MUST enforce the preview gate
  programmatically; manual bypass is prohibited.

### V. Simplicity and YAGNI

Prefer the simplest solution that satisfies the current requirement.
Do not add abstractions, configuration knobs, or components for
hypothetical future needs.

- New Pulumi components MUST solve a concrete, documented requirement
  — not a speculative one.
- Configuration options MUST NOT be added unless at least two stacks
  will use different values.
- Helm chart values MUST use upstream defaults where possible;
  overrides MUST be justified in deployment-config.yaml comments.
- Three lines of duplicated code are preferred over a premature
  abstraction.

## Infrastructure Constraints

- **Cloud Provider**: AWS exclusively.
- **IaC Tool**: Pulumi with TypeScript runtime (Node.js).
- **Regions**: us-east-1 (primary), us-west-2 (secondary).
- **Account Model**: Two accounts — `shared-services` (observability,
  networking) and `workloads` (applications, databases).
- **Networking**: Transit Gateway with IPAM-managed CIDRs
  (10.0.0.0/8 pool, /16 per VPC).
- **Container Orchestration**: Amazon EKS for all workloads.
- **Package Manager**: npm (enforced in Pulumi.yaml).
- **Helm**: All Kubernetes applications deployed via Pulumi Helm
  releases — no raw `kubectl apply`.

## Development Workflow

1. **Branch from master** for all changes.
2. **Run `pulumi preview`** against the target stack before opening
   a pull request.
3. **Code review required** for all IaC changes — no direct pushes
   to master.
4. **Deployment order** follows `deployment-config.yaml` dependency
   graph: shared-services-infra → shared-services-apps →
   workloads-infra → workloads-apps, primary before secondary.
5. **Rollback policy**: `deploymentOptions.rollbackOnFailure` MUST
   remain `true`. Failed deployments auto-rollback; manual state
   surgery requires explicit team approval.
6. **Configuration changes** MUST go through the same PR and preview
   cycle as infrastructure code.

## Governance

- This constitution supersedes ad-hoc practices. When a PR conflicts
  with a principle above, the principle wins unless the constitution
  is amended first.
- **Amendment procedure**: propose changes via PR to this file;
  amendments require review and approval before merge. Every
  amendment MUST include a version bump and updated Sync Impact
  Report (HTML comment at top of this file).
- **Versioning policy**: MAJOR for principle removals or redefinitions,
  MINOR for new principles or materially expanded guidance, PATCH for
  wording clarifications.
- **Compliance review**: every feature spec and implementation plan
  MUST include a "Constitution Check" section verifying alignment
  with all five principles.

**Version**: 1.0.0 | **Ratified**: 2026-02-07 | **Last Amended**: 2026-02-07
