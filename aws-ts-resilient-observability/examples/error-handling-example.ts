import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../components/vpc";
import { ECRComponent } from "../components/ecr";
import { EKSComponent } from "../components/eks";
import { 
    ComponentLogger, 
    PerformanceMonitor,
    DeploymentLogger 
} from "../components/utils/logging";
import { 
    ErrorHandler, 
    RecoveryStrategy, 
    ValidationUtils,
    ComponentError 
} from "../components/utils/error-handling";

/**
 * Example demonstrating comprehensive error handling and logging
 * across multiple AWS components with various failure scenarios
 */

// Initialize deployment logger
const deploymentLogger = new DeploymentLogger("error-handling-example");

async function deployInfrastructureWithErrorHandling() {
    const monitor = PerformanceMonitor.start("full-deployment", deploymentLogger);
    
    try {
        deploymentLogger.deploymentStart(3); // 3 components to deploy
        
        // Deploy VPC with error handling
        const vpc = await deployVPCWithErrorHandling();
        
        // Deploy ECR with error handling
        const ecr = await deployECRWithErrorHandling();
        
        // Deploy EKS with error handling (depends on VPC)
        const eks = await deployEKSWithErrorHandling(vpc);
        
        const duration = monitor.end();
        deploymentLogger.deploymentComplete(3, 0, duration);
        
        return {
            vpc,
            ecr,
            eks
        };
        
    } catch (error) {
        const duration = monitor.end();
        const deploymentError = error instanceof Error ? error : new Error(String(error));
        
        deploymentLogger.deploymentComplete(0, 3, duration);
        deploymentLogger.error("Deployment failed", deploymentError);
        
        throw new ComponentError(
            'InfrastructureDeployment',
            'error-handling-example',
            `Infrastructure deployment failed: ${deploymentError.message}`,
            'DEPLOYMENT_FAILED'
        );
    }
}

async function deployVPCWithErrorHandling(): Promise<VPCComponent> {
    return ErrorHandler.executeWithRecovery(
        async () => {
            // Simulate potential configuration validation
            const vpcConfig = {
                region: "us-east-1",
                cidrBlock: "10.0.0.0/16",
                internetGatewayEnabled: true,
                natGatewayEnabled: true,
                availabilityZoneCount: 2,
                subnets: {
                    public: {
                        type: 'public' as const,
                        subnetPrefix: 24,
                        availabilityZones: [0, 1]
                    },
                    private: {
                        type: 'private' as const,
                        subnetPrefix: 24,
                        availabilityZones: [0, 1]
                    }
                },
                // Enhanced error handling configuration
                errorHandling: {
                    retryEnabled: true,
                    maxRetries: 3,
                    retryDelay: 2000,
                    recoveryStrategy: RecoveryStrategy.RETRY
                },
                logging: {
                    enablePerformanceMonitoring: true,
                    logLevel: 'info' as const
                }
            };
            
            // Validate configuration before creating component
            ValidationUtils.validateRequired(vpcConfig.region, 'region', 'VPCDeployment', 'error-handling-example');
            ValidationUtils.validateRegion(vpcConfig.region, 'VPCDeployment', 'error-handling-example');
            ValidationUtils.validateCidrBlock(vpcConfig.cidrBlock, 'VPCDeployment', 'error-handling-example');
            ValidationUtils.validateRange(vpcConfig.availabilityZoneCount, 'availabilityZoneCount', 1, 6, 'VPCDeployment', 'error-handling-example');
            
            deploymentLogger.stackDeploymentStart('vpc-component', 1, 3);
            
            const vpc = new VPCComponent("example-vpc", vpcConfig);
            
            deploymentLogger.stackDeploymentSuccess('vpc-component', 0);
            return vpc;
        },
        'deploy-vpc',
        'InfrastructureDeployment',
        'error-handling-example',
        {
            strategy: RecoveryStrategy.RETRY,
            maxRetries: 3,
            retryDelay: 2000,
            backoffMultiplier: 2,
            skipCondition: (error: Error) => {
                // Skip retry for certain AWS errors
                return error.message.includes('already exists') ||
                       error.message.includes('permission denied') ||
                       error.message.includes('invalid vpc');
            },
            rollbackActions: [
                async () => {
                    deploymentLogger.warn("Rolling back VPC resources");
                    // In a real scenario, this would clean up partially created resources
                }
            ]
        }
    );
}

async function deployECRWithErrorHandling(): Promise<ECRComponent> {
    return ErrorHandler.executeWithRecovery(
        async () => {
            const ecrConfig = {
                repositories: [
                    {
                        name: "example-app",
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
                                action: {
                                    type: "expire"
                                }
                            }]
                        })
                    }
                ],
                replicationEnabled: true,
                sourceRegion: "us-east-1",
                destinationRegion: "us-west-2",
                errorHandling: {
                    retryEnabled: true,
                    maxRetries: 2,
                    recoveryStrategy: RecoveryStrategy.RETRY
                }
            };
            
            // Validate ECR configuration
            ValidationUtils.validateNonEmptyArray(ecrConfig.repositories, 'repositories', 'ECRDeployment', 'error-handling-example');
            ValidationUtils.validateRegion(ecrConfig.sourceRegion, 'ECRDeployment', 'error-handling-example');
            ValidationUtils.validateRegion(ecrConfig.destinationRegion, 'ECRDeployment', 'error-handling-example');
            
            deploymentLogger.stackDeploymentStart('ecr-component', 2, 3);
            
            const ecr = new ECRComponent("example-ecr", ecrConfig);
            
            deploymentLogger.stackDeploymentSuccess('ecr-component', 0);
            return ecr;
        },
        'deploy-ecr',
        'InfrastructureDeployment',
        'error-handling-example',
        {
            strategy: RecoveryStrategy.RETRY,
            maxRetries: 2,
            retryDelay: 1500,
            skipCondition: (error: Error) => {
                return error.message.includes('repository already exists') ||
                       error.message.includes('replication configuration already exists');
            }
        }
    );
}

async function deployEKSWithErrorHandling(vpc: VPCComponent): Promise<EKSComponent> {
    return ErrorHandler.executeWithRecovery(
        async () => {
            // Wait for VPC to be ready and get subnet IDs
            const privateSubnetIds = await vpc.getSubnetIdsByType('private');
            
            const eksConfig = {
                clusterName: "example-cluster",
                version: "1.31",
                autoModeEnabled: true,
                addons: ["vpc-cni", "coredns", "kube-proxy"],
                subnetIds: privateSubnetIds,
                endpointConfig: {
                    privateAccess: true,
                    publicAccess: true,
                    publicAccessCidrs: ["0.0.0.0/0"]
                },
                nodeGroups: [{
                    name: "example-nodes",
                    instanceTypes: ["t3.medium"],
                    scalingConfig: {
                        minSize: 1,
                        maxSize: 3,
                        desiredSize: 2
                    },
                    diskSize: 20,
                    capacityType: "ON_DEMAND" as const
                }],
                enableCloudWatchLogging: true,
                logTypes: ["api", "audit", "authenticator"],
                errorHandling: {
                    retryEnabled: true,
                    maxRetries: 3,
                    retryDelay: 5000, // Longer delay for EKS operations
                    recoveryStrategy: RecoveryStrategy.RETRY
                }
            };
            
            // Validate EKS configuration
            ValidationUtils.validateRequired(eksConfig.clusterName, 'clusterName', 'EKSDeployment', 'error-handling-example');
            ValidationUtils.validateNonEmptyArray(eksConfig.addons, 'addons', 'EKSDeployment', 'error-handling-example');
            
            if (eksConfig.nodeGroups) {
                eksConfig.nodeGroups.forEach((nodeGroup, index) => {
                    ValidationUtils.validateRequired(nodeGroup.name, `nodeGroups[${index}].name`, 'EKSDeployment', 'error-handling-example');
                    ValidationUtils.validateNonEmptyArray(nodeGroup.instanceTypes, `nodeGroups[${index}].instanceTypes`, 'EKSDeployment', 'error-handling-example');
                    ValidationUtils.validateRange(nodeGroup.scalingConfig.minSize, `nodeGroups[${index}].scalingConfig.minSize`, 0, 100, 'EKSDeployment', 'error-handling-example');
                    ValidationUtils.validateRange(nodeGroup.scalingConfig.maxSize, `nodeGroups[${index}].scalingConfig.maxSize`, nodeGroup.scalingConfig.minSize, 100, 'EKSDeployment', 'error-handling-example');
                });
            }
            
            deploymentLogger.stackDeploymentStart('eks-component', 3, 3);
            
            const eks = new EKSComponent("example-eks", eksConfig);
            
            deploymentLogger.stackDeploymentSuccess('eks-component', 0);
            return eks;
        },
        'deploy-eks',
        'InfrastructureDeployment',
        'error-handling-example',
        {
            strategy: RecoveryStrategy.RETRY,
            maxRetries: 3,
            retryDelay: 5000,
            backoffMultiplier: 1.5, // Slower backoff for EKS
            skipCondition: (error: Error) => {
                return error.message.includes('cluster already exists') ||
                       error.message.includes('service role does not exist') ||
                       error.message.includes('subnet not found');
            },
            rollbackActions: [
                async () => {
                    deploymentLogger.warn("Rolling back EKS cluster and associated resources");
                    // In a real scenario, this would clean up the EKS cluster
                }
            ]
        }
    );
}

// Example of handling specific error scenarios
async function demonstrateErrorScenarios() {
    const logger = new ComponentLogger('ErrorDemo', 'scenarios');
    
    // Scenario 1: Validation Error
    try {
        ValidationUtils.validateRegion('invalid-region', 'ErrorDemo', 'scenarios');
    } catch (error) {
        logger.error("Validation error caught", error instanceof Error ? error : new Error(String(error)));
    }
    
    // Scenario 2: Resource Creation Error with Retry
    try {
        await ErrorHandler.executeWithRecovery(
            async () => {
                throw new Error("Simulated AWS API throttling");
            },
            'create-resource',
            'ErrorDemo',
            'scenarios',
            {
                strategy: RecoveryStrategy.RETRY,
                maxRetries: 3,
                retryDelay: 1000
            }
        );
    } catch (error) {
        logger.error("Resource creation failed after retries", error instanceof Error ? error : new Error(String(error)));
    }
    
    // Scenario 3: Dependency Resolution Error
    try {
        const baseComponent = new ComponentLogger('BaseComponent', 'base');
        baseComponent.resolveDependency('missing-vpc', 'VPC', () => undefined);
    } catch (error) {
        logger.error("Dependency resolution failed", error instanceof Error ? error : new Error(String(error)));
    }
    
    // Scenario 4: Configuration Error
    try {
        ValidationUtils.validateCidrBlock('256.0.0.0/16', 'ErrorDemo', 'scenarios');
    } catch (error) {
        logger.error("Configuration validation failed", error instanceof Error ? error : new Error(String(error)));
    }
}

// Export the main deployment function
export const infrastructure = deployInfrastructureWithErrorHandling();

// Export error scenario demonstrations
export const errorScenarios = demonstrateErrorScenarios();

// Export individual components for testing
export {
    deployVPCWithErrorHandling,
    deployECRWithErrorHandling,
    deployEKSWithErrorHandling,
    demonstrateErrorScenarios
};