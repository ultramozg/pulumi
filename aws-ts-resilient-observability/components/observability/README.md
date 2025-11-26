# Observability Stack Components

Modern, cloud-native observability stack for Kubernetes (EKS) using the Grafana LGTM stack and OpenTelemetry.

## Overview

This directory contains Pulumi components for deploying a complete observability stack consisting of:

- **Loki** - Log aggregation and querying
- **Tempo** - Distributed tracing
- **Mimir** - Metrics storage (replaces Cortex)
- **Grafana** - Unified visualization and dashboarding
- **OpenTelemetry Collector** - Telemetry collection and processing

All components are designed to work together with:
- Automatic S3 backend storage with lifecycle policies
- IRSA (IAM Roles for Service Accounts) integration
- Automatic service discovery and configuration
- Multi-cloud extensibility (S3, GCS, Azure Blob - planned)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Applications                             │
│                  (instrumented with OpenTelemetry)              │
└────────────────┬──────────────┬─────────────┬───────────────────┘
                 │              │             │
                 │ OTLP         │ OTLP        │ OTLP
                 │ (traces)     │ (metrics)   │ (logs)
                 ▼              ▼             ▼
        ┌────────────────────────────────────────────┐
        │    OpenTelemetry Collector (DaemonSet)     │
        │  - Receives OTLP (gRPC/HTTP)               │
        │  - Enriches with K8s metadata              │
        │  - Batches and processes                    │
        └─────┬──────────────┬─────────────┬─────────┘
              │              │             │
              │              │             │
              ▼              ▼             ▼
        ┌─────────┐    ┌──────────┐  ┌─────────┐
        │  Tempo  │    │  Mimir   │  │  Loki   │
        │ (Traces)│    │(Metrics) │  │ (Logs)  │
        └────┬────┘    └────┬─────┘  └────┬────┘
             │              │             │
             │ S3           │ S3          │ S3
             ▼              ▼             ▼
        ┌────────────────────────────────────┐
        │         S3 Buckets                 │
        │  (Long-term storage with           │
        │   lifecycle policies)              │
        └────────────────────────────────────┘
                        │
                        │ Query
                        ▼
                ┌──────────────┐
                │   Grafana    │
                │ (Dashboard)  │
                │ - Tempo DS   │
                │ - Mimir DS   │
                │ - Loki DS    │
                └──────────────┘
```

## Quick Start

### Option 1: Full Stack (Recommended)

Deploy the entire observability stack with a single component:

```typescript
import { ObservabilityStackComponent } from "./components/observability";

const observabilityStack = new ObservabilityStackComponent("observability", {
    region: "us-east-1",
    clusterName: eksCluster.clusterName,
    clusterEndpoint: eksCluster.clusterEndpoint,
    clusterCertificateAuthority: eksCluster.certificateAuthority.data,
    oidcProviderArn: oidcProvider.arn,
    oidcProviderUrl: oidcProvider.url,
    stack: {
        loki: { enabled: true },
        tempo: { enabled: true },
        mimir: { enabled: true },
        grafana: { enabled: true },
        otelCollector: { enabled: true }
    },
    commonS3LifecycleRules: {
        enabled: true,
        transitionToIA: 30,
        transitionToGlacier: 90,
        expiration: 365
    },
    tags: {
        Environment: "production",
        Team: "platform"
    }
});

// Export important endpoints
export const grafanaEndpoint = observabilityStack.grafana?.endpoint;
export const grafanaPassword = observabilityStack.grafana?.adminPassword;
export const otelEndpoint = observabilityStack.otelCollector?.otlpGrpcEndpoint;
```

### Option 2: Individual Components

Deploy components individually for more control:

```typescript
import {
    LokiComponent,
    TempoComponent,
    MimirComponent,
    GrafanaComponent,
    OTelCollectorComponent
} from "./components/observability";

// Deploy Loki
const loki = new LokiComponent("loki", {
    region: "us-east-1",
    clusterName: eksCluster.clusterName,
    clusterEndpoint: eksCluster.clusterEndpoint,
    clusterCertificateAuthority: eksCluster.certificateAuthority.data,
    oidcProviderArn: oidcProvider.arn,
    oidcProviderUrl: oidcProvider.url,
    storage: {
        type: "s3",
        s3: {
            versioning: true,
            encryption: { enabled: true },
            lifecycleRules: {
                enabled: true,
                transitionToIA: 30,
                expiration: 365
            }
        }
    },
    helm: {
        namespace: "loki",
        replicas: 3,
        gateway: { enabled: true, replicas: 2 }
    }
});

// Deploy Tempo
const tempo = new TempoComponent("tempo", {
    region: "us-east-1",
    clusterName: eksCluster.clusterName,
    clusterEndpoint: eksCluster.clusterEndpoint,
    clusterCertificateAuthority: eksCluster.certificateAuthority.data,
    oidcProviderArn: oidcProvider.arn,
    oidcProviderUrl: oidcProvider.url,
    storage: {
        type: "s3",
        s3: {
            encryption: { enabled: true },
            lifecycleRules: {
                enabled: true,
                transitionToIA: 7,
                expiration: 90
            }
        }
    },
    helm: {
        namespace: "tempo",
        retentionPeriod: "720h",
        search: { enabled: true },
        metricsGenerator: {
            enabled: true,
            remoteWriteUrl: "http://mimir-distributor.mimir.svc.cluster.local:8080/api/v1/push"
        }
    },
    distributed: true
});

// Deploy Mimir
const mimir = new MimirComponent("mimir", {
    region: "us-east-1",
    clusterName: eksCluster.clusterName,
    clusterEndpoint: eksCluster.clusterEndpoint,
    clusterCertificateAuthority: eksCluster.certificateAuthority.data,
    oidcProviderArn: oidcProvider.arn,
    oidcProviderUrl: oidcProvider.url,
    storage: {
        type: "s3",
        s3: {
            encryption: { enabled: true },
            lifecycleRules: {
                enabled: true,
                transitionToIA: 30,
                expiration: 365
            }
        }
    },
    helm: {
        namespace: "mimir",
        retentionPeriod: "90d",
        replicas: {
            distributor: 3,
            ingester: 3,
            querier: 2
        },
        ruler: { enabled: true },
        alertmanager: { enabled: true }
    }
});

// Deploy Grafana with auto-configured datasources
const grafana = new GrafanaComponent("grafana", {
    region: "us-east-1",
    clusterName: eksCluster.clusterName,
    clusterEndpoint: eksCluster.clusterEndpoint,
    clusterCertificateAuthority: eksCluster.certificateAuthority.data,
    datasources: [
        {
            name: "Prometheus",
            type: "prometheus",
            url: mimir.getQueryEndpoint(),
            isDefault: true
        },
        {
            name: "Loki",
            type: "loki",
            url: loki.getQueryEndpoint()
        },
        {
            name: "Tempo",
            type: "tempo",
            url: tempo.getTempoQueryEndpoint()
        }
    ],
    helm: {
        namespace: "grafana",
        replicas: 2,
        persistence: { enabled: true, size: "10Gi" }
    }
});

// Deploy OpenTelemetry Collector
const otelCollector = new OTelCollectorComponent("otel-collector", {
    region: "us-east-1",
    clusterName: eksCluster.clusterName,
    clusterEndpoint: eksCluster.clusterEndpoint,
    clusterCertificateAuthority: eksCluster.certificateAuthority.data,
    mode: "daemonset",
    tempoEndpoint: tempo.getDistributorEndpoint(),
    mimirEndpoint: mimir.getDistributorEndpoint(),
    lokiEndpoint: loki.getQueryEndpoint(),
    helm: {
        namespace: "opentelemetry",
        resources: {
            requests: { cpu: "200m", memory: "256Mi" },
            limits: { cpu: "1", memory: "2Gi" }
        }
    }
});
```

## Component Details

### Loki - Log Aggregation

**Purpose**: Centralized log storage and querying, like Prometheus but for logs.

**Features**:
- S3 backend storage with automatic bucket creation
- IRSA for secure S3 access
- Gateway for query load balancing
- Distributed or monolithic mode
- LogQL query language

**Key Configuration**:
```typescript
storage: {
    type: "s3",
    s3: {
        bucketName: "custom-loki-bucket", // Optional
        versioning: true,
        encryption: { enabled: true, kmsKeyId: "..." },
        lifecycleRules: {
            enabled: true,
            transitionToIA: 30,  // Days
            expiration: 365       // Days
        }
    }
},
helm: {
    namespace: "loki",
    replicas: 3,
    gateway: { enabled: true, replicas: 2 }
}
```

### Tempo - Distributed Tracing

**Purpose**: Distributed tracing backend with S3 storage, optimized for cost.

**Features**:
- S3 backend storage
- IRSA integration
- TraceQL search language
- Metrics generator (RED metrics from traces)
- Automatic trace-to-log correlation

**Key Configuration**:
```typescript
storage: {
    type: "s3",
    s3: {
        encryption: { enabled: true },
        lifecycleRules: {
            enabled: true,
            transitionToIA: 7,    // Traces age faster
            expiration: 90         // Days
        }
    }
},
helm: {
    namespace: "tempo",
    retentionPeriod: "720h", // 30 days
    search: { enabled: true },
    metricsGenerator: {
        enabled: true,
        remoteWriteUrl: "http://mimir:8080/api/v1/push"
    }
},
distributed: true
```

### Mimir - Metrics Storage

**Purpose**: Horizontally scalable Prometheus-compatible metrics storage (Cortex successor).

**Features**:
- S3 backend storage
- IRSA integration
- Prometheus remote write compatible
- Built-in ruler for recording rules
- Alertmanager integration
- Multi-tenancy support

**Key Configuration**:
```typescript
storage: {
    type: "s3",
    s3: {
        encryption: { enabled: true },
        lifecycleRules: {
            enabled: true,
            transitionToIA: 30,
            expiration: 365
        }
    }
},
helm: {
    namespace: "mimir",
    retentionPeriod: "90d",
    replicas: {
        distributor: 3,
        ingester: 3,
        querier: 2,
        storeGateway: 3
    },
    ruler: { enabled: true },
    alertmanager: { enabled: true }
},
multiTenancy: false
```

### Grafana - Visualization

**Purpose**: Unified dashboard and visualization layer for all telemetry data.

**Features**:
- Auto-configured datasources
- Trace-to-log correlation
- Trace-to-metrics correlation
- Plugin support
- Persistent storage for dashboards
- Ingress support

**Key Configuration**:
```typescript
datasources: [
    {
        name: "Prometheus",
        type: "prometheus",
        url: "http://mimir-query-frontend.mimir.svc:8080",
        isDefault: true
    },
    {
        name: "Loki",
        type: "loki",
        url: "http://loki-gateway.loki.svc"
    },
    {
        name: "Tempo",
        type: "tempo",
        url: "http://tempo-query-frontend.tempo.svc:3100"
    }
],
helm: {
    namespace: "grafana",
    replicas: 2,
    persistence: { enabled: true, size: "10Gi" },
    ingress: {
        enabled: true,
        host: "grafana.example.com",
        tls: { enabled: true }
    },
    plugins: ["grafana-piechart-panel"]
}
```

### OpenTelemetry Collector - Telemetry Collection

**Purpose**: Unified telemetry collection agent for traces, metrics, and logs.

**Features**:
- OTLP gRPC and HTTP receivers
- Kubernetes metadata enrichment
- Batch processing
- Memory limiting
- Resource detection
- Automatic export to Tempo, Mimir, Loki

**Key Configuration**:
```typescript
mode: "daemonset", // or "deployment"
tempoEndpoint: "http://tempo-distributor.tempo.svc:4317",
mimirEndpoint: "http://mimir-distributor.mimir.svc:8080",
lokiEndpoint: "http://loki-gateway.loki.svc",
helm: {
    namespace: "opentelemetry",
    resources: {
        requests: { cpu: "200m", memory: "256Mi" },
        limits: { cpu: "1", memory: "2Gi" }
    }
}
```

## Application Instrumentation

### TypeScript/Node.js

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://opentelemetry-collector.opentelemetry.svc:4317',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://opentelemetry-collector.opentelemetry.svc:4317',
    }),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'my-service',
});

sdk.start();
```

### Python

```python
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

# Setup tracing
trace.set_tracer_provider(TracerProvider())
trace.get_tracer_provider().add_span_processor(
    BatchSpanProcessor(
        OTLPSpanExporter(endpoint="http://opentelemetry-collector.opentelemetry.svc:4317")
    )
)

# Setup metrics
metrics.set_meter_provider(
    MeterProvider(
        metric_readers=[
            PeriodicExportingMetricReader(
                OTLPMetricExporter(endpoint="http://opentelemetry-collector.opentelemetry.svc:4317")
            )
        ]
    )
)
```

### Go

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/sdk/trace"
)

func initTracer() {
    exporter, _ := otlptracegrpc.New(
        context.Background(),
        otlptracegrpc.WithEndpoint("opentelemetry-collector.opentelemetry.svc:4317"),
        otlptracegrpc.WithInsecure(),
    )

    tp := trace.NewTracerProvider(
        trace.WithBatcher(exporter),
    )
    otel.SetTracerProvider(tp)
}
```

## Cost Optimization

### S3 Lifecycle Policies

All components support S3 lifecycle policies for cost optimization:

```typescript
commonS3LifecycleRules: {
    enabled: true,
    transitionToIA: 30,        // Transition to Infrequent Access after 30 days
    transitionToGlacier: 90,   // Transition to Glacier after 90 days
    expiration: 365            // Delete after 1 year
}
```

### Recommended Retention Periods

| Component | Data Type | Retention | Lifecycle Policy |
|-----------|-----------|-----------|------------------|
| **Loki** | Logs | 30-90 days | IA: 30d, Expire: 90d |
| **Tempo** | Traces | 7-30 days | IA: 7d, Expire: 30d |
| **Mimir** | Metrics | 90-365 days | IA: 30d, Expire: 365d |

## Security

### IRSA (IAM Roles for Service Accounts)

All components support IRSA for secure AWS API access:

```typescript
oidcProviderArn: eksCluster.oidcProvider.arn,
oidcProviderUrl: eksCluster.oidcProvider.url
```

This creates IAM roles with least-privilege access to S3 buckets.

### Encryption

All S3 buckets are encrypted by default:

```typescript
encryption: {
    enabled: true,
    kmsKeyId: "arn:aws:kms:..." // Optional: Use custom KMS key
}
```

## Testing

Run tests for all components:

```bash
npm test
```

Run tests for a specific component:

```bash
npm test -- loki.test.ts
npm test -- tempo.test.ts
npm test -- mimir.test.ts
npm test -- grafana.test.ts
npm test -- otel-collector.test.ts
```

## Multi-Cloud Support

The components are designed with multi-cloud extensibility:

```typescript
storage: {
    type: "s3" | "gcs" | "azure",  // Currently only S3 is implemented
    s3?: { /* S3 config */ },
    gcs?: { /* GCS config (future) */ },
    azure?: { /* Azure config (future) */ }
}
```

## Why This Stack?

### Why Mimir instead of Cortex?

**Mimir is the official successor to Cortex**:
- Better performance and efficiency
- Easier to operate
- Active development by Grafana Labs
- Cortex development has moved to Mimir

### Why Tempo?

**Best tracing solution for cloud-native**:
- Cost-effective S3 backend (vs Jaeger's Cassandra/Elasticsearch)
- Native OpenTelemetry support
- TraceQL for powerful trace search
- Metrics generation from spans

### Why OpenTelemetry?

**Industry standard for observability**:
- CNCF graduated project
- Vendor-neutral
- Single SDK for all telemetry types
- Wide language support
- Future-proof

## Troubleshooting

### Check component health

```bash
# Loki
kubectl get pods -n loki
kubectl logs -n loki -l app=loki

# Tempo
kubectl get pods -n tempo
kubectl logs -n tempo -l app.kubernetes.io/name=tempo

# Mimir
kubectl get pods -n mimir
kubectl logs -n mimir -l app.kubernetes.io/name=mimir

# Grafana
kubectl get pods -n grafana
kubectl logs -n grafana -l app.kubernetes.io/name=grafana

# OpenTelemetry Collector
kubectl get pods -n opentelemetry
kubectl logs -n opentelemetry -l app.kubernetes.io/name=opentelemetry-collector
```

### Verify S3 access (IRSA)

```bash
# Check service account annotations
kubectl get sa -n loki loki -o yaml
kubectl get sa -n tempo tempo -o yaml
kubectl get sa -n mimir mimir -o yaml

# Verify IAM role assumption
kubectl exec -n loki -it <loki-pod> -- env | grep AWS
```

### Test OTLP ingestion

```bash
# Port-forward OTel Collector
kubectl port-forward -n opentelemetry svc/opentelemetry-collector 4317:4317

# Send test span
grpcurl -plaintext -d '{...}' localhost:4317 opentelemetry.proto.collector.trace.v1.TraceService/Export
```

## References

- [Grafana Loki Documentation](https://grafana.com/docs/loki/)
- [Grafana Tempo Documentation](https://grafana.com/docs/tempo/)
- [Grafana Mimir Documentation](https://grafana.com/docs/mimir/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Pulumi Kubernetes Provider](https://www.pulumi.com/docs/reference/pkg/kubernetes/)

## License

See the main project LICENSE file.
