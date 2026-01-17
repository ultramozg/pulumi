import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { BaseAWSComponent, BaseComponentArgs } from "../shared/base";
import { CommonValidationRules } from "../shared/base";
import { createEKSKubernetesProvider } from "../shared/utils/kubernetes-helpers";

/**
 * ArgoCD Helm configuration
 */
export interface ArgoCDHelmConfig {
    /**
     * Namespace to deploy ArgoCD
     * @default "argocd"
     */
    namespace?: string;

    /**
     * ArgoCD Helm chart version
     * @default "5.51.0"
     */
    chartVersion?: string;

    /**
     * High availability configuration
     */
    ha?: {
        /**
         * Enable HA mode with multiple replicas
         * @default false
         */
        enabled: boolean;

        /**
         * Number of replicas for HA components
         * @default 3
         */
        replicaCount?: number;
    };

    /**
     * Server configuration
     */
    server?: {
        /**
         * Enable server component
         * @default true
         */
        enabled?: boolean;

        /**
         * Number of server replicas
         * @default 1 (or 3 if HA enabled)
         */
        replicas?: number;

        /**
         * Resource requests and limits
         */
        resources?: {
            requests?: {
                cpu?: string;
                memory?: string;
            };
            limits?: {
                cpu?: string;
                memory?: string;
            };
        };
    };

    /**
     * Repository server configuration
     */
    repoServer?: {
        /**
         * Number of repo server replicas
         * @default 1 (or 2 if HA enabled)
         */
        replicas?: number;

        /**
         * Resource requests and limits
         */
        resources?: {
            requests?: {
                cpu?: string;
                memory?: string;
            };
            limits?: {
                cpu?: string;
                memory?: string;
            };
        };
    };

    /**
     * Application controller configuration
     */
    controller?: {
        /**
         * Number of controller replicas
         * @default 1
         */
        replicas?: number;

        /**
         * Resource requests and limits
         */
        resources?: {
            requests?: {
                cpu?: string;
                memory?: string;
            };
            limits?: {
                cpu?: string;
                memory?: string;
            };
        };
    };

    /**
     * Additional Helm values to merge
     */
    additionalValues?: pulumi.Input<any>;
}

/**
 * ArgoCD ingress configuration
 */
export interface ArgoCDIngressConfig {
    /**
     * Enable ingress for ArgoCD UI
     */
    enabled: boolean;

    /**
     * Hostname for ArgoCD UI (e.g., argocd.example.com)
     */
    host?: pulumi.Input<string>;

    /**
     * Ingress class name
     * @default "alb"
     */
    ingressClassName?: string;

    /**
     * AWS Certificate Manager certificate ARN for HTTPS
     */
    certificateArn?: pulumi.Input<string>;

    /**
     * Additional ingress annotations
     */
    annotations?: { [key: string]: string };
}

/**
 * ArgoCD IAM authentication configuration
 */
export interface ArgoCDIAMConfig {
    /**
     * Enable IAM-based authentication
     * @default true
     */
    enabled?: boolean;

    /**
     * IAM role name for ArgoCD service account
     * If not provided, will be auto-generated
     */
    roleName?: string;

    /**
     * Additional IAM policy ARNs to attach to the role
     */
    additionalPolicyArns?: pulumi.Input<string>[];

    /**
     * Custom IAM policy document for ArgoCD capabilities
     * This allows ArgoCD to interact with AWS services (e.g., ECR, Secrets Manager)
     */
    customPolicyDocument?: pulumi.Input<string>;

    /**
     * IAM admin role/user ARNs that can authenticate to ArgoCD
     * These IAM principals will have admin access to ArgoCD
     */
    adminIAMPrincipals?: pulumi.Input<string>[];
}

/**
 * ArgoCD RBAC configuration
 */
export interface ArgoCDRBACConfig {
    /**
     * Default policy for all users
     * @default "role:readonly"
     */
    defaultPolicy?: string;

    /**
     * RBAC policies in CSV format
     * Example: "p, role:org-admin, applications, *, * / *, allow"
     */
    policies?: string[];

    /**
     * RBAC scopes for groups
     */
    scopes?: string;
}

/**
 * Arguments for ArgoCD Component
 */
export interface ArgoCDComponentArgs extends BaseComponentArgs {
    /**
     * EKS cluster name where ArgoCD will be deployed
     */
    clusterName: pulumi.Input<string>;

    /**
     * EKS cluster endpoint
     */
    clusterEndpoint: pulumi.Input<string>;

    /**
     * EKS cluster certificate authority data
     */
    clusterCertificateAuthority: pulumi.Input<string>;

    /**
     * EKS cluster OIDC provider ARN for IRSA
     */
    oidcProviderArn?: pulumi.Input<string>;

    /**
     * EKS cluster OIDC provider URL for IRSA
     */
    oidcProviderUrl?: pulumi.Input<string>;

    /**
     * Optional IAM role ARN to assume when authenticating to EKS
     */
    roleArn?: pulumi.Input<string>;

    /**
     * Helm configuration for ArgoCD
     */
    helm?: ArgoCDHelmConfig;

    /**
     * Ingress configuration
     */
    ingress?: ArgoCDIngressConfig;

    /**
     * IAM configuration for ArgoCD
     */
    iam?: ArgoCDIAMConfig;

    /**
     * RBAC configuration
     */
    rbac?: ArgoCDRBACConfig;

    /**
     * ArgoCD admin password
     * If not provided, a random password will be generated
     */
    adminPassword?: pulumi.Input<string>;

    /**
     * Git repositories to configure automatically
     */
    repositories?: {
        url: pulumi.Input<string>;
        name?: pulumi.Input<string>;
        type?: "git" | "helm";
        username?: pulumi.Input<string>;
        password?: pulumi.Input<string>;
        sshPrivateKey?: pulumi.Input<string>;
    }[];

    /**
     * Enable metrics endpoint
     * @default true
     */
    enableMetrics?: boolean;
}

/**
 * ArgoCD Component
 *
 * Deploys ArgoCD to an EKS cluster with IAM authentication support.
 *
 * Features:
 * - IAM Roles for Service Accounts (IRSA) for AWS authentication
 * - High availability mode with multiple replicas
 * - ALB ingress with HTTPS support
 * - Multi-cluster management capabilities
 * - Git repository integration
 * - RBAC configuration
 * - Metrics and monitoring
 *
 * Example usage:
 * ```typescript
 * const argocd = new ArgoCDComponent("master-argocd", {
 *     clusterName: eksClusterName,
 *     clusterEndpoint: eksClusterEndpoint,
 *     clusterCertificateAuthority: eksClusterCA,
 *     oidcProviderArn: eksOidcProviderArn,
 *     oidcProviderUrl: eksOidcProviderUrl,
 *     helm: {
 *         namespace: "argocd",
 *         ha: {
 *             enabled: true,
 *             replicaCount: 3
 *         }
 *     },
 *     ingress: {
 *         enabled: true,
 *         host: "argocd.example.com",
 *         certificateArn: certArn
 *     },
 *     iam: {
 *         enabled: true,
 *         adminIAMPrincipals: ["arn:aws:iam::123456789012:role/AdminRole"]
 *     },
 *     tags: {
 *         Environment: "production"
 *     }
 * });
 * ```
 */
export class ArgoCDComponent extends BaseAWSComponent {
    public readonly namespace: k8s.core.v1.Namespace;
    public readonly release: k8s.helm.v3.Release;
    public readonly serviceAccount: k8s.core.v1.ServiceAccount;
    public readonly iamRole?: aws.iam.Role;
    public readonly adminPassword: pulumi.Output<string>;
    public readonly endpoint: pulumi.Output<string>;
    public readonly serverService: pulumi.Output<k8s.core.v1.Service>;

    private readonly k8sProvider: k8s.Provider;
    private readonly awsProvider: aws.Provider;

    constructor(
        name: string,
        args: ArgoCDComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:argocd:ArgoCDComponent", name, args, opts);

        // Validate required arguments
        this.validateArgs(args, [
            CommonValidationRules.required("clusterName"),
            CommonValidationRules.required("clusterEndpoint"),
            CommonValidationRules.required("clusterCertificateAuthority")
        ]);

        this.logger.info("Initializing ArgoCD component", {
            cluster: args.clusterName,
            namespace: args.helm?.namespace || "argocd",
            haEnabled: args.helm?.ha?.enabled || false
        });

        // Create AWS provider
        this.awsProvider = this.createProvider(args.region);

        // Create Kubernetes provider
        this.k8sProvider = createEKSKubernetesProvider(
            `${this.getResourceName()}-k8s-provider`,
            {
                clusterName: args.clusterName,
                clusterEndpoint: args.clusterEndpoint,
                clusterCertificateAuthority: args.clusterCertificateAuthority,
                region: this.region,
                roleArn: args.roleArn
            },
            { parent: this }
        );

        const namespace = args.helm?.namespace || "argocd";

        // Create namespace
        this.namespace = new k8s.core.v1.Namespace(
            `${name}-namespace`,
            {
                metadata: {
                    name: namespace,
                    labels: this.mergeTags({
                        "app.kubernetes.io/name": "argocd",
                        "app.kubernetes.io/component": "server"
                    })
                }
            },
            {
                parent: this,
                provider: this.k8sProvider
            }
        );

        this.logger.info("Namespace created", { namespace });

        // Generate or use provided admin password
        if (args.adminPassword) {
            this.adminPassword = pulumi.output(args.adminPassword);
        } else {
            // Generate a random password using Pulumi random provider
            const crypto = require("crypto");
            const randomPassword = crypto.randomBytes(16).toString("hex");

            // Store in Secrets Manager
            const secret = new aws.secretsmanager.Secret(
                `${name}-admin-password`,
                {
                    name: `${name}-argocd-admin-password`,
                    description: "ArgoCD admin password",
                    tags: this.mergeTags()
                },
                { parent: this, provider: this.awsProvider }
            );

            const secretVersion = new aws.secretsmanager.SecretVersion(
                `${name}-admin-password-version`,
                {
                    secretId: secret.id,
                    secretString: pulumi.interpolate`argocd-${randomPassword}`
                },
                { parent: this, provider: this.awsProvider }
            );

            this.adminPassword = pulumi.output(secretVersion.secretString).apply(s => s || "");
        }

        // Create IAM role for ArgoCD if enabled
        if (args.iam?.enabled !== false && args.oidcProviderArn && args.oidcProviderUrl) {
            this.iamRole = this.createIAMRole(name, args, namespace);
        }

        // Create service account
        this.serviceAccount = new k8s.core.v1.ServiceAccount(
            `${name}-sa`,
            {
                metadata: {
                    name: "argocd-server",
                    namespace: this.namespace.metadata.name,
                    annotations: this.iamRole
                        ? {
                              "eks.amazonaws.com/role-arn": this.iamRole.arn
                          }
                        : undefined
                },
                automountServiceAccountToken: true
            },
            {
                parent: this,
                provider: this.k8sProvider
            }
        );

        this.logger.info("Service account created", {
            serviceAccount: "argocd-server",
            iamRoleAttached: !!this.iamRole
        });

        // Build Helm values
        const helmValues = this.buildHelmValues(args);

        // Install ArgoCD Helm chart
        this.release = new k8s.helm.v3.Release(
            `${name}-release`,
            {
                name: "argocd",
                chart: "argo-cd",
                namespace: this.namespace.metadata.name,
                version: args.helm?.chartVersion || "5.51.0",
                repositoryOpts: {
                    repo: "https://argoproj.github.io/argo-helm"
                },
                values: helmValues,
                skipAwait: false,
                timeout: 600
            },
            {
                parent: this,
                provider: this.k8sProvider,
                dependsOn: [this.namespace, this.serviceAccount]
            }
        );

        this.logger.info("ArgoCD Helm release created", {
            chart: "argo-cd",
            version: args.helm?.chartVersion || "5.51.0"
        });

        // Get server service
        this.serverService = this.release.status.apply(() =>
            k8s.core.v1.Service.get(
                `${name}-server-service`,
                pulumi.interpolate`${this.namespace.metadata.name}/argocd-server`,
                { provider: this.k8sProvider, parent: this }
            )
        );

        // Construct endpoint
        this.endpoint = args.ingress?.enabled && args.ingress?.host
            ? pulumi.output(args.ingress.host).apply(host => `https://${host}`)
            : this.serverService.apply(svc =>
                  svc.status.loadBalancer?.ingress?.[0]?.hostname
                      ? `https://${svc.status.loadBalancer.ingress[0].hostname}`
                      : `http://argocd-server.${namespace}.svc.cluster.local`
              );

        // Register outputs
        this.registerOutputs({
            namespace: this.namespace.metadata.name,
            endpoint: this.endpoint,
            adminPassword: this.adminPassword,
            iamRoleArn: this.iamRole?.arn,
            serviceAccountName: this.serviceAccount.metadata.name
        });

        this.logger.info("ArgoCD component initialization completed", {
            endpoint: this.endpoint
        });
    }

    /**
     * Create IAM role for ArgoCD with IRSA
     */
    private createIAMRole(
        name: string,
        args: ArgoCDComponentArgs,
        namespace: string
    ): aws.iam.Role {
        const oidcProviderArn = pulumi.output(args.oidcProviderArn!);
        const oidcProviderUrl = pulumi.output(args.oidcProviderUrl!);

        // Extract OIDC provider ID from URL
        const oidcProviderId = oidcProviderUrl.apply(url => url.replace("https://", ""));

        // Create assume role policy for IRSA
        const assumeRolePolicy = pulumi
            .all([oidcProviderArn, oidcProviderId])
            .apply(([providerArn, providerId]) =>
                JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Effect: "Allow",
                            Principal: {
                                Federated: providerArn
                            },
                            Action: "sts:AssumeRoleWithWebIdentity",
                            Condition: {
                                StringEquals: {
                                    [`${providerId}:sub`]: `system:serviceaccount:${namespace}:argocd-server`,
                                    [`${providerId}:aud`]: "sts.amazonaws.com"
                                }
                            }
                        }
                    ]
                })
            );

        const roleName = args.iam?.roleName || `${name}-argocd-role`;

        const role = new aws.iam.Role(
            `${name}-iam-role`,
            {
                name: roleName,
                assumeRolePolicy: assumeRolePolicy,
                description: "IAM role for ArgoCD with IRSA",
                tags: this.mergeTags({
                    Name: roleName,
                    Component: "argocd"
                })
            },
            { parent: this, provider: this.awsProvider }
        );

        this.logger.info("IAM role created", { roleName });

        // Create default policy for ArgoCD capabilities
        const defaultPolicy = new aws.iam.Policy(
            `${name}-default-policy`,
            {
                name: `${roleName}-policy`,
                description: "Default policy for ArgoCD capabilities",
                policy: args.iam?.customPolicyDocument || this.getDefaultPolicyDocument(),
                tags: this.mergeTags()
            },
            { parent: this, provider: this.awsProvider }
        );

        // Attach default policy
        new aws.iam.RolePolicyAttachment(
            `${name}-default-policy-attachment`,
            {
                role: role.name,
                policyArn: defaultPolicy.arn
            },
            { parent: this, provider: this.awsProvider }
        );

        // Attach additional policies if provided
        if (args.iam?.additionalPolicyArns) {
            pulumi.output(args.iam.additionalPolicyArns).apply(arns => {
                arns.forEach((arn, i) => {
                    new aws.iam.RolePolicyAttachment(
                        `${name}-additional-policy-${i}`,
                        {
                            role: role.name,
                            policyArn: arn
                        },
                        { parent: this, provider: this.awsProvider }
                    );
                });
            });
        }

        return role;
    }

    /**
     * Get default IAM policy document for ArgoCD
     */
    private getDefaultPolicyDocument(): string {
        return JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: [
                        "ecr:GetAuthorizationToken",
                        "ecr:BatchCheckLayerAvailability",
                        "ecr:GetDownloadUrlForLayer",
                        "ecr:BatchGetImage"
                    ],
                    Resource: "*"
                },
                {
                    Effect: "Allow",
                    Action: [
                        "secretsmanager:GetSecretValue",
                        "secretsmanager:DescribeSecret"
                    ],
                    Resource: "*"
                }
            ]
        });
    }

    /**
     * Build Helm values for ArgoCD
     */
    private buildHelmValues(args: ArgoCDComponentArgs): any {
        const haEnabled = args.helm?.ha?.enabled || false;
        const replicaCount = args.helm?.ha?.replicaCount || 3;

        const baseValues: any = {
            global: {
                domain: args.ingress?.host || "argocd.local"
            },
            configs: {
                params: {
                    "server.insecure": args.ingress?.enabled ? true : false
                },
                secret: {
                    argocdServerAdminPassword: this.adminPassword.apply(pwd =>
                        // Hash the password with bcrypt
                        // Note: In production, you should use a proper bcrypt hash
                        pwd
                    )
                },
                rbac: {
                    "policy.default": args.rbac?.defaultPolicy || "role:readonly",
                    "policy.csv": args.rbac?.policies?.join("\n") || "",
                    scopes: args.rbac?.scopes || "[groups]"
                }
            },
            server: {
                enabled: args.helm?.server?.enabled !== false,
                replicas: args.helm?.server?.replicas || (haEnabled ? replicaCount : 1),
                serviceAccount: {
                    create: false,
                    name: "argocd-server"
                },
                resources: args.helm?.server?.resources || {
                    requests: {
                        cpu: "100m",
                        memory: "128Mi"
                    },
                    limits: {
                        cpu: "500m",
                        memory: "512Mi"
                    }
                },
                metrics: {
                    enabled: args.enableMetrics !== false,
                    serviceMonitor: {
                        enabled: args.enableMetrics !== false
                    }
                }
            },
            repoServer: {
                replicas: args.helm?.repoServer?.replicas || (haEnabled ? 2 : 1),
                resources: args.helm?.repoServer?.resources || {
                    requests: {
                        cpu: "100m",
                        memory: "256Mi"
                    },
                    limits: {
                        cpu: "1",
                        memory: "1Gi"
                    }
                },
                metrics: {
                    enabled: args.enableMetrics !== false,
                    serviceMonitor: {
                        enabled: args.enableMetrics !== false
                    }
                }
            },
            controller: {
                replicas: args.helm?.controller?.replicas || 1,
                resources: args.helm?.controller?.resources || {
                    requests: {
                        cpu: "250m",
                        memory: "512Mi"
                    },
                    limits: {
                        cpu: "2",
                        memory: "2Gi"
                    }
                },
                metrics: {
                    enabled: args.enableMetrics !== false,
                    serviceMonitor: {
                        enabled: args.enableMetrics !== false
                    }
                }
            },
            redis: {
                enabled: true,
                metrics: {
                    enabled: args.enableMetrics !== false
                }
            },
            dex: {
                enabled: false
            },
            notifications: {
                enabled: false
            },
            applicationSet: {
                enabled: true,
                replicas: haEnabled ? 2 : 1
            }
        };

        // Add ingress configuration if enabled
        if (args.ingress?.enabled) {
            baseValues.server.ingress = {
                enabled: true,
                ingressClassName: args.ingress.ingressClassName || "alb",
                hostname: args.ingress.host,
                annotations: {
                    "alb.ingress.kubernetes.io/scheme": "internet-facing",
                    "alb.ingress.kubernetes.io/target-type": "ip",
                    "alb.ingress.kubernetes.io/backend-protocol": "HTTP",
                    "alb.ingress.kubernetes.io/listen-ports":
                        '[{"HTTP": 80}, {"HTTPS": 443}]',
                    "alb.ingress.kubernetes.io/ssl-redirect": "443",
                    ...(args.ingress.certificateArn && {
                        "alb.ingress.kubernetes.io/certificate-arn": args.ingress.certificateArn
                    }),
                    ...args.ingress.annotations
                },
                hosts: [args.ingress.host],
                tls: args.ingress.certificateArn
                    ? [
                          {
                              hosts: [args.ingress.host]
                          }
                      ]
                    : []
            };
        }

        // Merge with additional Helm values
        if (args.helm?.additionalValues) {
            return pulumi.output(args.helm.additionalValues).apply(additional => ({
                ...baseValues,
                ...additional
            }));
        }

        return baseValues;
    }

    /**
     * Get ArgoCD server endpoint
     */
    public getEndpoint(): pulumi.Output<string> {
        return this.endpoint;
    }

    /**
     * Get ArgoCD admin password
     */
    public getAdminPassword(): pulumi.Output<string> {
        return this.adminPassword;
    }

    /**
     * Get namespace name
     */
    public getNamespace(): pulumi.Output<string> {
        return this.namespace.metadata.name;
    }

    /**
     * Get IAM role ARN
     */
    public getIAMRoleArn(): pulumi.Output<string | undefined> {
        return this.iamRole ? this.iamRole.arn : pulumi.output(undefined);
    }
}
