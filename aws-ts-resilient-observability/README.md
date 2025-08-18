# Observability Platform with Multi site approach

This project deploys a production-grade observability stack using Pulumi and AWS EKS with a foundation for disaster recovery (DR multi site approach) across multiple AWS regions. The goal is to create a scalable, resilient, and automation-friendly monitoring system that enables zero-ops observability and serves as the backbone for future multi-region cell-based architecture.
---

## Project Goals

- Deploy a full observability stack (Cortex, Grafana, Loki) in a centralized **shared AWS account**.
- Use **Pulumi (TypeScript)** to manage all infrastructure as code.
- Build a reusable base for **multi-account, multi-region** architecture with **Transit Gateway + IPAM**.
- Implement **Multi-Site approach** strategy using AWS-native tools like Route 53 and Global Databases.
- Learn new IaC tools for such scenario
---

## Architecture Overview

### AWS Accounts

| Account Role        | Purpose                                  |
|---------------------|------------------------------------------|
| `shared`            | Observability platform, central EKS,     |
|                     | VPC IPAM, Transit Gateway, RAM shares    |
| `workload`          | Workloads (by region)                    |

### Core Components

- **EKS Cluster (shared-monitoring)**: Hosts Cortex, Grafana, Loki (via Helm).
- **Transit Gateway (network-core)**: Connects shared services to app cells.
- **IPAM & RAM**: Centralized subnet CIDR management and VPC sharing.
- **ECR**: Shared container registry for monitoring workloads.
- **Pulumi**: Used to deploy and manage all infrastructure and Helm charts.

---

## Observability Stack

Deployed into the shared EKS cluster:

- `Cortex`: Metrics collection from workloads (via service discovery).
- `Grafana`: Prebuilt dashboards, alerts via Slack/Webhooks.
- `Loki + Tempo`: Centralized logging and tracing.
- `Need to chose`: Alert routing for incidents.

All components are provisioned via Pulumi and Helm.

---

## 🌐 Disaster Recovery Strategy

This project implements the **Multi-Site DR** model:

| DR Feature           | Implementation                                                |
|----------------------|---------------------------------------------------------------|
| **Health checks**    | AWS Route 53 HTTP checks on `/healthz` endpoints              |
| **Failover Routing** | Route 53 records with Primary/Secondary endpoints             |
| **Databases**        | RDS Global Database with cross-region replication             |
| **Kafka**            | Strimzi + MirrorMaker2  with replication enabled              |
| **DR Region**        | Minimal app footprint pre-provisioned via Pulumi              |

### RTO/RPO Targets

| Metric     | Target                              |
|------------|-------------------------------------|
| **RTO**    | < 5 minutes                         |
| **RPO**    | < 1 minute (via Global RDS + Kafka) |

---