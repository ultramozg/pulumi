import * as automation from "@pulumi/pulumi/automation";
import { DeploymentOrchestrator, ConfigManager, DeploymentConfig } from './automation';

/**
 * Legacy function for backward compatibility
 */
async function upStack(stackName: string, workDir: string) {
    const stack = await automation.LocalWorkspace.createOrSelectStack({ stackName, workDir });
    await stack.up();
}

/**
 * Enhanced automation API for multi-stack deployment
 */
export class InfrastructureAutomation {
    private orchestrator: DeploymentOrchestrator;
    
    constructor() {
        this.orchestrator = new DeploymentOrchestrator();
    }
    
    /**
     * Deploy all stacks from a configuration file
     */
    async deployFromConfig(configPath: string, options?: {
        parallel?: boolean;
        dryRun?: boolean;
        refresh?: boolean;
    }) {
        return this.orchestrator.deployFromConfig(configPath, options);
    }
    
    /**
     * Deploy all stacks from a configuration object
     */
    async deployAll(config: DeploymentConfig, options?: {
        parallel?: boolean;
        dryRun?: boolean;
        refresh?: boolean;
    }) {
        return this.orchestrator.deployAll(config, options);
    }
    
    /**
     * Destroy all stacks from a configuration
     */
    async destroyAll(config: DeploymentConfig, options?: {
        parallel?: boolean;
    }) {
        return this.orchestrator.destroyAll(config, options);
    }
    
    /**
     * Create a deployment configuration programmatically
     */
    createConfig(name: string, stacks: any[], options?: {
        defaultRegion?: string;
        defaultTags?: Record<string, string>;
    }) {
        return ConfigManager.createConfig(name, stacks, options);
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