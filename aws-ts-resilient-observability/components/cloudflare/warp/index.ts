import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, BaseComponentArgs } from "../../shared/base";

/**
 * Arguments for the Cloudflare Warp component
 */
export interface CloudflareWarpArgs extends BaseComponentArgs {
    /**
     * Cloudflare tunnel token (from Cloudflare dashboard)
     * Get this from: Cloudflare Dashboard → Zero Trust → Networks → Tunnels → Your Tunnel → Configure
     *
     * This token contains everything needed:
     * - Tunnel ID
     * - Credentials
     * - Account ID
     */
    tunnelToken: pulumi.Input<string>;

    /**
     * Kubernetes namespace to deploy cloudflared
     */
    namespace?: string;

    /**
     * Kubernetes provider
     */
    kubernetesProvider: k8s.Provider;

    /**
     * Cloudflared image version
     */
    cloudflaredImage?: string;

    /**
     * Number of cloudflared replicas
     */
    replicas?: number;
}

/**
 * Cloudflare Tunnel Component
 *
 * Deploys cloudflared into a Kubernetes cluster using a tunnel token.
 *
 * Setup:
 * 1. Create tunnel in Cloudflare Dashboard (Zero Trust → Networks → Tunnels)
 * 2. Configure routes in dashboard (Public Hostname or Private Network)
 * 3. Get the tunnel token from dashboard
 * 4. Deploy this component with the token
 *
 * Example usage:
 * ```typescript
 * const tunnel = new CloudflareWarpComponent("my-tunnel", {
 *     tunnelToken: config.requireSecret("cloudflareTunnelToken"),
 *     kubernetesProvider: k8sProvider,
 *     replicas: 2,
 *     tags: {
 *         Environment: "production"
 *     }
 * });
 * ```
 */
export class CloudflareWarpComponent extends BaseAWSComponent {
    public readonly namespace: k8s.core.v1.Namespace;
    public readonly tunnelSecret: k8s.core.v1.Secret;
    public readonly deployment: k8s.apps.v1.Deployment;

    private readonly k8sProvider: k8s.Provider;

    constructor(
        name: string,
        args: CloudflareWarpArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:cloudflare:WarpComponent", name, args, opts);

        this.k8sProvider = args.kubernetesProvider;

        const namespaceName = args.namespace || "cloudflare-tunnel";
        const cloudflaredImage = args.cloudflaredImage || "cloudflare/cloudflared:latest";
        const replicas = args.replicas || 2;

        this.logger.info("Initializing Cloudflare Tunnel component", {
            namespace: namespaceName,
            replicas
        });

        // Create namespace for cloudflared
        this.namespace = new k8s.core.v1.Namespace(
            `${name}-namespace`,
            {
                metadata: {
                    name: namespaceName,
                    labels: {
                        ...this.mergeTags(),
                        "app.kubernetes.io/name": "cloudflared",
                        "app.kubernetes.io/component": "tunnel",
                    },
                },
            },
            {
                parent: this,
                provider: this.k8sProvider,
            }
        );

        this.logger.info("Namespace created", { namespace: namespaceName });

        // Create Kubernetes Secret for tunnel token
        this.tunnelSecret = new k8s.core.v1.Secret(
            `${name}-token`,
            {
                metadata: {
                    name: "cloudflared-token",
                    namespace: this.namespace.metadata.name,
                },
                type: "Opaque",
                stringData: {
                    token: args.tunnelToken,
                },
            },
            {
                parent: this,
                provider: this.k8sProvider,
            }
        );

        this.logger.info("Tunnel token secret created");

        // Create Deployment for cloudflared
        this.deployment = new k8s.apps.v1.Deployment(
            `${name}-deployment`,
            {
                metadata: {
                    name: "cloudflared",
                    namespace: this.namespace.metadata.name,
                    labels: {
                        app: "cloudflared",
                        ...this.mergeTags(),
                    },
                },
                spec: {
                    replicas: replicas,
                    selector: {
                        matchLabels: {
                            app: "cloudflared",
                        },
                    },
                    template: {
                        metadata: {
                            labels: {
                                app: "cloudflared",
                            },
                        },
                        spec: {
                            containers: [
                                {
                                    name: "cloudflared",
                                    image: cloudflaredImage,
                                    args: [
                                        "tunnel",
                                        "--metrics", "0.0.0.0:2000",
                                        "--no-autoupdate",
                                        "run",
                                        "--token", "$(TUNNEL_TOKEN)"
                                    ],
                                    env: [
                                        {
                                            name: "TUNNEL_TOKEN",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: this.tunnelSecret.metadata.name,
                                                    key: "token",
                                                },
                                            },
                                        },
                                    ],
                                    livenessProbe: {
                                        httpGet: {
                                            path: "/ready",
                                            port: 2000,
                                        },
                                        failureThreshold: 1,
                                        initialDelaySeconds: 10,
                                        periodSeconds: 10,
                                    },
                                    resources: {
                                        requests: {
                                            cpu: "100m",
                                            memory: "128Mi",
                                        },
                                        limits: {
                                            cpu: "500m",
                                            memory: "512Mi",
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            {
                parent: this,
                provider: this.k8sProvider,
            }
        );

        this.logger.info("Cloudflared deployment created", {
            replicas,
            image: cloudflaredImage
        });

        this.registerOutputs({
            namespace: this.namespace.metadata.name,
            deploymentName: this.deployment.metadata.name,
        });

        this.logger.info("Cloudflare Tunnel component initialization completed");
    }

    /**
     * Get the deployment name
     */
    public getDeploymentName(): pulumi.Output<string> {
        return this.deployment.metadata.name;
    }

    /**
     * Get the namespace name
     */
    public getNamespace(): pulumi.Output<string> {
        return this.namespace.metadata.name;
    }
}
