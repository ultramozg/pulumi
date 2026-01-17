# ArgoCD Component

This component provides a complete ArgoCD installation on Amazon EKS with multi-cluster management capabilities.

## Features

- **IAM Authentication**: Uses IAM Roles for Service Accounts (IRSA) instead of AWS Identity Center
- **High Availability**: Supports HA mode with multiple replicas
- **Multi-Cluster Management**: Register and manage multiple EKS clusters from a single ArgoCD instance
- **ALB Ingress**: Automatic ALB ingress configuration with HTTPS support
- **GitOps Ready**: Pre-configured for Git repository integration
- **Secure by Default**: Encrypted secrets, RBAC policies, and secure networking

## Architecture

### Single Cluster Setup

```
┌────────────────────────────────────┐
│  EKS Cluster (us-east-1)           │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  ArgoCD Server               │ │
│  │  - UI/API (via ALB)          │ │
│  │  - Application Controller    │ │
│  │  - Repo Server               │ │
│  │  - ApplicationSet Controller │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  IAM Role (IRSA)             │ │
│  │  - ECR Access                │ │
│  │  - Secrets Manager           │ │
│  └──────────────────────────────┘ │
└────────────────────────────────────┘
```

### Multi-Cluster Setup

```
┌─────────────────────────────────────────┐
│  Master EKS Cluster (us-east-1)         │
│  ┌─────────────────────────────┐        │
│  │   ArgoCD Server             │        │
│  │   - Manages all clusters    │        │
│  └─────────────────────────────┘        │
└─────────────────────────────────────────┘
           │
           │ Manages Applications
           │
    ┌──────┴──────┬──────────────┐
    │             │              │
    ▼             ▼              ▼
┌────────┐  ┌────────────┐ ┌──────────┐
│Cluster │  │  Cluster   │ │ Cluster  │
│  1     │  │    2       │ │    3     │
│(Self)  │  │(us-west-2) │ │(eu-west-1)│
└────────┘  └────────────┘ └──────────┘
```

## Components

### 1. ArgoCDComponent

Main component that installs ArgoCD on an EKS cluster.

**Key Features:**
- Helm-based installation
- IAM role creation with IRSA
- Automatic password generation
- ALB ingress configuration
- Metrics and monitoring

### 2. ArgoCDClusterRegistrationComponent

Registers external EKS clusters with the master ArgoCD installation.

**Key Features:**
- Service account creation in target cluster
- RBAC configuration
- Cluster credential management
- Support for IAM role authentication

## Usage Examples

### Example 1: Basic ArgoCD Installation

```typescript
import { ArgoCDComponent } from "./components/argocd";

const argocd = new ArgoCDComponent("my-argocd", {
    clusterName: eksClusterName,
    clusterEndpoint: eksClusterEndpoint,
    clusterCertificateAuthority: eksClusterCA,
    oidcProviderArn: eksOidcProviderArn,
    oidcProviderUrl: eksOidcProviderUrl,

    helm: {
        namespace: "argocd",
        chartVersion: "5.51.0"
    },

    tags: {
        Environment: "production"
    }
});

// Export the endpoint and admin password
export const argoCDEndpoint = argocd.getEndpoint();
export const argoCDPassword = argocd.getAdminPassword();
```

### Example 2: High Availability Setup with Ingress

```typescript
import { ArgoCDComponent } from "./components/argocd";

const argocd = new ArgoCDComponent("production-argocd", {
    clusterName: eksClusterName,
    clusterEndpoint: eksClusterEndpoint,
    clusterCertificateAuthority: eksClusterCA,
    oidcProviderArn: eksOidcProviderArn,
    oidcProviderUrl: eksOidcProviderUrl,

    helm: {
        namespace: "argocd",
        chartVersion: "5.51.0",
        ha: {
            enabled: true,
            replicaCount: 3
        },
        server: {
            replicas: 3,
            resources: {
                requests: {
                    cpu: "200m",
                    memory: "256Mi"
                },
                limits: {
                    cpu: "1",
                    memory: "1Gi"
                }
            }
        }
    },

    ingress: {
        enabled: true,
        host: "argocd.example.com",
        certificateArn: certArn,
        ingressClassName: "alb"
    },

    iam: {
        enabled: true,
        adminIAMPrincipals: [
            "arn:aws:iam::123456789012:role/DevOpsAdmin",
            "arn:aws:iam::123456789012:user/john.doe"
        ],
        additionalPolicyArns: [
            "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
        ]
    },

    rbac: {
        defaultPolicy: "role:readonly",
        policies: [
            "p, role:org-admin, applications, *, */*, allow",
            "p, role:dev-team, applications, get, */*, allow",
            "g, developers, role:dev-team"
        ]
    },

    tags: {
        Environment: "production",
        ManagedBy: "Pulumi"
    }
});
```

### Example 3: Multi-Cluster Setup

**Primary Cluster (us-east-1) - Install ArgoCD:**

```typescript
// In shared-services/apps/index.ts (primary region)
import { ArgoCDComponent } from "../../components/argocd";

const isPrimary = config.get("isprimary") === "true";

if (isPrimary) {
    const argocd = new ArgoCDComponent(`${currentRegion}-argocd`, {
        clusterName: eksClusterName,
        clusterEndpoint: eksClusterEndpoint,
        clusterCertificateAuthority: eksClusterCertificateAuthority,
        oidcProviderArn: eksOidcProviderArn,
        oidcProviderUrl: eksOidcProviderUrl,

        helm: {
            namespace: "argocd",
            ha: {
                enabled: true,
                replicaCount: 3
            }
        },

        ingress: {
            enabled: true,
            host: baseDomain.apply(d => `argocd.${d}`),
            certificateArn: config.get("certificateArn")
        },

        iam: {
            enabled: true
        },

        tags: {
            Region: currentRegion,
            Purpose: "gitops-controller"
        }
    });

    // Export ArgoCD details
    export const argoCDEndpoint = argocd.getEndpoint();
    export const argoCDPassword = argocd.getAdminPassword();
    export const argoCDNamespace = argocd.getNamespace();
}
```

**Secondary Cluster (us-west-2) - Register with Master ArgoCD:**

```typescript
// In shared-services/apps/index.ts (secondary region)
import { ArgoCDClusterRegistrationComponent } from "../../components/argocd/cluster-registration";

const isPrimary = config.get("isprimary") === "true";

if (!isPrimary) {
    // Reference primary cluster stack
    const primaryInfraStack = new pulumi.StackReference(`infra-stack-ref`, {
        name: `${org}/shared-services-infra/primary`
    });

    const primaryAppsStack = new pulumi.StackReference(`apps-stack-ref`, {
        name: `${org}/shared-services-apps/primary`
    });

    // Get primary cluster kubeconfig from stack reference
    const primaryKubeconfig = primaryInfraStack.requireOutput("eksKubeconfig");

    // Register this cluster with master ArgoCD
    const clusterRegistration = new ArgoCDClusterRegistrationComponent(
        `${currentRegion}-cluster-registration`,
        {
            masterClusterKubeconfig: primaryKubeconfig,
            argoCDNamespace: "argocd",

            targetCluster: {
                name: pulumi.interpolate`${currentRegion}-cluster`,
                endpoint: eksClusterEndpoint,
                certificateAuthority: eksClusterCertificateAuthority,
                roleArn: sharedServicesRoleArn,
                region: currentRegion
            },

            clusterLabels: {
                region: currentRegion,
                environment: pulumi.getStack(),
                purpose: "shared-services"
            },

            projectName: "default",
            clusterAdmin: true,

            tags: {
                Region: currentRegion,
                Purpose: "argocd-managed-cluster"
            }
        }
    );

    export const clusterRegistrationName = clusterRegistration.getClusterName();
}
```

### Example 4: Using IAM Role Authentication

```typescript
// For clusters using IAM role authentication (recommended for AWS)
const clusterRegistration = new ArgoCDClusterRegistrationComponent(
    "my-cluster",
    {
        masterCluster: {
            clusterName: primaryClusterName,
            clusterEndpoint: primaryClusterEndpoint,
            clusterCertificateAuthority: primaryClusterCA,
            roleArn: sharedServicesRoleArn
        },
        argoCDNamespace: "argocd",

        targetCluster: {
            name: "us-west-2-production",
            endpoint: targetClusterEndpoint,
            certificateAuthority: targetClusterCA,
            roleArn: targetClusterRoleArn, // IAM role for accessing cluster
            region: "us-west-2"
        },

        clusterLabels: {
            environment: "production",
            region: "us-west-2",
            tier: "backend"
        },

        // Don't create service account when using IAM roles
        createServiceAccount: false
    }
);
```

## Configuration Reference

### ArgoCDComponent Arguments

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `clusterName` | `string` | Yes | - | EKS cluster name |
| `clusterEndpoint` | `string` | Yes | - | EKS cluster endpoint |
| `clusterCertificateAuthority` | `string` | Yes | - | EKS cluster CA certificate |
| `oidcProviderArn` | `string` | No | - | OIDC provider ARN for IRSA |
| `oidcProviderUrl` | `string` | No | - | OIDC provider URL |
| `helm.namespace` | `string` | No | `"argocd"` | Kubernetes namespace |
| `helm.chartVersion` | `string` | No | `"5.51.0"` | Helm chart version |
| `helm.ha.enabled` | `boolean` | No | `false` | Enable HA mode |
| `ingress.enabled` | `boolean` | No | `false` | Enable ingress |
| `ingress.host` | `string` | No | - | Ingress hostname |
| `iam.enabled` | `boolean` | No | `true` | Enable IAM role |

### ArgoCDClusterRegistrationComponent Arguments

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `masterClusterKubeconfig` | `string` | Yes* | - | Master cluster kubeconfig |
| `masterCluster` | `object` | Yes* | - | Master cluster connection |
| `targetCluster.name` | `string` | Yes | - | Target cluster name |
| `targetCluster.endpoint` | `string` | Yes | - | Target cluster endpoint |
| `targetCluster.certificateAuthority` | `string` | Yes | - | Target cluster CA |
| `argoCDNamespace` | `string` | No | `"argocd"` | ArgoCD namespace |
| `createServiceAccount` | `boolean` | No | `true` | Create service account |
| `clusterAdmin` | `boolean` | No | `true` | Grant cluster admin |

\* Either `masterClusterKubeconfig` or `masterCluster` must be provided

## Authentication Methods

### 1. IAM Role Authentication (Recommended for AWS)

Uses IAM roles to authenticate to target clusters. This is the recommended approach for EKS clusters.

**Benefits:**
- No long-lived credentials
- Automatic token rotation
- Integrates with AWS IAM
- Audit trail via CloudTrail

**Setup:**
```typescript
targetCluster: {
    name: "my-cluster",
    endpoint: clusterEndpoint,
    certificateAuthority: clusterCA,
    roleArn: iamRoleArn  // IAM role to assume
}
```

### 2. Service Account Token Authentication

Uses Kubernetes service account tokens for authentication.

**Benefits:**
- Works with any Kubernetes cluster
- No AWS dependencies
- Standard Kubernetes RBAC

**Setup:**
```typescript
createServiceAccount: true,
serviceAccountName: "argocd-manager",
clusterAdmin: true
```

## Security Considerations

1. **IAM Policies**: Restrict IAM role permissions to minimum required
2. **Network Policies**: Use Kubernetes network policies to restrict ArgoCD traffic
3. **RBAC**: Configure granular RBAC policies for different teams
4. **Secrets**: Use AWS Secrets Manager or External Secrets Operator
5. **Ingress**: Always use HTTPS with valid certificates
6. **Admin Password**: Store in a secure location (AWS Secrets Manager)

## Monitoring and Metrics

ArgoCD exposes Prometheus metrics by default:

```yaml
enableMetrics: true
```

**Key Metrics:**
- `argocd_app_sync_total` - Total number of application syncs
- `argocd_app_health_status` - Application health status
- `argocd_cluster_api_resource_objects` - Number of resources in clusters

## Troubleshooting

### ArgoCD cannot access target cluster

1. **Check IAM role trust policy**: Ensure the OIDC provider is correctly configured
2. **Verify cluster credentials**: Check the cluster secret in ArgoCD namespace
3. **Test connectivity**: Use `kubectl exec` to test from ArgoCD pod

```bash
kubectl exec -n argocd argocd-server-xxx -- argocd cluster list
```

### Applications not syncing

1. **Check repository credentials**: Verify Git repository access
2. **Review RBAC policies**: Ensure ArgoCD has permissions
3. **Check application logs**:

```bash
kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller
```

## References

- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [AWS EKS ArgoCD Guide](https://docs.aws.amazon.com/eks/latest/userguide/create-argocd-capability.html)
- [IRSA Documentation](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
