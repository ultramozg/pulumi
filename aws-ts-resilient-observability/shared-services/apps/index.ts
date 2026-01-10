import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { CloudflareWarpComponent } from "../../components/cloudflare/warp";
import { ObservabilityStackComponent } from "../../components/observability";

// Get configuration from deployment config (set by automation)
const config = new pulumi.Config("shared-services");
const awsConfig = new pulumi.Config("aws");

const currentRegion = awsConfig.require("region");
const isPrimary = config.get("isprimary") === "true";

// ============================================================================
// STACK REFERENCE TO INFRASTRUCTURE
// ============================================================================

// Reference the infrastructure stack to get EKS cluster details
const org = pulumi.getOrganization();
const project = pulumi.getProject();
const infraStackName = isPrimary ? "shared-services-infra-primary" : "shared-services-infra-secondary";

const infraStack = new pulumi.StackReference(`infra-stack-ref`, {
    name: `${org}/${project}/${infraStackName}`
});

// Import EKS cluster details from infrastructure stack
const eksClusterName = infraStack.requireOutput("eksClusterId") as pulumi.Output<string>;
const eksClusterEndpoint = infraStack.requireOutput("eksClusterEndpoint") as pulumi.Output<string>;
const eksClusterCertificateAuthority = infraStack.requireOutput("eksClusterCertificateAuthority") as pulumi.Output<string>;
const eksOidcProviderArn = infraStack.getOutput("eksOidcProviderArn") as pulumi.Output<string>;
const eksOidcProviderUrl = infraStack.getOutput("eksOidcProviderUrl") as pulumi.Output<string>;
const eksKubeconfig = infraStack.requireOutput("eksKubeconfig") as pulumi.Output<string>;

// Get shared services role ARN from environment
const sharedServicesRoleArn = process.env.SHARED_SERVICES_ROLE_ARN;

console.log(`${currentRegion}: Deploying applications to EKS cluster from infrastructure stack`);

// ============================================================================
// CLOUDFLARE TUNNEL CONFIGURATION
// ============================================================================

// Cloudflare Tunnel configuration (optional)
// Deploys cloudflared into the EKS cluster to provide secure access to private services via WARP client
//
// SETUP:
// 1. Create tunnel in Cloudflare Dashboard (Zero Trust → Networks → Tunnels)
// 2. Configure Private Network routes in dashboard
// 3. Get tunnel token from dashboard
// 4. Store token in Pulumi ESC
// 5. Deploy this component with the token
//
// MULTI-REGION SUPPORT:
// - Both regions deploy cloudflared pods using the SAME tunnel token
// - Cloudflare automatically load balances between all active connections
// - Provides automatic failover if one region goes down
const enableCloudflareTunnel = config.getBoolean("enableCloudflareTunnel") ?? false;
let cloudflareTunnel: CloudflareWarpComponent | undefined;

if (enableCloudflareTunnel) {
    // Get tunnel token from Pulumi ESC (same token for both regions)
    const tunnelToken = config.requireSecret("cloudflareTunnelToken");

    // Create Kubernetes provider for EKS cluster
    // Note: The kubeconfig already includes the roleArn from sharedEksCluster
    const k8sProvider = new k8s.Provider(`${currentRegion}-k8s-provider`, {
        kubeconfig: eksKubeconfig,
    }, {
        // Add transformation to fix invalid Kubernetes labels
        transformations: [(args) => {
            if (args.props.metadata?.labels) {
                const labels = args.props.metadata.labels;
                // Sanitize label values: replace colons with hyphens
                for (const key in labels) {
                    if (typeof labels[key] === 'string' && labels[key].includes(':')) {
                        labels[key] = labels[key].replace(/:/g, '-');
                    }
                }
            }
            return {
                props: args.props,
                opts: args.opts
            };
        }]
    });

    // Deploy cloudflared in this region
    cloudflareTunnel = new CloudflareWarpComponent(`${currentRegion}-tunnel`, {
        tunnelToken: tunnelToken,
        kubernetesProvider: k8sProvider,
        namespace: "cloudflare-tunnel",
        replicas: config.getNumber("cloudflareTunnelReplicas") ?? 2,
        cloudflaredImage: config.get("cloudflaredImage") ?? "cloudflare/cloudflared:latest",
        tags: {
            Region: currentRegion,
            Purpose: "secure-tunnel-access"
        }
    });

    console.log(`${currentRegion}: Cloudflared deployed with ${config.getNumber("cloudflareTunnelReplicas") ?? 2} replicas`);
    console.log(`${currentRegion}: Configure Private Network routes in Cloudflare Dashboard`);
} else {
    console.log(`${currentRegion}: Cloudflare Tunnel disabled`);
}

// ============================================================================
// OBSERVABILITY STACK CONFIGURATION
// ============================================================================

// Observability stack configuration (optional)
// Deploys Loki, Tempo, Mimir, Grafana, and OpenTelemetry Collector into the EKS cluster
//
// This provides a complete observability solution:
// - Loki: Log aggregation and querying
// - Tempo: Distributed tracing
// - Mimir: Metrics storage (Prometheus-compatible)
// - Grafana: Unified visualization dashboard
// - OTel Collector: Telemetry collection and forwarding
const enableObservability = config.getBoolean("enableObservability") ?? false;
let observabilityStack: ObservabilityStackComponent | undefined;

if (enableObservability) {
    // Get observability component configurations from config
    const lokiConfig = config.getObject("loki") as { enabled: boolean } | undefined;
    const tempoConfig = config.getObject("tempo") as { enabled: boolean } | undefined;
    const mimirConfig = config.getObject("mimir") as { enabled: boolean } | undefined;
    const grafanaConfig = config.getObject("grafana") as { enabled: boolean } | undefined;
    const otelCollectorConfig = config.getObject("otelCollector") as { enabled: boolean } | undefined;

    // Deploy observability stack
    // Note: ObservabilityStackComponent will create its own Kubernetes provider internally
    observabilityStack = new ObservabilityStackComponent(`${currentRegion}-observability`, {
        region: currentRegion,
        clusterName: eksClusterName,
        clusterEndpoint: eksClusterEndpoint,
        clusterCertificateAuthority: eksClusterCertificateAuthority,
        oidcProviderArn: eksOidcProviderArn,
        oidcProviderUrl: eksOidcProviderUrl,
        // Note: roleArn is NOT passed since we're already using an AWS Provider
        // that has assumed the role. The kubectl will use the same credentials from environment variables.
        stack: {
            loki: lokiConfig || { enabled: true },
            tempo: tempoConfig || { enabled: true },
            mimir: mimirConfig || { enabled: true },
            grafana: grafanaConfig || { enabled: true },
            otelCollector: otelCollectorConfig || { enabled: true }
        },
        commonS3LifecycleRules: {
            enabled: true,
            transitionToIA: 30,
            transitionToGlacier: 90,
            expiration: 365
        },
        tags: {
            Region: currentRegion,
            Purpose: "observability",
            IsPrimary: isPrimary.toString()
        }
    });

    console.log(`${currentRegion}: Observability stack deployment initiated`);
    if (lokiConfig?.enabled) console.log(`${currentRegion}: - Loki enabled (logs)`);
    if (tempoConfig?.enabled) console.log(`${currentRegion}: - Tempo enabled (traces)`);
    if (mimirConfig?.enabled) console.log(`${currentRegion}: - Mimir enabled (metrics)`);
    if (grafanaConfig?.enabled) console.log(`${currentRegion}: - Grafana enabled (visualization)`);
    if (otelCollectorConfig?.enabled) console.log(`${currentRegion}: - OTel Collector enabled (telemetry)`);
} else {
    console.log(`${currentRegion}: Observability stack disabled`);
}

// Export important values
export const region = currentRegion;
export const isPrimaryRegion = isPrimary;

// Export Cloudflare Tunnel resources
export const cloudflareTunnelEnabled = enableCloudflareTunnel;
export const cloudflareTunnelDeploymentName = cloudflareTunnel?.getDeploymentName();
export const cloudflareTunnelNamespace = cloudflareTunnel?.getNamespace();

// Export Observability Stack resources
export const observabilityEnabled = enableObservability;
export const observabilityLokiEndpoint = observabilityStack?.loki?.endpoint;
export const observabilityTempoQueryEndpoint = observabilityStack?.tempo?.queryEndpoint;
export const observabilityTempoDistributorEndpoint = observabilityStack?.tempo?.distributorEndpoint;
export const observabilityMimirQueryEndpoint = observabilityStack?.mimir?.queryEndpoint;
export const observabilityMimirDistributorEndpoint = observabilityStack?.mimir?.distributorEndpoint;
export const observabilityGrafanaEndpoint = observabilityStack?.grafana?.endpoint;
export const observabilityGrafanaPassword = observabilityStack?.grafana?.adminPassword;
export const observabilityOTelGrpcEndpoint = observabilityStack?.otelCollector?.otlpGrpcEndpoint;
export const observabilityOTelHttpEndpoint = observabilityStack?.otelCollector?.otlpHttpEndpoint;

// Export service endpoints for geoproximity routing (examples for documentation)
// These reference the infrastructure stack's domain configuration
const baseDomain = infraStack.getOutput("sharedHostedZoneName") as pulumi.Output<string>;
export const lokiEndpoint = baseDomain.apply(domain => `loki.${domain}`);
export const tempoQueryEndpoint = baseDomain.apply(domain => `tempo-query.${domain}`);
export const tempoDistributorEndpoint = baseDomain.apply(domain => `tempo-distributor.${domain}`);
export const grafanaEndpoint = baseDomain.apply(domain => `grafana.${domain}`);
