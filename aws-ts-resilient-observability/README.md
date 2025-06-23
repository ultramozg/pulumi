# Observability Platform with Pilot-Light Disaster Recovery

This project deploys a production-grade observability stack using Pulumi and AWS EKS with a foundation for disaster recovery (DR) across multiple AWS regions. The goal is to create a scalable, resilient, and automation-friendly monitoring system that enables zero-ops observability and serves as the backbone for future multi-region cell-based architecture.

---

## 🚀 Project Goals

- Deploy a full observability stack (Prometheus, Grafana, Loki) in a centralized **shared AWS account**.
- Use **Pulumi (TypeScript)** to manage all infrastructure as code.
- Build a reusable base for **multi-account, multi-region** architecture with **Transit Gateway + IPAM**.
- Implement **Pilot-Light Disaster Recovery** strategy using AWS-native tools like Route 53 and Global Databases.
- Set the stage for future **cell-based architecture**.

---

## 🧱 Architecture Overview

### AWS Accounts

| Account Role        | Purpose                                  |
|---------------------|------------------------------------------|
| `shared`            | Observability platform, central EKS,     |
|                     | VPC IPAM, Transit Gateway, RAM shares    |
| `app-cell-*`        | Future app cells (by region)             |

### Core Components

- **EKS Cluster (shared-monitoring)**: Hosts Prometheus, Grafana, Loki (via Helm).
- **Transit Gateway (network-core)**: Connects shared services to app cells.
- **IPAM & RAM**: Centralized subnet CIDR management and VPC sharing.
- **ECR**: Shared container registry for monitoring workloads.
- **Pulumi**: Used to deploy and manage all infrastructure and Helm charts.

---

## 🔍 Observability Stack

Deployed into the shared EKS cluster:

- `Prometheus`: Metrics collection from workloads (via service discovery).
- `Grafana`: Prebuilt dashboards, alerts via Slack/Webhooks.
- `Loki + Tempo`: Centralized logging and tracing.
- `Alertmanager`: Alert routing for incidents.

All components are provisioned via Pulumi and Helm.

---

## 🌐 Disaster Recovery Strategy

This project implements the **Pilot-Light DR** model:

| DR Feature           | Implementation                                                |
|----------------------|---------------------------------------------------------------|
| **Health checks**    | AWS Route 53 HTTP checks on `/healthz` endpoints              |
| **Failover Routing** | Route 53 records with Primary/Secondary endpoints             |
| **Databases**        | RDS Global Database with cross-region replication             |
| **Kafka**            | Strimzi + MirrorMaker2 or MSK with replication enabled        |
| **DR Region**        | Minimal app footprint pre-provisioned via Pulumi              |

### RTO/RPO Targets

| Metric     | Target                |
|------------|------------------------|
| **RTO**    | < 5 minutes           |
| **RPO**    | < 1 minute (via Global RDS + Kafka) |

Failover is triggered automatically when the primary region becomes unhealthy. Pulumi can be used to scale up the DR region on-demand (e.g. via CLI or automation API).

---

## 🛠 Cell-based Future Expansion

Once the base DR infrastructure is validated, this setup is designed to scale into a **cell-based architecture**, where:

- Each region has its own independent app stack.
- Observability remains centralized or per-cell.
- Cells can be deployed via reusable Pulumi constructs:
  ```ts
  new Cell({
    name: "eu-west-1",
    region: "eu-west-1",
    drStrategy: "pilot-light",
    replicas: 0,
    rdsGlobal: true,
    kafkaReplication: true
  });
