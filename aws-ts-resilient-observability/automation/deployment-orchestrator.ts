import * as automation from "@pulumi/pulumi/automation";
import { DependencyResolver } from './dependency-resolver';
import { ConfigManager } from './config-manager';
import { 
    DeploymentConfig, 
    StackConfig, 
    DeploymentResult, 
    DeploymentSummary 
} from './types';

/**
 * Deployment orchestration logic for run-all functionality
 */
export class DeploymentOrchestrator {
    private dependencyResolver: DependencyResolver;
    
    constructor() {
        this.dependencyResolver = new DependencyResolver();
    }
    
    /**
     * Deploy all stacks from a configuration file
     * @param configPath Path to deployment configuration file
     * @param options Deployment options
     * @returns Deployment summary
     */
    public async deployFromConfig(
        configPath: string,
        options?: {
            parallel?: boolean;
            dryRun?: boolean;
            refresh?: boolean;
        }
    ): Promise<DeploymentSummary> {
        const config = ConfigManager.loadConfig(configPath);
        return this.deployAll(config, options);
    }
    
    /**
     * Deploy all stacks from a deployment configuration
     * @param config Deployment configuration
     * @param options Deployment options
     * @returns Deployment summary
     */
    public async deployAll(
        config: DeploymentConfig,
        options?: {
            parallel?: boolean;
            dryRun?: boolean;
            refresh?: boolean;
        }
    ): Promise<DeploymentSummary> {
        const startTime = Date.now();
        const results: DeploymentResult[] = [];
        
        console.log(`🚀 Starting deployment: ${config.name}`);
        console.log(`📦 Total stacks: ${config.stacks.length}`);
        
        try {
            // Resolve dependencies and create deployment groups
            const deploymentGroups = this.dependencyResolver.resolveDependencies(config.stacks);
            
            console.log(`📋 Deployment groups: ${deploymentGroups.length}`);
            deploymentGroups.forEach((group, index) => {
                console.log(`   Group ${index + 1}: ${group.map(s => s.name).join(', ')}`);
            });
            
            // Deploy each group in sequence, stacks within a group in parallel
            for (let i = 0; i < deploymentGroups.length; i++) {
                const group = deploymentGroups[i];
                console.log(`\n🔄 Deploying group ${i + 1}/${deploymentGroups.length}`);
                
                const groupResults = await this.deployGroup(group, options);
                results.push(...groupResults);
                
                // Check if any stack in the group failed
                const failedStacks = groupResults.filter(r => !r.success);
                if (failedStacks.length > 0) {
                    console.log(`❌ Group ${i + 1} had failures, stopping deployment`);
                    failedStacks.forEach(result => {
                        console.log(`   Failed: ${result.stackName} - ${result.error}`);
                    });
                    break;
                }
            }
            
        } catch (error) {
            console.error(`💥 Deployment orchestration failed: ${error}`);
            throw error;
        }
        
        const endTime = Date.now();
        const summary: DeploymentSummary = {
            deploymentName: config.name,
            totalStacks: config.stacks.length,
            successfulStacks: results.filter(r => r.success).length,
            failedStacks: results.filter(r => !r.success).length,
            results,
            totalDuration: endTime - startTime
        };
        
        this.printSummary(summary);
        return summary;
    }
    
    /**
     * Destroy all stacks from a deployment configuration
     * @param config Deployment configuration
     * @param options Destroy options
     * @returns Deployment summary
     */
    public async destroyAll(
        config: DeploymentConfig,
        options?: {
            parallel?: boolean;
        }
    ): Promise<DeploymentSummary> {
        const startTime = Date.now();
        const results: DeploymentResult[] = [];
        
        console.log(`🗑️  Starting destruction: ${config.name}`);
        
        try {
            // Resolve dependencies and reverse the order for destruction
            const deploymentGroups = this.dependencyResolver.resolveDependencies(config.stacks);
            const destructionGroups = deploymentGroups.reverse();
            
            // Destroy each group in sequence (reverse dependency order)
            for (let i = 0; i < destructionGroups.length; i++) {
                const group = destructionGroups[i];
                console.log(`\n🔄 Destroying group ${i + 1}/${destructionGroups.length}`);
                
                const groupResults = await this.destroyGroup(group, options);
                results.push(...groupResults);
            }
            
        } catch (error) {
            console.error(`💥 Destruction orchestration failed: ${error}`);
            throw error;
        }
        
        const endTime = Date.now();
        const summary: DeploymentSummary = {
            deploymentName: config.name,
            totalStacks: config.stacks.length,
            successfulStacks: results.filter(r => r.success).length,
            failedStacks: results.filter(r => !r.success).length,
            results,
            totalDuration: endTime - startTime
        };
        
        this.printSummary(summary);
        return summary;
    }
    
    private async deployGroup(
        stacks: StackConfig[],
        options?: {
            parallel?: boolean;
            dryRun?: boolean;
            refresh?: boolean;
        }
    ): Promise<DeploymentResult[]> {
        const parallel = options?.parallel !== false; // Default to parallel
        
        if (parallel && stacks.length > 1) {
            // Deploy stacks in parallel
            const promises = stacks.map(stack => this.deployStack(stack, options));
            return Promise.all(promises);
        } else {
            // Deploy stacks sequentially
            const results: DeploymentResult[] = [];
            for (const stack of stacks) {
                const result = await this.deployStack(stack, options);
                results.push(result);
            }
            return results;
        }
    }
    
    private async destroyGroup(
        stacks: StackConfig[],
        options?: {
            parallel?: boolean;
        }
    ): Promise<DeploymentResult[]> {
        const parallel = options?.parallel !== false; // Default to parallel
        
        if (parallel && stacks.length > 1) {
            // Destroy stacks in parallel
            const promises = stacks.map(stack => this.destroyStack(stack));
            return Promise.all(promises);
        } else {
            // Destroy stacks sequentially
            const results: DeploymentResult[] = [];
            for (const stack of stacks) {
                const result = await this.destroyStack(stack);
                results.push(result);
            }
            return results;
        }
    }
    
    private async deployStack(
        stackConfig: StackConfig,
        options?: {
            dryRun?: boolean;
            refresh?: boolean;
        }
    ): Promise<DeploymentResult> {
        const startTime = Date.now();
        
        try {
            console.log(`   📦 Deploying stack: ${stackConfig.name}`);
            
            const stack = await automation.LocalWorkspace.createOrSelectStack({
                stackName: stackConfig.name,
                workDir: stackConfig.workDir
            });
            
            // Set stack configuration if provided
            if (stackConfig.tags) {
                await stack.setAllConfig({
                    ...Object.entries(stackConfig.tags).reduce((acc, [key, value]) => {
                        acc[`aws:tags:${key}`] = { value };
                        return acc;
                    }, {} as Record<string, automation.ConfigValue>)
                });
            }
            
            let outputs: Record<string, any> | undefined;
            
            if (options?.dryRun) {
                await stack.preview();
                console.log(`   ✅ Preview completed for: ${stackConfig.name}`);
            } else {
                if (options?.refresh) {
                    await stack.refresh();
                }
                const result = await stack.up();
                outputs = result.outputs;
                console.log(`   ✅ Deployed: ${stackConfig.name}`);
            }
            
            const endTime = Date.now();
            return {
                stackName: stackConfig.name,
                success: true,
                outputs,
                duration: endTime - startTime
            };
            
        } catch (error) {
            const endTime = Date.now();
            console.log(`   ❌ Failed to deploy: ${stackConfig.name} - ${error}`);
            
            return {
                stackName: stackConfig.name,
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration: endTime - startTime
            };
        }
    }
    
    private async destroyStack(stackConfig: StackConfig): Promise<DeploymentResult> {
        const startTime = Date.now();
        
        try {
            console.log(`   🗑️  Destroying stack: ${stackConfig.name}`);
            
            const stack = await automation.LocalWorkspace.createOrSelectStack({
                stackName: stackConfig.name,
                workDir: stackConfig.workDir
            });
            
            await stack.destroy();
            console.log(`   ✅ Destroyed: ${stackConfig.name}`);
            
            const endTime = Date.now();
            return {
                stackName: stackConfig.name,
                success: true,
                duration: endTime - startTime
            };
            
        } catch (error) {
            const endTime = Date.now();
            console.log(`   ❌ Failed to destroy: ${stackConfig.name} - ${error}`);
            
            return {
                stackName: stackConfig.name,
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration: endTime - startTime
            };
        }
    }
    
    private printSummary(summary: DeploymentSummary): void {
        console.log(`\n📊 Deployment Summary: ${summary.deploymentName}`);
        console.log(`   Total stacks: ${summary.totalStacks}`);
        console.log(`   Successful: ${summary.successfulStacks}`);
        console.log(`   Failed: ${summary.failedStacks}`);
        console.log(`   Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);
        
        if (summary.failedStacks > 0) {
            console.log(`\n❌ Failed stacks:`);
            summary.results
                .filter(r => !r.success)
                .forEach(result => {
                    console.log(`   ${result.stackName}: ${result.error}`);
                });
        }
        
        console.log(`\n✅ Successful stacks:`);
        summary.results
            .filter(r => r.success)
            .forEach(result => {
                const duration = result.duration ? `(${(result.duration / 1000).toFixed(2)}s)` : '';
                console.log(`   ${result.stackName} ${duration}`);
            });
    }
}