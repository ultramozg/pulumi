import { EKSComponent, EKSComponentArgs } from "../components/eks";

/**
 * Example: Basic EKS cluster with managed node groups
 */
export function createBasicEKSCluster(): EKSComponent {
    const args: EKSComponentArgs = {
        clusterName: "my-eks-cluster",
        version: "1.31",
        region: "us-east-1",
        subnetIds: [
            "subnet-12345678", // Private subnet 1
            "subnet-87654321", // Private subnet 2
            "subnet-abcdef12"  // Private subnet 3
        ],
        endpointConfig: {
            privateAccess: true,
            publicAccess: true,
            publicAccessCidrs: ["0.0.0.0/0"]
        },
        enableCloudWatchLogging: true,
        logTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"],
        nodeGroups: [{
            name: "general-workers",
            instanceTypes: ["t3.medium", "t3.large"],
            scalingConfig: {
                minSize: 1,
                maxSize: 10,
                desiredSize: 3
            },
            diskSize: 50,
            capacityType: "ON_DEMAND"
        }],
        addons: [
            "vpc-cni",
            "coredns",
            "kube-proxy",
            "aws-ebs-csi-driver"
        ],
        tags: {
            Environment: "production",
            Team: "platform",
            Project: "infrastructure"
        }
    };

    return new EKSComponent("basic-eks", args);
}

/**
 * Example: EKS cluster with auto mode and Karpenter configuration
 */
export function createAutoModeEKSCluster(): EKSComponent {
    const args: EKSComponentArgs = {
        clusterName: "auto-mode-cluster",
        version: "1.31",
        region: "us-west-2",
        autoModeEnabled: true,
        subnetIds: [
            "subnet-11111111",
            "subnet-22222222",
            "subnet-33333333"
        ],
        endpointConfig: {
            privateAccess: true,
            publicAccess: false // Private cluster
        },
        enableCloudWatchLogging: true,
        ec2NodeClasses: [{
            name: "default-nodeclass",
            amiFamily: "AL2023",
            instanceStorePolicy: "RAID0",
            subnetSelectorTerms: [{
                tags: { "karpenter.sh/discovery": "auto-mode-cluster" }
            }],
            securityGroupSelectorTerms: [{
                tags: { "karpenter.sh/discovery": "auto-mode-cluster" }
            }],
            tags: {
                NodeClass: "default",
                Environment: "production"
            }
        }, {
            name: "gpu-nodeclass",
            amiFamily: "AL2",
            instanceStorePolicy: "NVME",
            subnetSelectorTerms: [{
                tags: { "karpenter.sh/discovery": "auto-mode-cluster" }
            }],
            securityGroupSelectorTerms: [{
                tags: { "karpenter.sh/discovery": "auto-mode-cluster" }
            }],
            tags: {
                NodeClass: "gpu",
                Environment: "production"
            }
        }],
        nodePools: [{
            name: "general-pool",
            nodeClassRef: "default-nodeclass",
            requirements: [{
                key: "kubernetes.io/arch",
                operator: "In",
                values: ["amd64"]
            }, {
                key: "karpenter.sh/capacity-type",
                operator: "In",
                values: ["on-demand", "spot"]
            }, {
                key: "node.kubernetes.io/instance-type",
                operator: "In",
                values: ["t3.medium", "t3.large", "t3.xlarge"]
            }],
            limits: {
                cpu: "1000",
                memory: "1000Gi"
            },
            disruption: {
                consolidationPolicy: "WhenUnderutilized",
                consolidateAfter: "30s",
                expireAfter: "2160h" // 90 days
            },
            weight: 10
        }, {
            name: "gpu-pool",
            nodeClassRef: "gpu-nodeclass",
            requirements: [{
                key: "kubernetes.io/arch",
                operator: "In",
                values: ["amd64"]
            }, {
                key: "karpenter.sh/capacity-type",
                operator: "In",
                values: ["on-demand"]
            }, {
                key: "node.kubernetes.io/instance-type",
                operator: "In",
                values: ["g4dn.xlarge", "g4dn.2xlarge"]
            }],
            limits: {
                cpu: "100",
                memory: "100Gi"
            },
            disruption: {
                consolidationPolicy: "WhenEmpty",
                expireAfter: "720h" // 30 days
            },
            weight: 5
        }],
        addons: [
            "vpc-cni",
            "coredns",
            "kube-proxy",
            "aws-ebs-csi-driver",
            "aws-efs-csi-driver"
        ],
        tags: {
            Environment: "production",
            Team: "ml-platform",
            Project: "auto-scaling"
        }
    };

    return new EKSComponent("auto-mode-eks", args);
}

/**
 * Example: Multi-region EKS deployment
 */
export function createMultiRegionEKSClusters(): { [region: string]: EKSComponent } {
    const regions = ["us-east-1", "us-west-2", "eu-west-1"];
    const clusters: { [region: string]: EKSComponent } = {};

    regions.forEach(region => {
        const args: EKSComponentArgs = {
            clusterName: `global-cluster-${region}`,
            version: "1.31",
            region: region,
            subnetIds: [
                `subnet-${region}-1`,
                `subnet-${region}-2`,
                `subnet-${region}-3`
            ],
            endpointConfig: {
                privateAccess: true,
                publicAccess: true,
                publicAccessCidrs: ["10.0.0.0/8"] // Restrict to private networks
            },
            enableCloudWatchLogging: true,
            nodeGroups: [{
                name: "regional-workers",
                instanceTypes: ["t3.medium"],
                scalingConfig: {
                    minSize: 2,
                    maxSize: 20,
                    desiredSize: 5
                },
                capacityType: "SPOT" // Cost optimization
            }],
            addons: [
                "vpc-cni",
                "coredns",
                "kube-proxy"
            ],
            tags: {
                Environment: "production",
                Region: region,
                Project: "global-infrastructure"
            }
        };

        clusters[region] = new EKSComponent(`global-eks-${region}`, args);
    });

    return clusters;
}

/**
 * Example: Development EKS cluster with minimal configuration
 */
export function createDevEKSCluster(): EKSComponent {
    const args: EKSComponentArgs = {
        clusterName: "dev-cluster",
        version: "1.31",
        region: "us-east-1",
        subnetIds: ["subnet-dev-1", "subnet-dev-2"],
        endpointConfig: {
            privateAccess: false,
            publicAccess: true,
            publicAccessCidrs: ["0.0.0.0/0"]
        },
        enableCloudWatchLogging: false, // Cost optimization for dev
        nodeGroups: [{
            name: "dev-workers",
            instanceTypes: ["t3.small"],
            scalingConfig: {
                minSize: 1,
                maxSize: 3,
                desiredSize: 1
            },
            capacityType: "SPOT"
        }],
        addons: [
            "vpc-cni",
            "coredns",
            "kube-proxy"
        ],
        tags: {
            Environment: "development",
            Team: "engineering",
            CostCenter: "development"
        }
    };

    return new EKSComponent("dev-eks", args);
}