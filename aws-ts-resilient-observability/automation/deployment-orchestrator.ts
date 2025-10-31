import * as automation from "@pulumi/pulumi/automation";
import { DependencyResolver } from './dependency-resolver';
import { ConfigManager } from './config-manager';
import { 
    DeploymentConfig, 
    StackConfig, 
    DeploymentResult, 
    DeploymentSummary
} from './types';
import { validateRoleAssumption } from '../components/utils/aws-provider';
import { 
    DeploymentLogger, 
    MetricsCollector, 
    PerformanceMonitor 
} from '../components/utils/logging';
import { 
    ErrorHandler, 
    RecoveryStrategy, 
    RecoveryOptions,
    ComponentError
} from '../components/utils/error-handling';

/**
 * Deployment orchestration logic for run-all functionality
 */
export class DeploymentOrchestrator {
    private dependencyResolver: DependencyResolver;
    private logger?: DeploymentLogger;
    private metricsCollector?: MetricsCollector;
    private errorHandlingOptions: RecoveryOptions;
    
    constructor(errorHandlingOptions?: Partial<RecoveryOptions>) {
        this.dependencyResolver = new DependencyResolver();
        this.errorHandlingOptions = {
            strategy: RecoveryStrategy.RETRY,
            maxRetries: 3,
            retryDelay: 5000, // 5 seconds for stack operations
            backoffMultiplier: 2,
            ...errorHandlingOptions
        };
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
            continueOnFailure?: boolean;
            rollbackOnFailure?: boolean;
        }
    ): Promise<DeploymentSummary> {
        // Initialize logging and metrics
        this.logger = new DeploymentLogger(config.name);
        this.metricsCollector = new MetricsCollector(config.name);
        
        const monitor = PerformanceMonitor.start('deployment', this.logger);
        const results: DeploymentResult[] = [];
        
        this.logger.deploymentStart(config.stacks.length);
        
        try {
            // Validate configuration
            this.validateDeploymentConfig(config);
            
            // Validate role access
            await this.validateRoleAccess(config);
            
            // Resolve dependencies and create deployment groups
            const deploymentGroups = await this.resolveDependenciesWithErrorHandling(config.stacks);
            
            this.logger.dependencyResolution(
                deploymentGroups.length, 
                deploymentGroups.map(group => group.map(s => s.name))
            );
            
            // Deploy each group in sequence, stacks within a group in parallel
            for (let i = 0; i < deploymentGroups.length; i++) {
                const group = deploymentGroups[i];
                const groupIndex = i + 1;
                
                this.logger.groupDeploymentStart(
                    groupIndex, 
                    deploymentGroups.length, 
                    group.map(s => s.name)
                );
                
                const groupResults = await this.deployGroup(group, options);
                results.push(...groupResults);
                
                // Analyze group results
                const successfulStacks = groupResults.filter(r => r.success).map(r => r.stackName);
                const failedStacks = groupResults.filter(r => !r.success).map(r => r.stackName);
                
                this.logger.groupDeploymentComplete(groupIndex, successfulStacks, failedStacks);
                
                // Handle group failures
                if (failedStacks.length > 0) {
                    if (options?.rollbackOnFailure) {
                        await this.handleRollback(successfulStacks, `Group ${groupIndex} deployment failed`);
                    }
                    
                    if (!options?.continueOnFailure) {
                        this.logger.error(`Stopping deployment due to failures in group ${groupIndex}`, 
                            new Error(`Failed stacks: ${failedStacks.join(', ')}`));
                        break;
                    }
                }
            }
            
        } catch (error) {
            const deploymentError = error instanceof Error ? error : new Error(String(error));
            this.logger.error("Deployment orchestration failed", deploymentError);
            
            if (options?.rollbackOnFailure) {
                const successfulStacks = results.filter(r => r.success).map(r => r.stackName);
                await this.handleRollback(successfulStacks, "Deployment orchestration failure");
            }
            
            throw new ComponentError(
                'DeploymentOrchestrator',
                config.name,
                `Deployment failed: ${deploymentError.message}`,
                'DEPLOYMENT_FAILED',
                { originalError: deploymentError.message }
            );
        }
        
        const totalDuration = monitor.end();
        const summary: DeploymentSummary = {
            deploymentName: config.name,
            totalStacks: config.stacks.length,
            successfulStacks: results.filter(r => r.success).length,
            failedStacks: results.filter(r => !r.success).length,
            results,
            totalDuration
        };
        
        this.logger.deploymentComplete(summary.successfulStacks, summary.failedStacks, totalDuration);
        this.printSummary(summary);
        
        // Export metrics if collection is enabled
        if (this.metricsCollector) {
            const metrics = this.metricsCollector.completeDeployment();
            this.logger.info("Deployment metrics collected", { 
                metricsFile: `deployment-metrics-${config.name}-${Date.now()}.json` 
            });
        }
        
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
            continueOnFailure?: boolean;
        }
    ): Promise<DeploymentResult[]> {
        const parallel = options?.parallel !== false; // Default to parallel
        const continueOnFailure = options?.continueOnFailure !== false; // Default to true
        
        if (parallel && stacks.length > 1 && continueOnFailure) {
            // Deploy stacks in parallel only if we continue on failure
            const promises = stacks.map(stack => this.deployStack(stack, options));
            return Promise.all(promises);
        } else {
            // Deploy stacks sequentially
            const results: DeploymentResult[] = [];
            for (const stack of stacks) {
                const result = await this.deployStack(stack, options);
                results.push(result);
                
                // If continueOnFailure is false and this stack failed, stop here
                if (!continueOnFailure && !result.success) {
                    break;
                }
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
            // Skip logging during tests to avoid async logging issues
            if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                console.log(`   📦 Deploying stack: ${stackConfig.name}`);
            }
            
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
                // Skip logging during tests to avoid async logging issues
                if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                    console.log(`   ✅ Deployed: ${stackConfig.name}`);
                }
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
            // Skip logging during tests to avoid async logging issues
            if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                console.log(`   ❌ Failed to deploy: ${stackConfig.name} - ${error}`);
            }
            
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
    
    /**
     * Validate role access before deployment
     */
    private async validateRoleAccess(config: DeploymentConfig): Promise<void> {
        // Collect unique role ARNs from stacks
        const roleArns = new Set<string>();
        config.stacks.forEach(stack => {
            if (stack.roleArn) {
                roleArns.add(stack.roleArn);
            }
        });

        if (roleArns.size === 0) {
            this.logger?.info('No role ARNs found, using default AWS credentials');
            return;
        }

        this.logger?.info(`Validating role access for ${roleArns.size} roles...`);
        
        const validationPromises = Array.from(roleArns).map(async (roleArn) => {
            try {
                await validateRoleAssumption(roleArn);
                this.logger?.info(`✅ Role access validated: ${roleArn}`);
            } catch (error) {
                const errorMessage = `❌ Role access validation failed: ${roleArn} - ${error}`;
                this.logger?.error(errorMessage, error instanceof Error ? error : new Error(String(error)));
                throw new ComponentError(
                    'DeploymentOrchestrator',
                    config.name,
                    errorMessage,
                    'ROLE_ACCESS_FAILED'
                );
            }
        });

        await Promise.all(validationPromises);
        this.logger?.info('All role access validations passed');
    }

    /**
     * Validate deployment configuration
     */
    private validateDeploymentConfig(config: DeploymentConfig): void {
        if (!config.name || config.name.trim().length === 0) {
            throw new ComponentError(
                'DeploymentOrchestrator',
                'unknown',
                'Deployment name is required',
                'INVALID_CONFIG'
            );
        }

        if (!config.stacks || config.stacks.length === 0) {
            throw new ComponentError(
                'DeploymentOrchestrator',
                config.name,
                'At least one stack must be specified',
                'INVALID_CONFIG'
            );
        }

        // Validate each stack configuration
        config.stacks.forEach((stack, index) => {
            if (!stack.name || stack.name.trim().length === 0) {
                throw new ComponentError(
                    'DeploymentOrchestrator',
                    config.name,
                    `Stack at index ${index} must have a name`,
                    'INVALID_STACK_CONFIG'
                );
            }

            if (!stack.workDir || stack.workDir.trim().length === 0) {
                throw new ComponentError(
                    'DeploymentOrchestrator',
                    config.name,
                    `Stack '${stack.name}' must have a workDir`,
                    'INVALID_STACK_CONFIG'
                );
            }
        });
    }

    /**
     * Resolve dependencies with error handling
     */
    private async resolveDependenciesWithErrorHandling(stacks: StackConfig[]): Promise<StackConfig[][]> {
        return ErrorHandler.executeWithRecovery(
            async () => {
                return this.dependencyResolver.resolveDependencies(stacks);
            },
            'dependency-resolution',
            'DeploymentOrchestrator',
            this.logger?.deploymentName || 'unknown',
            {
                strategy: RecoveryStrategy.FAIL_FAST,
                maxRetries: 1
            }
        );
    }

    /**
     * Deploy group with enhanced error handling
     */
    private async deployGroupWithErrorHandling(
        stacks: StackConfig[],
        options?: {
            parallel?: boolean;
            dryRun?: boolean;
            refresh?: boolean;
        },
        groupIndex?: number,
        totalGroups?: number
    ): Promise<DeploymentResult[]> {
        const parallel = options?.parallel !== false; // Default to parallel
        
        if (parallel && stacks.length > 1) {
            // Deploy stacks in parallel with individual error handling
            const promises = stacks.map(stack => 
                this.deployStackWithErrorHandling(stack, options, groupIndex, totalGroups)
            );
            return Promise.all(promises);
        } else {
            // Deploy stacks sequentially
            const results: DeploymentResult[] = [];
            for (const stack of stacks) {
                const result = await this.deployStackWithErrorHandling(stack, options, groupIndex, totalGroups);
                results.push(result);
                
                // For sequential deployment, stop on first failure unless continueOnFailure is set
                if (!result.success && !options?.dryRun) {
                    this.logger?.warn(`Sequential deployment stopped due to failure in stack: ${stack.name}`);
                    break;
                }
            }
            return results;
        }
    }

    /**
     * Deploy stack with comprehensive error handling
     */
    private async deployStackWithErrorHandling(
        stackConfig: StackConfig,
        options?: {
            dryRun?: boolean;
            refresh?: boolean;
        },
        groupIndex?: number,
        totalGroups?: number
    ): Promise<DeploymentResult> {
        if (this.metricsCollector) {
            this.metricsCollector.startStack(stackConfig.name);
        }

        this.logger?.stackDeploymentStart(stackConfig.name, groupIndex || 1, totalGroups || 1);
        
        return ErrorHandler.executeWithRecovery(
            async () => {
                return this.deployStack(stackConfig, options);
            },
            `deploy-stack-${stackConfig.name}`,
            'DeploymentOrchestrator',
            stackConfig.name,
            {
                ...this.errorHandlingOptions,
                skipCondition: (error: Error) => {
                    // Skip retry for certain types of errors
                    return error.message.includes('already exists') ||
                           error.message.includes('permission denied') ||
                           error.message.includes('invalid configuration');
                }
            }
        ).then(result => {
            if (this.metricsCollector) {
                this.metricsCollector.completeStack(
                    stackConfig.name, 
                    result.success, 
                    result.error,
                    result.outputs ? Object.keys(result.outputs).length : 0
                );
            }

            if (result.success) {
                this.logger?.stackDeploymentSuccess(stackConfig.name, result.duration || 0, result.outputs);
            } else {
                this.logger?.stackDeploymentFailure(
                    stackConfig.name, 
                    new Error(result.error || 'Unknown error'), 
                    result.duration || 0
                );
            }

            return result;
        }).catch(error => {
            const deploymentError = error instanceof Error ? error : new Error(String(error));
            const result: DeploymentResult = {
                stackName: stackConfig.name,
                success: false,
                error: deploymentError.message,
                duration: 0
            };

            if (this.metricsCollector) {
                this.metricsCollector.completeStack(stackConfig.name, false, deploymentError.message);
            }

            this.logger?.stackDeploymentFailure(stackConfig.name, deploymentError, 0);
            return result;
        });
    }

    /**
     * Handle rollback operations
     */
    private async handleRollback(successfulStacks: string[], reason: string): Promise<void> {
        if (successfulStacks.length === 0) {
            return;
        }

        this.logger?.rollbackStart(reason);
        if (this.metricsCollector) {
            this.metricsCollector.recordRollback();
        }

        const rollbackMonitor = PerformanceMonitor.start('rollback', this.logger!);

        try {
            // Rollback in reverse order
            for (const stackName of successfulStacks.reverse()) {
                try {
                    this.logger?.warn(`Rolling back stack: ${stackName}`);
                    
                    const stack = await automation.LocalWorkspace.createOrSelectStack({
                        stackName: stackName,
                        workDir: '.' // This would need to be resolved from original config
                    });
                    
                    await stack.destroy();
                    this.logger?.info(`Successfully rolled back stack: ${stackName}`);
                } catch (rollbackError) {
                    this.logger?.error(
                        `Failed to rollback stack: ${stackName}`, 
                        rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
                    );
                    // Continue with other rollbacks even if one fails
                }
            }

            const duration = rollbackMonitor.end();
            this.logger?.rollbackComplete(true, duration);
        } catch (error) {
            const duration = rollbackMonitor.end();
            this.logger?.rollbackComplete(false, duration);
            throw error;
        }
    }

    private printSummary(summary: DeploymentSummary): void {
        // Skip logging during tests to avoid async logging issues
        if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
            return;
        }
        
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