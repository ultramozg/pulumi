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
 * Example: EKS cluster with Auto Mode (AWS-managed node provisioning)
 */
export function createAutoModeEKSCluster(): EKSComponent {
    const args: EKSComponentArgs = {
        clusterName: "auto-mode-cluster",
        version: "1.34",
        region: "us-west-2",
        autoMode: {
            enabled: true,
            nodePools: ["general-purpose", "system"]
        },
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
        addons: [
            "vpc-cni",
            "coredns",
            "kube-proxy",
            "aws-ebs-csi-driver",
            "aws-efs-csi-driver"
        ],
        tags: {
            Environment: "production",
            Team: "platform",
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