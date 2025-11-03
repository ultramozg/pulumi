import * as automation from "@pulumi/pulumi/automation";
import { DeploymentOrchestrator, ConfigManager, DeploymentConfig, DeploymentSummary } from './automation';
import { RecoveryStrategy } from './components/utils/error-handling';
import * as path from 'path';

/**
 * Legacy function for backward compatibility
 */
async function upStack(stackName: string, workDir: string) {
    const stack = await automation.LocalWorkspace.createOrSelectStack({ stackName, workDir });
    await stack.up();
}

/**
 * Enhanced automation API for multi-stack deployment with run-all capabilities
 */
export class InfrastructureAutomation {
    private orchestrator: DeploymentOrchestrator;

    constructor(options?: {
        errorHandling?: {
            strategy?: RecoveryStrategy;
            maxRetries?: number;
            retryDelay?: number;
            backoffMultiplier?: number;
        };
    }) {
        this.orchestrator = new DeploymentOrchestrator(options?.errorHandling);
    }

    /**
     * Deploy all stacks from a configuration file with enhanced options
     */
    async deployFromConfig(configPath: string, options?: {
        parallel?: boolean;
        dryRun?: boolean;
        refresh?: boolean;
        continueOnFailure?: boolean;
        rollbackOnFailure?: boolean;
    }): Promise<DeploymentSummary> {
        return this.orchestrator.deployFromConfig(configPath, options);
    }

    /**
     * Deploy all stacks from a configuration object with enhanced options
     */
    async deployAll(config: DeploymentConfig, options?: {
        parallel?: boolean;
        dryRun?: boolean;
        refresh?: boolean;
        continueOnFailure?: boolean;
        rollbackOnFailure?: boolean;
    }): Promise<DeploymentSummary> {
        return this.orchestrator.deployAll(config, options);
    }

    /**
     * Destroy all stacks from a configuration with parallel support
     */
    async destroyAll(config: DeploymentConfig, options?: {
        parallel?: boolean;
    }): Promise<DeploymentSummary> {
        return this.orchestrator.destroyAll(config, options);
    }

    /**
     * Preview all stacks from a configuration
     */
    async previewAll(config: DeploymentConfig, options?: {
        parallel?: boolean;
        refresh?: boolean;
        verbose?: boolean;
    }): Promise<DeploymentSummary> {
        return this.orchestrator.deployAll(config, {
            ...options,
            dryRun: true
        });
    }

    /**
     * Create a deployment configuration programmatically
     */
    createConfig(name: string, stacks: any[], options?: {
        defaultRegion?: string;
        defaultTags?: Record<string, string>;
    }): DeploymentConfig {
        return ConfigManager.createConfig(name, stacks, options);
    }

    /**
     * Create a deployment configuration for all components
     */
    createComponentsConfig(name: string, options?: {
        region?: string;
        tags?: Record<string, string>;
        includeComponents?: string[];
        excludeComponents?: string[];
    }): DeploymentConfig {
        const region = options?.region || 'us-east-1';
        const tags = options?.tags || {};

        // Define all available components
        const allComponents = [
            'ipam', 'vpc', 'ecr', 'route53', 'acm', 'rds', 'eks'
        ];

        let componentsToInclude = allComponents;

        if (options?.includeComponents) {
            componentsToInclude = options.includeComponents.filter(c =>
                allComponents.includes(c));
        }

        if (options?.excludeComponents) {
            componentsToInclude = componentsToInclude.filter(c =>
                !options.excludeComponents!.includes(c));
        }

        const stacks = componentsToInclude.map(component => ({
            name: `${component}-stack`,
            workDir: `./examples/${component}-example`,
            components: [{
                type: component,
                name: `${component}-component`,
                config: this.getDefaultComponentConfig(component, region)
            }],
            tags: { ...tags, Component: component }
        }));

        return {
            name,
            defaultRegion: region,
            defaultTags: tags,
            stacks
        };
    }

    /**
     * Get default configuration for a component
     */
    private getDefaultComponentConfig(component: string, region: string): Record<string, any> {
        const configs: Record<string, Record<string, any>> = {
            ipam: {
                cidrBlocks: ['10.0.0.0/8'],
                shareWithOrganization: false,
                operatingRegions: [region]
            },
            vpc: {
                region,
                cidrBlock: '10.0.0.0/16',
                internetGatewayEnabled: true,
                natGatewayEnabled: false,
                availabilityZoneCount: 2,
                subnets: {
                    public: { type: 'public', cidrPrefix: 24 },
                    private: { type: 'private', cidrPrefix: 24 }
                }
            },
            ecr: {
                repositories: [{ name: 'default-repo', shareWithOrganization: false }],
                replicationEnabled: false,
                sourceRegion: region,
                destinationRegion: region
            },
            route53: {
                hostedZones: [{ name: 'example.com', private: false }]
            },
            acm: {
                region,
                certificates: [{
                    domainName: '*.example.com',
                    validationMethod: 'DNS'
                }]
            },
            rds: {
                globalClusterIdentifier: 'default-global-db',
                engine: 'aurora-postgresql',
                regions: [{
                    region,
                    isPrimary: true,
                    createSecurityGroup: true
                }]
            },
            eks: {
                region,
                clusterName: 'default-cluster',
                autoModeEnabled: true,
                addons: ['vpc-cni', 'coredns', 'kube-proxy'],
                nodeGroups: [{
                    name: 'default',
                    instanceTypes: ['t3.medium'],
                    scalingConfig: { minSize: 1, maxSize: 3, desiredSize: 1 }
                }]
            }
        };

        return configs[component] || {};
    }
}

/**
 * Legacy main function for backward compatibility
 */
async function legacyMain() {
    await upStack("shared-services", "./shared-services");
    await upStack("workloads", "./workloads");
}

/**
 * Enhanced main function using the new automation API
 */
async function main() {
    const automation = new InfrastructureAutomation();

    // Create a deployment configuration for existing stacks
    const config = automation.createConfig("default-deployment", [
        {
            name: "shared-services",
            workDir: "./shared-services",
            components: [
                {
                    type: "shared-services",
                    name: "shared-services",
                    config: {}
                }
            ]
        },
        {
            name: "workloads",
            workDir: "./workloads",
            dependencies: ["shared-services"],
            components: [
                {
                    type: "workloads",
                    name: "workloads",
                    config: {}
                }
            ]
        }
    ]);

    // Deploy all stacks with dependency resolution
    await automation.deployAll(config, {
        parallel: true,
        refresh: false
    });
}

// Export the automation class and legacy functions
export { upStack, legacyMain };
export * from './automation';

// Run main if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}