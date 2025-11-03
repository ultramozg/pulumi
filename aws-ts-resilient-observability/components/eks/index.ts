import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs, validateRequired, validateRegion } from "../base";
import { ComputeOutputs } from "../interfaces";

/**
 * EKS Node Group configuration
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
 * EC2NodeClass configuration for EKS auto mode
 */
export interface EC2NodeClassConfig {
    name: string;
    instanceStorePolicy?: "RAID0" | "NVME";
    userData?: string;
    amiFamily?: "AL2" | "AL2023" | "BOTTLEROCKET" | "UBUNTU" | "WINDOWS_CORE" | "WINDOWS_FULL";
    subnetSelectorTerms?: {
        tags?: { [key: string]: string };
    }[];
    securityGroupSelectorTerms?: {
        tags?: { [key: string]: string };
    }[];
    role?: string;
    tags?: { [key: string]: string };
}

/**
 * NodePool configuration for EKS auto mode
 */
export interface NodePoolConfig {
    name: string;
    nodeClassRef: string;
    requirements?: {
        key: string;
        operator: "In" | "NotIn" | "Exists" | "DoesNotExist" | "Gt" | "Lt";
        values?: string[];
    }[];
    limits?: {
        cpu?: string;
        memory?: string;
    };
    disruption?: {
        consolidationPolicy?: "WhenEmpty" | "WhenUnderutilized";
        consolidateAfter?: string;
        expireAfter?: string;
    };
    weight?: number;
    tags?: { [key: string]: string };
}

/**
 * Arguments for EKS Component
 */
export interface EKSComponentArgs extends BaseComponentArgs {
    clusterName: string;
    version?: string;
    autoModeEnabled?: boolean;
    addons?: string[];
    vpcId?: pulumi.Input<string>;
    subnetIds?: pulumi.Input<string[]>;
    endpointConfig?: {
        privateAccess?: boolean;
        publicAccess?: boolean;
        publicAccessCidrs?: string[];
    };
    nodeGroups?: EKSNodeGroupConfig[];
    ec2NodeClasses?: EC2NodeClassConfig[];
    nodePools?: NodePoolConfig[];
    enableCloudWatchLogging?: boolean;
    logTypes?: string[];
    encryptionConfig?: {
        resources: string[];
        provider: {
            keyArn: string;
        };
    };
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
    kubeconfig: pulumi.Output<any>;
}

/**
 * EKS Component with auto mode support and configurable addons
 */
export class EKSComponent extends BaseAWSComponent implements EKSComponentOutputs {
    public readonly clusterName: pulumi.Output<string>;
    public readonly clusterEndpoint: pulumi.Output<string>;
    public readonly clusterArn: pulumi.Output<string>;
    public readonly clusterVersion: pulumi.Output<string>;
    public readonly clusterSecurityGroupId: pulumi.Output<string>;
    public readonly nodeGroupArns?: pulumi.Output<string[]>;
    public readonly oidcIssuerUrl: pulumi.Output<string>;
    public readonly kubeconfig: pulumi.Output<any>;

    private readonly cluster: aws.eks.Cluster;
    private readonly provider: aws.Provider;
    private readonly clusterRole: aws.iam.Role;
    private readonly nodeRole?: aws.iam.Role;
    private readonly nodeGroups: aws.eks.NodeGroup[] = [];

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
        this.clusterRole = this.createClusterRole();

        if (args.nodeGroups && args.nodeGroups.length > 0) {
            this.nodeRole = this.createNodeRole();
        }

        // Create EKS cluster
        this.cluster = this.createCluster(args);

        // Set up auto mode if enabled
        if (args.autoModeEnabled) {
            this.setupAutoMode(args);
        }

        // Create node groups if specified
        if (args.nodeGroups && args.nodeGroups.length > 0) {
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

        if (this.nodeGroups.length > 0) {
            this.nodeGroupArns = pulumi.output(this.nodeGroups.map(ng => ng.arn));
        }

        // Generate kubeconfig
        this.kubeconfig = this.generateKubeconfig();

        // Register outputs
        this.registerOutputs({
            clusterName: this.clusterName,
            clusterEndpoint: this.clusterEndpoint,
            clusterArn: this.clusterArn,
            clusterVersion: this.clusterVersion,
            clusterSecurityGroupId: this.clusterSecurityGroupId,
            nodeGroupArns: this.nodeGroupArns,
            oidcIssuerUrl: this.oidcIssuerUrl,
            kubeconfig: this.kubeconfig
        });
    }

    /**
     * Create EKS cluster service role
     */
    private createClusterRole(): aws.iam.Role {
        const roleName = `${this.getResourceName()}-cluster-role`;
        const role = new aws.iam.Role(
            roleName,
            {
                assumeRolePolicy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Action: "sts:AssumeRole",
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

        // Attach required policies
        new aws.iam.RolePolicyAttachment(
            `${this.getResourceName()}-cluster-policy`,
            {
                role: role.name,
                policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
            },
            { parent: this, provider: this.provider }
        );

        return role;
    }

    /**
     * Create EKS node group service role
     */
    private createNodeRole(): aws.iam.Role {
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
                tags: this.mergeTags({ Role: "EKSNodeGroupServiceRole" })
            },
            { parent: this, provider: this.provider }
        );

        // Attach required policies
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

        return role;
    }

    /**
     * Create EKS cluster
     */
    private createCluster(args: EKSComponentArgs): aws.eks.Cluster {
        const clusterConfig: aws.eks.ClusterArgs = {
            name: args.clusterName,
            version: args.version || "1.31",
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

        // Enable auto mode if specified
        if (args.autoModeEnabled) {
            // Note: EKS auto mode configuration is typically handled through
            // the EKS console or CLI, not directly through Pulumi
            // This is a placeholder for future auto mode support
            pulumi.log.info("EKS auto mode enabled - additional configuration may be required");
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
     * Set up EKS auto mode with EC2NodeClass and NodePool configurations
     */
    private setupAutoMode(args: EKSComponentArgs): void {
        if (!args.autoModeEnabled) return;

        // Create EC2NodeClass resources if specified
        if (args.ec2NodeClasses) {
            args.ec2NodeClasses.forEach(nodeClassConfig => {
                this.createEC2NodeClass(nodeClassConfig);
            });
        }

        // Create NodePool resources if specified
        if (args.nodePools) {
            args.nodePools.forEach(nodePoolConfig => {
                this.createNodePool(nodePoolConfig);
            });
        }
    }

    /**
     * Create EC2NodeClass for EKS auto mode
     */
    private createEC2NodeClass(config: EC2NodeClassConfig): void {
        // Note: EC2NodeClass is typically managed through Karpenter
        // This is a placeholder for the Kubernetes resource that would be applied
        // In a real implementation, this would use the Kubernetes provider

        const nodeClassSpec = {
            apiVersion: "karpenter.k8s.aws/v1beta1",
            kind: "EC2NodeClass",
            metadata: {
                name: config.name,
                labels: config.tags
            },
            spec: {
                amiFamily: config.amiFamily || "AL2",
                instanceStorePolicy: config.instanceStorePolicy,
                userData: config.userData,
                subnetSelectorTerms: config.subnetSelectorTerms,
                securityGroupSelectorTerms: config.securityGroupSelectorTerms,
                role: config.role
            }
        };

        // Store the configuration for later application via kubectl or Kubernetes provider
        // This would typically be applied after cluster creation
        pulumi.log.info(`EC2NodeClass configuration prepared: ${JSON.stringify(nodeClassSpec)}`);
    }

    /**
     * Create NodePool for EKS auto mode
     */
    private createNodePool(config: NodePoolConfig): void {
        // Note: NodePool is typically managed through Karpenter
        // This is a placeholder for the Kubernetes resource that would be applied

        const nodePoolSpec = {
            apiVersion: "karpenter.sh/v1beta1",
            kind: "NodePool",
            metadata: {
                name: config.name,
                labels: config.tags
            },
            spec: {
                template: {
                    spec: {
                        nodeClassRef: {
                            apiVersion: "karpenter.k8s.aws/v1beta1",
                            kind: "EC2NodeClass",
                            name: config.nodeClassRef
                        },
                        requirements: config.requirements
                    }
                },
                limits: config.limits,
                disruption: config.disruption,
                weight: config.weight
            }
        };

        // Store the configuration for later application via kubectl or Kubernetes provider
        pulumi.log.info(`NodePool configuration prepared: ${JSON.stringify(nodePoolSpec)}`);
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
                    amiType: nodeGroupConfig.amiType || "AL2_x86_64",
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
     */
    private installAddons(args: EKSComponentArgs): void {
        if (!args.addons) return;

        args.addons.forEach(addonName => {
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
    private generateKubeconfig(): pulumi.Output<any> {
        return pulumi.all([
            this.cluster.name,
            this.cluster.endpoint,
            this.cluster.certificateAuthority
        ]).apply(([name, endpoint, ca]) => ({
            apiVersion: "v1",
            kind: "Config",
            clusters: [{
                cluster: {
                    server: endpoint,
                    "certificate-authority-data": ca?.data || "LS0tLS1CRUdJTi..."
                },
                name: "kubernetes"
            }],
            contexts: [{
                context: {
                    cluster: "kubernetes",
                    user: "aws"
                },
                name: "aws"
            }],
            "current-context": "aws",
            users: [{
                name: "aws",
                user: {
                    exec: {
                        apiVersion: "client.authentication.k8s.io/v1beta1",
                        command: "aws",
                        args: [
                            "eks",
                            "get-token",
                            "--cluster-name",
                            name,
                            "--region",
                            this.region
                        ]
                    }
                }
            }]
        }));
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