import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, BaseComponentArgs } from "../../shared/base";
import { CommonValidationRules } from "../../shared/base";
import { createEKSKubernetesProvider } from "../../shared/utils/kubernetes-helpers";

/**
 * Arguments for ArgoCD Cluster Registration Component
 */
export interface ArgoCDClusterRegistrationArgs extends BaseComponentArgs {
    /**
     * Master ArgoCD cluster kubeconfig
     * This is the cluster where ArgoCD server is running
     */
    masterClusterKubeconfig?: pulumi.Input<string>;

    /**
     * Master ArgoCD cluster connection details (alternative to kubeconfig)
     */
    masterCluster?: {
        clusterName: pulumi.Input<string>;
        clusterEndpoint: pulumi.Input<string>;
        clusterCertificateAuthority: pulumi.Input<string>;
        roleArn?: pulumi.Input<string>;
    };

    /**
     * ArgoCD namespace in the master cluster
     * @default "argocd"
     */
    argoCDNamespace?: string;

    /**
     * Target cluster to register with ArgoCD
     */
    targetCluster: {
        /**
         * Display name for the cluster in ArgoCD
         */
        name: pulumi.Input<string>;

        /**
         * EKS cluster endpoint
         */
        endpoint: pulumi.Input<string>;

        /**
         * EKS cluster certificate authority data
         */
        certificateAuthority: pulumi.Input<string>;

        /**
         * IAM role ARN to assume when accessing the cluster
         */
        roleArn?: pulumi.Input<string>;

        /**
         * AWS region where the cluster is located
         */
        region?: pulumi.Input<string>;
    };

    /**
     * ArgoCD project to associate the cluster with
     * @default "default"
     */
    projectName?: string;

    /**
     * Labels to apply to the cluster in ArgoCD
     * Used for cluster selection in ApplicationSets
     */
    clusterLabels?: { [key: string]: string };

    /**
     * Namespaces to allow ArgoCD to deploy to
     * If empty, all namespaces are allowed
     */
    namespaces?: string[];

    /**
     * Create a dedicated service account for ArgoCD in the target cluster
     * @default true
     */
    createServiceAccount?: boolean;

    /**
     * Service account name to create in target cluster
     * @default "argocd-manager"
     */
    serviceAccountName?: string;

    /**
     * Create cluster-admin role binding for the service account
     * Set to false for more restrictive permissions
     * @default true
     */
    clusterAdmin?: boolean;
}

/**
 * ArgoCD Cluster Registration Component
 *
 * Registers an external EKS cluster with a master ArgoCD installation for multi-cluster management.
 *
 * This component:
 * 1. Creates a service account in the target cluster
 * 2. Creates appropriate RBAC bindings
 * 3. Generates a kubeconfig for ArgoCD to access the cluster
 * 4. Creates a Secret in the master ArgoCD cluster with cluster credentials
 *
 * Architecture:
 * ```
 * Master Cluster (us-east-1)     Target Cluster (us-west-2)
 * ┌─────────────────────┐        ┌──────────────────────┐
 * │  ArgoCD Server      │        │                      │
 * │  ┌──────────────┐   │        │  ┌────────────────┐  │
 * │  │  Secret      │   │────────┼─>│ ServiceAccount │  │
 * │  │  (cluster    │   │        │  │ (argocd-mgr)   │  │
 * │  │   config)    │   │        │  └────────────────┘  │
 * │  └──────────────┘   │        │                      │
 * └─────────────────────┘        └──────────────────────┘
 * ```
 *
 * Example usage:
 * ```typescript
 * // Register a secondary cluster to master ArgoCD
 * const clusterReg = new ArgoCDClusterRegistrationComponent("secondary-cluster", {
 *     masterCluster: {
 *         clusterName: primaryClusterName,
 *         clusterEndpoint: primaryClusterEndpoint,
 *         clusterCertificateAuthority: primaryClusterCA,
 *         roleArn: sharedServicesRoleArn
 *     },
 *     argoCDNamespace: "argocd",
 *     targetCluster: {
 *         name: "us-west-2-cluster",
 *         endpoint: secondaryClusterEndpoint,
 *         certificateAuthority: secondaryClusterCA,
 *         roleArn: sharedServicesRoleArn,
 *         region: "us-west-2"
 *     },
 *     clusterLabels: {
 *         environment: "production",
 *         region: "us-west-2"
 *     },
 *     tags: {
 *         Environment: "production"
 *     }
 * });
 * ```
 */
export class ArgoCDClusterRegistrationComponent extends BaseAWSComponent {
    public readonly targetServiceAccount?: k8s.core.v1.ServiceAccount;
    public readonly targetRoleBinding?: k8s.rbac.v1.ClusterRoleBinding;
    public readonly clusterSecret: k8s.core.v1.Secret;
    public readonly clusterName: pulumi.Output<string>;

    private readonly masterK8sProvider: k8s.Provider;
    private readonly targetK8sProvider: k8s.Provider;

    constructor(
        name: string,
        args: ArgoCDClusterRegistrationArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:argocd:ClusterRegistration", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [CommonValidationRules.required("targetCluster")]);

        if (!args.masterClusterKubeconfig && !args.masterCluster) {
            throw new Error(
                "Either masterClusterKubeconfig or masterCluster must be provided"
            );
        }

        this.logger.info("Initializing ArgoCD cluster registration", {
            targetCluster: args.targetCluster.name,
            namespace: args.argoCDNamespace || "argocd"
        });

        const argoCDNamespace = args.argoCDNamespace || "argocd";
        const serviceAccountName = args.serviceAccountName || "argocd-manager";
        const createServiceAccount = args.createServiceAccount !== false;
        const clusterAdmin = args.clusterAdmin !== false;

        // Create Kubernetes provider for master ArgoCD cluster
        if (args.masterClusterKubeconfig) {
            this.masterK8sProvider = new k8s.Provider(
                `${this.getResourceName()}-master-k8s-provider`,
                {
                    kubeconfig: args.masterClusterKubeconfig
                },
                { parent: this }
            );
        } else {
            this.masterK8sProvider = createEKSKubernetesProvider(
                `${this.getResourceName()}-master-k8s-provider`,
                {
                    clusterName: args.masterCluster!.clusterName,
                    clusterEndpoint: args.masterCluster!.clusterEndpoint,
                    clusterCertificateAuthority:
                        args.masterCluster!.clusterCertificateAuthority,
                    region: this.region,
                    roleArn: args.masterCluster!.roleArn
                },
                { parent: this }
            );
        }

        // Create Kubernetes provider for target cluster
        const targetRegion = args.targetCluster.region
            ? (typeof args.targetCluster.region === 'string'
                ? args.targetCluster.region
                : this.region)
            : this.region;

        this.targetK8sProvider = createEKSKubernetesProvider(
            `${this.getResourceName()}-target-k8s-provider`,
            {
                clusterName: args.targetCluster.name,
                clusterEndpoint: args.targetCluster.endpoint,
                clusterCertificateAuthority: args.targetCluster.certificateAuthority,
                region: targetRegion,
                roleArn: args.targetCluster.roleArn
            },
            { parent: this }
        );

        // Create service account in target cluster if requested
        if (createServiceAccount) {
            // Create service account
            this.targetServiceAccount = new k8s.core.v1.ServiceAccount(
                `${name}-target-sa`,
                {
                    metadata: {
                        name: serviceAccountName,
                        namespace: "kube-system",
                        labels: this.mergeTags({
                            "app.kubernetes.io/name": "argocd-manager",
                            "app.kubernetes.io/component": "cluster-registration"
                        })
                    }
                },
                {
                    parent: this,
                    provider: this.targetK8sProvider
                }
            );

            this.logger.info("Service account created in target cluster", {
                serviceAccount: serviceAccountName
            });

            // Create RBAC binding
            if (clusterAdmin) {
                // Bind to cluster-admin role for full access
                this.targetRoleBinding = new k8s.rbac.v1.ClusterRoleBinding(
                    `${name}-target-crb`,
                    {
                        metadata: {
                            name: `${serviceAccountName}-binding`,
                            labels: this.mergeTags()
                        },
                        roleRef: {
                            apiGroup: "rbac.authorization.k8s.io",
                            kind: "ClusterRole",
                            name: "cluster-admin"
                        },
                        subjects: [
                            {
                                kind: "ServiceAccount",
                                name: this.targetServiceAccount.metadata.name,
                                namespace: "kube-system"
                            }
                        ]
                    },
                    {
                        parent: this,
                        provider: this.targetK8sProvider
                    }
                );

                this.logger.info("ClusterRoleBinding created", {
                    binding: `${serviceAccountName}-binding`,
                    role: "cluster-admin"
                });
            } else {
                // Create a more restrictive role
                const role = new k8s.rbac.v1.ClusterRole(
                    `${name}-target-role`,
                    {
                        metadata: {
                            name: `${serviceAccountName}-role`,
                            labels: this.mergeTags()
                        },
                        rules: [
                            {
                                apiGroups: ["*"],
                                resources: ["*"],
                                verbs: ["get", "list", "watch"]
                            },
                            {
                                apiGroups: ["", "apps", "batch"],
                                resources: [
                                    "deployments",
                                    "replicasets",
                                    "statefulsets",
                                    "daemonsets",
                                    "jobs",
                                    "cronjobs",
                                    "pods",
                                    "services",
                                    "configmaps",
                                    "secrets"
                                ],
                                verbs: ["*"]
                            }
                        ]
                    },
                    {
                        parent: this,
                        provider: this.targetK8sProvider
                    }
                );

                this.targetRoleBinding = new k8s.rbac.v1.ClusterRoleBinding(
                    `${name}-target-crb`,
                    {
                        metadata: {
                            name: `${serviceAccountName}-binding`,
                            labels: this.mergeTags()
                        },
                        roleRef: {
                            apiGroup: "rbac.authorization.k8s.io",
                            kind: "ClusterRole",
                            name: role.metadata.name
                        },
                        subjects: [
                            {
                                kind: "ServiceAccount",
                                name: this.targetServiceAccount.metadata.name,
                                namespace: "kube-system"
                            }
                        ]
                    },
                    {
                        parent: this,
                        provider: this.targetK8sProvider,
                        dependsOn: [role]
                    }
                );

                this.logger.info("Custom ClusterRole and binding created");
            }
        }

        // Get service account token
        const saTokenSecret = this.targetServiceAccount
            ? this.createServiceAccountToken(name, serviceAccountName)
            : undefined;

        // Build cluster configuration
        this.clusterName = pulumi.output(args.targetCluster.name);
        const clusterConfig = this.buildClusterConfig(args, saTokenSecret);

        // Create cluster secret in master ArgoCD namespace
        this.clusterSecret = new k8s.core.v1.Secret(
            `${name}-cluster-secret`,
            {
                metadata: {
                    name: pulumi.interpolate`cluster-${args.targetCluster.name}`,
                    namespace: argoCDNamespace,
                    labels: this.mergeTags({
                        "argocd.argoproj.io/secret-type": "cluster",
                        ...(args.clusterLabels || {})
                    })
                },
                type: "Opaque",
                stringData: {
                    name: args.targetCluster.name,
                    server: args.targetCluster.endpoint,
                    config: clusterConfig,
                    project: args.projectName || "default",
                    namespaces: args.namespaces?.join(",") || ""
                }
            },
            {
                parent: this,
                provider: this.masterK8sProvider,
                dependsOn: this.targetServiceAccount
                    ? [this.targetServiceAccount, this.targetRoleBinding!]
                    : []
            }
        );

        this.logger.info("Cluster secret created in master ArgoCD", {
            secretName: `cluster-${args.targetCluster.name}`,
            namespace: argoCDNamespace
        });

        // Register outputs
        this.registerOutputs({
            clusterName: this.clusterName,
            clusterSecretName: this.clusterSecret.metadata.name,
            serviceAccountName: this.targetServiceAccount?.metadata.name
        });

        this.logger.info("ArgoCD cluster registration completed", {
            cluster: args.targetCluster.name
        });
    }

    /**
     * Create a service account token secret for the target cluster
     */
    private createServiceAccountToken(
        name: string,
        serviceAccountName: string
    ): k8s.core.v1.Secret {
        return new k8s.core.v1.Secret(
            `${name}-sa-token`,
            {
                metadata: {
                    name: `${serviceAccountName}-token`,
                    namespace: "kube-system",
                    annotations: {
                        "kubernetes.io/service-account.name": serviceAccountName
                    }
                },
                type: "kubernetes.io/service-account-token"
            },
            {
                parent: this,
                provider: this.targetK8sProvider,
                dependsOn: [this.targetServiceAccount!]
            }
        );
    }

    /**
     * Build cluster configuration for ArgoCD
     */
    private buildClusterConfig(
        args: ArgoCDClusterRegistrationArgs,
        saTokenSecret?: k8s.core.v1.Secret
    ): pulumi.Output<string> {
        if (args.targetCluster.roleArn) {
            // Use IAM role authentication (AWS-specific)
            return pulumi
                .all([
                    args.targetCluster.endpoint,
                    args.targetCluster.certificateAuthority,
                    args.targetCluster.roleArn
                ])
                .apply(([endpoint, ca, roleArn]) =>
                    JSON.stringify({
                        awsAuthConfig: {
                            clusterName: args.targetCluster.name,
                            roleARN: roleArn
                        },
                        tlsClientConfig: {
                            insecure: false,
                            caData: ca
                        }
                    })
                );
        } else if (saTokenSecret) {
            // Use service account token authentication
            return pulumi
                .all([
                    args.targetCluster.endpoint,
                    args.targetCluster.certificateAuthority,
                    saTokenSecret.data.apply(data => data?.token || "")
                ])
                .apply(([endpoint, ca, token]) => {
                    // Decode base64 token
                    const decodedToken = Buffer.from(token, "base64").toString("utf-8");
                    return JSON.stringify({
                        bearerToken: decodedToken,
                        tlsClientConfig: {
                            insecure: false,
                            caData: ca
                        }
                    });
                });
        } else {
            throw new Error(
                "Either targetCluster.roleArn or createServiceAccount must be provided"
            );
        }
    }

    /**
     * Get cluster secret name
     */
    public getClusterSecretName(): pulumi.Output<string> {
        return this.clusterSecret.metadata.name;
    }

    /**
     * Get target cluster name
     */
    public getClusterName(): pulumi.Output<string> {
        return this.clusterName;
    }
}
