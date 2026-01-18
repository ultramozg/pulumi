import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { OTelCollectorComponent } from "../../components/observability/opentelemetry-collector";

// Get configuration from deployment config (set by automation)
const config = new pulumi.Config("workloads");
const awsConfig = new pulumi.Config("aws");

const currentRegion = awsConfig.require("region");
const primaryRegion = config.require("primaryRegion");
const isPrimary = config.getBoolean("isPrimary") ?? (currentRegion === primaryRegion);

// ============================================================================
// STACK REFERENCE TO INFRASTRUCTURE
// ============================================================================

// Reference the infrastructure stack to get EKS cluster details
const org = pulumi.getOrganization();
const infraStackName = isPrimary ? "primary" : "secondary";

const infraStack = new pulumi.StackReference(`infra-stack-ref`, {
    name: `${org}/workloads-infra/${infraStackName}`
});

// Import EKS cluster details from infrastructure stack
const eksClusterName = infraStack.requireOutput("workloadEksClusterName") as pulumi.Output<string>;
const eksClusterEndpoint = infraStack.requireOutput("workloadEksClusterEndpoint") as pulumi.Output<string>;
const eksClusterCertificateAuthority = infraStack.requireOutput("workloadEksClusterCertificateAuthority") as pulumi.Output<string>;
const eksKubeconfig = infraStack.requireOutput("workloadEksKubeconfig") as pulumi.Output<string>;

// Get shared services role ARN from environment
const workloadsRoleArn = process.env.WORKLOADS_ROLE_ARN;

console.log(`${currentRegion}: Deploying applications to EKS cluster from infrastructure stack`);

// ============================================================================
// OBSERVABILITY AGENT CONFIGURATION
// ============================================================================

// OpenTelemetry Collector agent configuration (optional)
// Deploys OTel Collector agents in workload cluster to send telemetry to shared-services
//
// This provides telemetry collection from workload applications:
// - Collects metrics, traces, and logs from workload pods
// - Forwards telemetry to shared-services observability stack
// - Enables distributed tracing across workload and shared services
const enableOTelAgent = config.getBoolean("enableOTelAgent") ?? false;
let otelAgent: OTelCollectorComponent | undefined;

if (enableOTelAgent) {
    // Get shared services stack reference for observability endpoints
    const sharedServicesStackRef = new pulumi.StackReference(`shared-services-apps-ref`, {
        name: `${org}/shared-services-apps/${infraStackName}`
    });

    // Get observability endpoints from shared-services stack
    const lokiEndpoint = sharedServicesStackRef.getOutput("observabilityLokiEndpoint");
    const tempoDistributorEndpoint = sharedServicesStackRef.getOutput("observabilityTempoDistributorEndpoint");
    const mimirDistributorEndpoint = sharedServicesStackRef.getOutput("observabilityMimirDistributorEndpoint");

    // Create Kubernetes provider for workload EKS cluster
    // Note: The kubeconfig already includes the roleArn from workloadEksCluster
    const k8sProvider = new k8s.Provider(`${currentRegion}-workload-k8s-provider`, {
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

    // Deploy OTel Collector agent
    otelAgent = new OTelCollectorComponent(`${currentRegion}-workload-otel-agent`, {
        clusterName: eksClusterName,
        clusterEndpoint: eksClusterEndpoint,
        clusterCertificateAuthority: pulumi.output(""), // Placeholder
        mode: "daemonset",
        tempoEndpoint: tempoDistributorEndpoint,
        mimirEndpoint: mimirDistributorEndpoint,
        lokiEndpoint: lokiEndpoint,
        helm: {
            namespace: "opentelemetry",
            resources: {
                requests: {
                    cpu: "100m",
                    memory: "128Mi"
                },
                limits: {
                    cpu: "500m",
                    memory: "512Mi"
                }
            }
        }
    });

    console.log(`${currentRegion}: OTel Collector agent deployed in workload cluster`);
    console.log(`${currentRegion}: Forwarding telemetry to shared-services observability stack`);
} else {
    console.log(`${currentRegion}: OTel Collector agent disabled`);
}

// Export important values
export const region = currentRegion;
export const isPrimaryRegion = isPrimary;

// Export OTel agent resources
export const otelAgentEnabled = enableOTelAgent;
export const otelAgentGrpcEndpoint = otelAgent?.otlpGrpcEndpoint;
export const otelAgentHttpEndpoint = otelAgent?.otlpHttpEndpoint;
