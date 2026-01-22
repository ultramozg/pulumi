# Local Development with Skaffold

Continuous development environment for observability stack using Skaffold + Kind.

## Quick Start

```bash
make install  # Install prerequisites
make create   # Create Kind cluster  
make dev      # Start Skaffold
```

Access: http://localhost:3000 (admin/admin123)

## Stack

- **Loki** → Logs (localhost:3100)
- **Tempo** → Traces (localhost:3200)
- **Mimir** → Metrics (localhost:9009)
- **Grafana** → Dashboards (localhost:3000)
- **OTel Collector** → Telemetry (localhost:4317/4318)

## Commands

```bash
make help          # Show all commands
make dev           # Continuous development
make dev-minimal   # Loki + Grafana only
make status        # Component status
make clean         # Delete deployments
make purge         # Delete everything
```

## How It Works

Skaffold watches `helm/*.yaml` files and auto-deploys changes:

```bash
make dev                          # Start watching
vim helm/grafana-values.yaml      # Edit config
# Save → Auto-deploys!
```

## Cluster

3-node Kind cluster (Kubernetes v1.31.0):
- 1 control plane
- 2 workers (observability + apps)

## Requirements

- Docker Desktop
- 6-8 CPUs, 10-12GB RAM
- `make install` for other tools

## Guides

- [SKAFFOLD_QUICKSTART.md](SKAFFOLD_QUICKSTART.md) - 5-minute start
- [SKAFFOLD_GUIDE.md](SKAFFOLD_GUIDE.md) - Complete reference

## Troubleshooting

```bash
make debug         # Show versions
make reset         # Recreate cluster
make verify-docker # Check Docker
```

---

🚀 **Happy developing!**
