# Product Overview

This is a **multi-region resilient observability platform** built with Pulumi and AWS. The project implements a production-grade monitoring stack (Cortex, Grafana, Loki) with disaster recovery capabilities across multiple AWS regions.

## Key Features

- **Multi-Site DR Strategy**: Primary/secondary region deployment with RTO < 5 minutes, RPO < 1 minute
- **Cross-Account Architecture**: Shared services account for observability infrastructure, workloads account for applications
- **Infrastructure as Code**: Complete Pulumi TypeScript implementation with automation capabilities
- **Scalable Networking**: Transit Gateway + IPAM for centralized network management
- **Production Ready**: Comprehensive error handling, logging, testing, and deployment automation

## Architecture

The platform deploys across two AWS accounts:
- **Shared Services**: Observability platform, EKS clusters, Transit Gateway, IPAM
- **Workloads**: Application workloads, databases, Route 53 failover

Default regions are us-east-1 (primary) and us-west-2 (secondary) with full cross-region replication for databases and Kafka.