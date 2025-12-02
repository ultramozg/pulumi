import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as tls from "@pulumi/tls";
import { BaseAWSComponent, BaseComponentArgs, validateRequired, validateRegion } from "../../shared/base";
import { ComputeOutputs } from "../../shared/interfaces";
import { generateEKSKubeconfig } from "../../shared/utils/kubernetes-helpers";

/**
 * EKS Node Group configuration (for traditional managed node groups)
 */
export interface EKSNodeGroupConfig {
    name: string;
    instanceTypes: string[];
    scalingConfig: {
        minSize: number;
        maxSize: number;
        desiredSize: number;
    };
    diskSize?: number;
    amiType?: string;
    capacityType?: "ON_DEMAND" | "SPOT";
    subnetIds?: string[];
    tags?: { [key: string]: string };
}

/**
 * EKS Auto Mode configuration
 */
export interface EKSAutoModeConfig {
    enabled: boolean;
    nodePools?: string[];  // e.g., ["general-purpose", "system"]
    nodeRoleArn?: pulumi.Input<string>;  // Optional custom node role
}

/**
 * Arguments for EKS Component
 */
export interface EKSComponentArgs extends BaseComponentArgs {
    clusterName: string;
    version?: string;
    autoMode?: EKSAutoModeConfig;
    addons?: string[];
    vpcId?: pulumi.Input<string>;
    subnetIds?: pulumi.Input<string[]>;
    endpointConfig?: {
        privateAccess?: boolean;
        publicAccess?: boolean;
        publicAccessCidrs?: string[];
    };
    nodeGroups?: EKSNodeGroupConfig[];
    enableCloudWatchLogging?: boolean;
    logTypes?: string[];
    encryptionConfig?: {
        resources: string[];
        provider: {
            keyArn: string;
        };
    };
    /**
     * Optional IAM role ARN to assume when generating EKS authentication tokens.
     * This is useful for cross-account access or when specific IAM permissions are required.
     */
    roleArn?: pulumi.Input<string>;

    /**
     * Optional IAM role/user ARN to grant cluster admin access via EKS Access Entries.
     * If not provided, the current caller identity will be used.
     * This is useful for cross-account deployments where you want to grant a specific role access.
     */
    adminRoleArn?: pulumi.Input<string>;
}

/**
 * Outputs from EKS Component
 */
export interface EKSComponentOutputs extends ComputeOutputs {
    clusterName: pulumi.Output<string>;
    clusterEndpoint: pulumi.Output<string>;
    clusterArn: pulumi.Output<string>;
    clusterVersion: pulumi.Output<string>;
    clusterSecurityGroupId: pulumi.Output<string>;
    nodeGroupArns?: pulumi.Output<string[]>;
    oidcIssuerUrl: pulumi.Output<string>;
    oidcProviderArn: pulumi.Output<string>;
    kubeconfig: pulumi.Output<any>;
}

/**
 * EKS Component with AWS Auto Mode support and configurable addons
 *
 * Auto Mode enables AWS-managed node provisioning without requiring Karpenter installation.
 * When Auto Mode is enabled, AWS automatically provisions and manages compute resources.
 */
export class EKSComponent extends BaseAWSComponent implements EKSComponentOutputs {
    public readonly clusterName: pulumi.Output<string>;
    public readonly clusterEndpoint: pulumi.Output<string>;
    public readonly clusterArn: pulumi.Output<string>;
    public readonly clusterVersion: pulumi.Output<string>;
    public readonly clusterSecurityGroupId: pulumi.Output<string>;
    public readonly nodeGroupArns?: pulumi.Output<string[]>;
    public readonly oidcIssuerUrl: pulumi.Output<string>;
    public readonly oidcProviderArn: pulumi.Output<string>;
    public readonly kubeconfig: pulumi.Output<any>;

    private readonly cluster: aws.eks.Cluster;
    private readonly provider: aws.Provider;
    private readonly clusterRole: aws.iam.Role;
    private readonly nodeRole?: aws.iam.Role;
    private readonly nodeGroups: aws.eks.NodeGroup[] = [];
    private readonly oidcProvider: aws.iam.OpenIdConnectProvider;

    constructor(
        name: string,
        args: EKSComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:EKS", name, args, opts);

        // Validate required arguments
        validateRequired(args.clusterName, "clusterName", "EKSComponent");

        if (args.region) {
            validateRegion(args.region, "EKSComponent");
        }

        // Create provider for the specified region
        this.provider = this.createProvider(args.region);

        // Create IAM roles
        this.clusterRole = this.createClusterRole(args.autoMode?.enabled || false);

        // Create node role if we have node groups OR Auto Mode is enabled
        if ((args.nodeGroups && args.nodeGroups.length > 0) || args.autoMode?.enabled) {
            this.nodeRole = this.createNodeRole(args.autoMode?.enabled || false);
        }

        // Create EKS cluster
        this.cluster = this.createCluster(args);

        // Grant cluster admin access when using API authentication mode
        // This is required for kubectl to work when the cluster uses EKS Access Entries
        this.createClusterCreatorAccessEntry(args.adminRoleArn);

        // Create access entry for node role if Auto Mode is enabled
        if (args.autoMode?.enabled && this.nodeRole) {
            this.createNodeRoleAccessEntry();
        }

        // Create OIDC provider for IRSA
        this.oidcProvider = this.createOIDCProvider();

        // Create node groups if specified (only if auto mode is not enabled)
        if (args.nodeGroups && args.nodeGroups.length > 0 && !args.autoMode?.enabled) {
            this.createNodeGroups(args);
        }

        // Install addons
        if (args.addons && args.addons.length > 0) {
            this.installAddons(args);
        }

        // Set outputs
        this.clusterName = this.cluster.name;
        this.clusterEndpoint = this.cluster.endpoint;
        this.clusterArn = this.cluster.arn;
        this.clusterVersion = this.cluster.version;
        this.clusterSecurityGroupId = this.cluster.vpcConfig.clusterSecurityGroupId;
        this.oidcIssuerUrl = this.cluster.identities[0].oidcs[0].issuer;
        this.oidcProviderArn = this.oidcProvider.arn;

        if (this.nodeGroups.length > 0) {
            this.nodeGroupArns = pulumi.output(this.nodeGroups.map(ng => ng.arn));
        }

        // Generate kubeconfig
        this.kubeconfig = this.generateKubeconfig(args.roleArn);

        // Register outputs
        this.registerOutputs({
            clusterName: this.clusterName,
            clusterEndpoint: this.clusterEndpoint,
            clusterArn: this.clusterArn,
            clusterVersion: this.clusterVersion,
            clusterSecurityGroupId: this.clusterSecurityGroupId,
            nodeGroupArns: this.nodeGroupArns,
            oidcIssuerUrl: this.oidcIssuerUrl,
            oidcProviderArn: this.oidcProviderArn,
            kubeconfig: this.kubeconfig
        });
    }

    /**
     * Create EKS cluster service role
     * @param isAutoMode - Whether this is for Auto Mode (requires additional policies)
     */
    private createClusterRole(isAutoMode: boolean = false): aws.iam.Role {
        const roleName = `${this.getResourceName()}-cluster-role`;
        const role = new aws.iam.Role(
            roleName,
            {
                assumeRolePolicy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Action: ["sts:AssumeRole", "sts:TagSession"],
                        Effect: "Allow",
                        Principal: {
                            Service: "eks.amazonaws.com"
                        }
                    }]
                }),
                tags: this.mergeTags({ Role: "EKSClusterServiceRole" })
            },
            { parent: this, provider: this.provider }
        );

        // Attach base cluster policy
        new aws.iam.RolePolicyAttachment(
            `${this.getResourceName()}-cluster-policy`,
            {
                role: role.name,
                policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
            },
            { parent: this, provider: this.provider }
        );

        // Attach policy for viewing Kubernetes resources in AWS Console
        // This allows the cluster to describe pods, deployments, and other Kubernetes resources
        // Note: Users accessing the console also need appropriate EKS access entries
        new aws.iam.RolePolicyAttachment(
            `${this.getResourceName()}-cluster-view-policy`,
            {
                role: role.name,
                policyArn: "arn:aws:iam::aws:policy/AmazonEKSViewPolicy"
            },
            { parent: this, provider: this.provider }
        );

        // Attach Auto Mode specific policies if enabled
        if (isAutoMode) {
            const autoModePolicies = [
                { name: "compute", arn: "arn:aws:iam::aws:policy/AmazonEKSComputePolicy" },
                { name: "block-storage", arn: "arn:aws:iam::aws:policy/AmazonEKSBlockStoragePolicy" },
                { name: "load-balancing", arn: "arn:aws:iam::aws:policy/AmazonEKSLoadBalancingPolicy" },
                { name: "networking", arn: "arn:aws:iam::aws:policy/AmazonEKSNetworkingPolicy" }
            ];

            autoModePolicies.forEach(policy => {
                new aws.iam.RolePolicyAttachment(
                    `${this.getResourceName()}-cluster-${policy.name}-policy`,
                    {
                        role: role.name,
                        policyArn: policy.arn
                    },
                    { parent: this, provider: this.provider }
                );
            });

            pulumi.log.info("EKS Auto Mode cluster policies attached");
        }

        return role;
    }

    /**
     * Create EKS node group service role
     * @param isAutoMode - Whether this role is for Auto Mode (minimal permissions) or traditional node groups (full permissions)
     */
    private createNodeRole(isAutoMode: boolean = false): aws.iam.Role {
        const roleName = `${this.getResourceName()}-node-role`;
        const role = new aws.iam.Role(
            roleName,
            {
                assumeRolePolicy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Principal: {
                            Service: "ec2.amazonaws.com"
                        }
                    }]
                }),
                tags: this.mergeTags({
                    Role: isAutoMode ? "EKSAutoModeNodeRole" : "EKSNodeGroupServiceRole"
                })
            },
            { parent: this, provider: this.provider }
        );

        // Attach policies based on whether this is Auto Mode or traditional node groups
        if (isAutoMode) {
            // Auto Mode requires minimal policies
            const policies = [
                "arn:aws:iam::aws:policy/AmazonEKSWorkerNodeMinimalPolicy",
                "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"
            ];

            policies.forEach((policyArn, index) => {
                new aws.iam.RolePolicyAttachment(
                    `${this.getResourceName()}-node-policy-${index}`,
                    {
                        role: role.name,
                        policyArn: policyArn
                    },
                    { parent: this, provider: this.provider }
                );
            });
        } else {
            // Traditional managed node groups require full policies
            const policies = [
                "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
                "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
                "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
            ];

            policies.forEach((policyArn, index) => {
                new aws.iam.RolePolicyAttachment(
                    `${this.getResourceName()}-node-policy-${index}`,
                    {
                        role: role.name,
                        policyArn: policyArn
                    },
                    { parent: this, provider: this.provider }
                );
            });
        }

        return role;
    }

    /**
     * Create OIDC provider for IRSA (IAM Roles for Service Accounts)
     *
     * The thumbprint is dynamically retrieved from the TLS certificate of the OIDC issuer endpoint.
     * This ensures compatibility if AWS changes their root CA in the future.
     */
    private createOIDCProvider(): aws.iam.OpenIdConnectProvider {
        // Dynamically retrieve the TLS certificate thumbprint from the OIDC issuer endpoint
        // The thumbprint is the SHA-1 fingerprint of the root CA certificate
        const thumbprint = this.cluster.identities[0].oidcs[0].issuer.apply(async (issuerUrl) => {
            const certData = await tls.getCertificate({
                url: issuerUrl
            });

            if (!certData.certificates || certData.certificates.length === 0) {
                throw new Error("No certificates found in OIDC issuer certificate chain");
            }

            // The last certificate in the chain is the root CA
            const rootCert = certData.certificates[certData.certificates.length - 1];
            // Remove colons and convert to lowercase to match AWS format
            return rootCert.sha1Fingerprint.replace(/:/g, '').toLowerCase();
        });

        const oidcProvider = new aws.iam.OpenIdConnectProvider(
            `${this.getResourceName()}-oidc-provider`,
            {
                url: this.cluster.identities[0].oidcs[0].issuer,
                clientIdLists: ["sts.amazonaws.com"],
                thumbprintLists: [thumbprint],
                tags: this.mergeTags({ Purpose: "EKS-IRSA" })
            },
            {
                parent: this,
                provider: this.provider,
                dependsOn: [this.cluster]
            }
        );

        return oidcProvider;
    }

    /**
     * Create EKS Access Entry for cluster admin
     *
     * Grants the specified IAM role admin access to the cluster via EKS Access Entries.
     * Required when the cluster uses API authentication mode.
     *
     * The adminRoleArn should be provided from the deployment configuration
     * (e.g., from deployment-config.json via environment variables).
     *
     * @param adminRoleArn - IAM role/user ARN to grant cluster admin access (required)
     */
    private createClusterCreatorAccessEntry(adminRoleArn?: pulumi.Input<string>): void {
        if (!adminRoleArn) {
            throw new Error(
                "adminRoleArn is required for EKS Access Entry creation. " +
                "Please provide it in the EKS component configuration."
            );
        }

        const principalArn = pulumi.output(adminRoleArn);

        // Create an access entry for the cluster creator with admin permissions
        new aws.eks.AccessEntry(
            `${this.getResourceName()}-creator-access`,
            {
                clusterName: this.cluster.name,
                principalArn: principalArn,
                type: "STANDARD",
                tags: this.mergeTags({ Purpose: "ClusterCreatorAccess" })
            },
            {
                parent: this,
                provider: this.provider,
                dependsOn: [this.cluster]
            }
        );

        // Associate the cluster admin policy with the access entry
        new aws.eks.AccessPolicyAssociation(
            `${this.getResourceName()}-creator-admin-policy`,
            {
                clusterName: this.cluster.name,
                principalArn: principalArn,
                policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy",
                accessScope: {
                    type: "cluster"
                }
            },
            {
                parent: this,
                provider: this.provider,
                dependsOn: [this.cluster]
            }
        );
    }

    /**
     * Create EKS Access Entry for Auto Mode node role
     *
     * Required for EKS Auto Mode to allow nodes to join the cluster.
     * This creates an EC2 type access entry and associates the AmazonEKSAutoNodePolicy.
     */
    private createNodeRoleAccessEntry(): void {
        if (!this.nodeRole) {
            throw new Error("Node role is required but was not created");
        }

        // Create an access entry for the node role with EC2 type (required for Auto Mode)
        new aws.eks.AccessEntry(
            `${this.getResourceName()}-node-access`,
            {
                clusterName: this.cluster.name,
                principalArn: this.nodeRole.arn,
                type: "EC2",
                tags: this.mergeTags({ Purpose: "AutoModeNodeAccess" })
            },
            {
                parent: this,
                provider: this.provider,
                dependsOn: [this.cluster, this.nodeRole]
            }
        );

        // Associate the Auto Node policy with the access entry
        new aws.eks.AccessPolicyAssociation(
            `${this.getResourceName()}-node-auto-policy`,
            {
                clusterName: this.cluster.name,
                principalArn: this.nodeRole.arn,
                policyArn: "arn:aws:eks::aws:cluster-access-policy/AmazonEKSAutoNodePolicy",
                accessScope: {
                    type: "cluster"
                }
            },
            {
                parent: this,
                provider: this.provider,
                dependsOn: [this.cluster, this.nodeRole]
            }
        );

        pulumi.log.info("EKS Auto Mode node role access entry created with AmazonEKSAutoNodePolicy");
    }

    /**
     * Create EKS cluster
     */
    private createCluster(args: EKSComponentArgs): aws.eks.Cluster {
        const clusterConfig: aws.eks.ClusterArgs = {
            name: args.clusterName,
            version: args.version || "1.34",
            roleArn: this.clusterRole.arn,
            vpcConfig: {
                subnetIds: args.subnetIds || [],
                endpointPrivateAccess: args.endpointConfig?.privateAccess ?? true,
                endpointPublicAccess: args.endpointConfig?.publicAccess ?? true,
                publicAccessCidrs: args.endpointConfig?.publicAccessCidrs ?? ["0.0.0.0/0"]
            },
            tags: this.mergeTags()
        };

        // Add encryption configuration if provided
        if (args.encryptionConfig) {
            clusterConfig.encryptionConfig = args.encryptionConfig;
        }

        // Add CloudWatch logging if enabled
        if (args.enableCloudWatchLogging) {
            clusterConfig.enabledClusterLogTypes = args.logTypes || [
                "api", "audit", "authenticator", "controllerManager", "scheduler"
            ];
        }

        // Enable EKS Auto Mode if specified
        if (args.autoMode?.enabled) {
            if (!this.nodeRole) {
                throw new Error("Node role is required for EKS Auto Mode but was not created");
            }

            clusterConfig.computeConfig = {
                enabled: true,
                nodePools: args.autoMode.nodePools || ["general-purpose"],
                nodeRoleArn: this.nodeRole.arn
            };

            // Auto Mode requires all three configs to be explicitly set
            clusterConfig.kubernetesNetworkConfig = {
                elasticLoadBalancing: {
                    enabled: true
                }
            };

            clusterConfig.storageConfig = {
                blockStorage: {
                    enabled: true
                }
            };

            // Auto Mode requires API authentication mode
            clusterConfig.accessConfig = {
                authenticationMode: "API"
            };

            // Auto Mode requires bootstrapSelfManagedAddons to be false
            clusterConfig.bootstrapSelfManagedAddons = false;

            pulumi.log.info(`EKS Auto Mode enabled with node pools: ${args.autoMode.nodePools?.join(", ") || "general-purpose"}`);
        }

        return new aws.eks.Cluster(
            `${this.getResourceName()}-cluster`,
            clusterConfig,
            {
                parent: this,
                provider: this.provider,
                dependsOn: [this.clusterRole]
            }
        );
    }


    /**
     * Create managed node groups
     */
    private createNodeGroups(args: EKSComponentArgs): void {
        if (!args.nodeGroups || !this.nodeRole) return;

        args.nodeGroups.forEach(nodeGroupConfig => {
            const nodeGroup = new aws.eks.NodeGroup(
                `${this.getResourceName()}-${nodeGroupConfig.name}`,
                {
                    clusterName: this.cluster.name,
                    nodeGroupName: nodeGroupConfig.name,
                    nodeRoleArn: this.nodeRole!.arn,
                    subnetIds: nodeGroupConfig.subnetIds || args.subnetIds || [],
                    instanceTypes: nodeGroupConfig.instanceTypes,
                    scalingConfig: nodeGroupConfig.scalingConfig,
                    diskSize: nodeGroupConfig.diskSize || 20,
                    amiType: nodeGroupConfig.amiType || "AL2023_x86_64_STANDARD",
                    capacityType: nodeGroupConfig.capacityType || "ON_DEMAND",
                    tags: this.mergeTags(nodeGroupConfig.tags)
                },
                {
                    parent: this,
                    provider: this.provider,
                    dependsOn: [this.cluster, this.nodeRole!]
                }
            );

            this.nodeGroups.push(nodeGroup);
        });
    }

    /**
     * Install EKS addons
     *
     * Note: When Auto Mode is enabled, the following addons are automatically managed by AWS:
     * - vpc-cni
     * - coredns
     * - kube-proxy
     * - aws-ebs-csi-driver
     *
     * This method will skip these addons if Auto Mode is enabled.
     */
    private installAddons(args: EKSComponentArgs): void {
        if (!args.addons) return;

        // Addons that are automatically managed by Auto Mode
        const autoModeManagedAddons = [
            'vpc-cni',
            'coredns',
            'kube-proxy',
            'aws-ebs-csi-driver'
        ];

        args.addons.forEach(addonName => {
            // Skip Auto Mode-managed addons if Auto Mode is enabled
            if (args.autoMode?.enabled && autoModeManagedAddons.includes(addonName)) {
                pulumi.log.info(`Skipping addon '${addonName}' - automatically managed by EKS Auto Mode`);
                return;
            }

            // Install the addon (either Auto Mode is disabled, or this is a non-managed addon)
            new aws.eks.Addon(
                `${this.getResourceName()}-addon-${addonName}`,
                {
                    clusterName: this.cluster.name,
                    addonName: addonName,
                    resolveConflictsOnCreate: "OVERWRITE",
                    resolveConflictsOnUpdate: "OVERWRITE",
                    tags: this.mergeTags({ Addon: addonName })
                },
                {
                    parent: this,
                    provider: this.provider,
                    dependsOn: [this.cluster]
                }
            );
        });
    }

    /**
     * Generate kubeconfig for the cluster
     */
    private generateKubeconfig(roleArn?: pulumi.Input<string>): pulumi.Output<any> {
        return generateEKSKubeconfig({
            clusterName: this.cluster.name,
            clusterEndpoint: this.cluster.endpoint,
            clusterCertificateAuthority: this.cluster.certificateAuthority.apply(ca => ca.data),
            region: this.region,
            roleArn: roleArn
        });
    }

    /**
     * Get cluster OIDC issuer URL for service account integration
     */
    public getOidcIssuerUrl(): pulumi.Output<string> {
        return this.oidcIssuerUrl;
    }

    /**
     * Get cluster security group ID
     */
    public getClusterSecurityGroupId(): pulumi.Output<string> {
        return this.clusterSecurityGroupId;
    }

    /**
     * Get node group ARNs
     */
    public getNodeGroupArns(): pulumi.Output<string[]> | undefined {
        return this.nodeGroupArns;
    }
}