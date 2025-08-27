import * as pulumi from "@pulumi/pulumi";
import {
    VPCComponent,
    ECRComponent,
    Route53Component,
    ACMComponent,
    EKSComponent
} from "../components";

/**
 * Simple Web Application Stack Example
 * 
 * This example demonstrates how to create a simple but production-ready
 * web application infrastructure with:
 * - VPC with public/private subnets
 * - Container registry for application images
 * - DNS and SSL certificates
 * - EKS cluster for running the application
 */

// Configuration
const config = new pulumi.Config();
const domainName = config.require("domainName"); // e.g., "myapp.com"
const environment = config.get("environment") || "production";
const region = config.get("region") || "us-east-1";

// 1. Create VPC for the application
const appVpc = new VPCComponent("app-vpc", {
    region: region,
    cidrBlock: "10.0.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 2,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8, // Creates /24 subnets (10.0.1.0/24, 10.0.2.0/24)
            availabilityZones: [`${region}a`, `${region}b`]
        },
        private: {
            type: 'private',
            cidrPrefix: 8, // Creates /24 subnets (10.0.11.0/24, 10.0.12.0/24)
            availabilityZones: [`${region}a`, `${region}b`]
        }
    },
    tags: {
        Environment: environment,
        Project: "simple-web-app",
        Purpose: "application-vpc"
    }
});

// 2. Create container registry for application images
const appRegistry = new ECRComponent("app-registry", {
    repositories: [
        {
            name: "web-app",
            shareWithOrganization: false,
            lifecyclePolicy: JSON.stringify({
                rules: [{
                    rulePriority: 1,
                    description: "Keep last 10 images",
                    selection: {
                        tagStatus: "any",
                        countType: "imageCountMoreThan",
                        countNumber: 10
                    },
                    action: { type: "expire" }
                }]
            }),
            tags: {
                Application: "web-app",
                Environment: environment
            }
        }
    ],
    replicationEnabled: false, // Simple setup without replication
    sourceRegion: region,
    destinationRegion: region,
    tags: {
        Environment: environment,
        Project: "simple-web-app"
    }
});

// 3. Create DNS hosted zone
const appDns = new Route53Component("app-dns", {
    hostedZones: [
        {
            name: domainName,
            comment: `DNS zone for ${domainName} web application`
        }
    ],
    records: [
        {
            zoneName: domainName,
            name: "www",
            type: "A",
            values: ["192.0.2.1"], // Placeholder - will be updated with load balancer IP
            ttl: 300
        }
    ],
    region: region,
    tags: {
        Environment: environment,
        Project: "simple-web-app"
    }
});

// 4. Create SSL certificate
const appCertificate = new ACMComponent("app-certificate", {
    region: region,
    certificates: [
        {
            domainName: `*.${domainName}`,
            subjectAlternativeNames: [domainName],
            validationMethod: "DNS",
            hostedZoneId: appDns.getHostedZoneId(domainName)
        }
    ],
    tags: {
        Environment: environment,
        Project: "simple-web-app"
    }
});

// 5. Create EKS cluster for running the application
const appCluster = new EKSComponent("app-cluster", {
    clusterName: `${environment}-web-app`,
    version: "1.31",
    region: region,
    subnetIds: appVpc.getSubnetIdsByName("private"),
    endpointConfig: {
        privateAccess: true,
        publicAccess: true,
        publicAccessCidrs: ["0.0.0.0/0"] // Adjust based on security requirements
    },
    enableCloudWatchLogging: true,
    logTypes: ["api", "audit"],
    nodeGroups: [
        {
            name: "app-nodes",
            instanceTypes: ["t3.medium"],
            scalingConfig: {
                minSize: 2,
                maxSize: 6,
                desiredSize: 2
            },
            diskSize: 50,
            capacityType: "ON_DEMAND"
        }
    ],
    addons: [
        "vpc-cni",
        "coredns",
        "kube-proxy",
        "aws-load-balancer-controller" // For ingress support
    ],
    tags: {
        Environment: environment,
        Project: "simple-web-app",
        Purpose: "application-cluster"
    }
});

// Export outputs for application deployment
export const webAppOutputs = {
    // VPC information
    vpc: {
        id: appVpc.vpcId,
        cidrBlock: appVpc.cidrBlock,
        publicSubnets: appVpc.getSubnetIdsByName("public"),
        privateSubnets: appVpc.getSubnetIdsByName("private")
    },
    
    // Container registry
    containerRegistry: {
        repositoryUrl: appRegistry.getRepositoryUrl("web-app"),
        repositoryArn: appRegistry.getRepositoryArn("web-app")
    },
    
    // DNS and certificates
    dns: {
        hostedZoneId: appDns.getHostedZoneId(domainName),
        nameServers: appDns.getNameServers(domainName),
        domain: domainName
    },
    
    certificates: {
        certificateArn: appCertificate.getCertificateArn(`*.${domainName}`)
    },
    
    // Kubernetes cluster
    kubernetes: {
        clusterName: appCluster.clusterName,
        clusterEndpoint: appCluster.clusterEndpoint,
        clusterArn: appCluster.clusterArn,
        kubeconfig: appCluster.kubeconfig
    }
};

// Export individual components for advanced usage
export {
    appVpc,
    appRegistry,
    appDns,
    appCertificate,
    appCluster
};

// Example Kubernetes deployment configuration
export const kubernetesManifests = {
    // Namespace for the application
    namespace: {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
            name: "web-app",
            labels: {
                environment: environment,
                project: "simple-web-app"
            }
        }
    },
    
    // Deployment for the web application
    deployment: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: {
            name: "web-app",
            namespace: "web-app",
            labels: {
                app: "web-app",
                environment: environment
            }
        },
        spec: {
            replicas: 2,
            selector: {
                matchLabels: {
                    app: "web-app"
                }
            },
            template: {
                metadata: {
                    labels: {
                        app: "web-app"
                    }
                },
                spec: {
                    containers: [{
                        name: "web-app",
                        image: pulumi.interpolate`${appRegistry.getRepositoryUrl("web-app")}:latest`,
                        ports: [{
                            containerPort: 80
                        }],
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
                    }]
                }
            }
        }
    },
    
    // Service for the web application
    service: {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
            name: "web-app-service",
            namespace: "web-app"
        },
        spec: {
            selector: {
                app: "web-app"
            },
            ports: [{
                port: 80,
                targetPort: 80
            }],
            type: "ClusterIP"
        }
    },
    
    // Ingress for external access
    ingress: {
        apiVersion: "networking.k8s.io/v1",
        kind: "Ingress",
        metadata: {
            name: "web-app-ingress",
            namespace: "web-app",
            annotations: {
                "kubernetes.io/ingress.class": "alb",
                "alb.ingress.kubernetes.io/scheme": "internet-facing",
                "alb.ingress.kubernetes.io/target-type": "ip",
                "alb.ingress.kubernetes.io/certificate-arn": pulumi.interpolate`${appCertificate.getCertificateArn(`*.${domainName}`)}`,
                "alb.ingress.kubernetes.io/listen-ports": '[{"HTTP": 80}, {"HTTPS": 443}]',
                "alb.ingress.kubernetes.io/redirect-to-https": "true"
            }
        },
        spec: {
            rules: [{
                host: `www.${domainName}`,
                http: {
                    paths: [{
                        path: "/",
                        pathType: "Prefix",
                        backend: {
                            service: {
                                name: "web-app-service",
                                port: {
                                    number: 80
                                }
                            }
                        }
                    }]
                }
            }]
        }
    }
};