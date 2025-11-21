import * as automation from "@pulumi/pulumi/automation";
import * as path from 'path';
import { DependencyResolver } from './dependency-resolver';
import { ConfigManager } from './config-manager';
import { 
    DeploymentConfig, 
    StackConfig, 
    DeploymentResult, 
    DeploymentSummary
} from './types';
import { validateRoleAssumption } from '../components/shared/utils/aws-provider';
import { 
    DeploymentLogger, 
    MetricsCollector, 
    PerformanceMonitor 
} from '../components/shared/utils/logging';
import { 
    ErrorHandler, 
    RecoveryStrategy, 
    RecoveryOptions,
    ComponentError
} from '../components/shared/utils/error-handling';

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
                
                // Compact group header
                if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                    console.log(`\n🔄 Group ${groupIndex}/${deploymentGroups.length} (${group.length} stacks)`);
                }
                
                this.logger.groupDeploymentStart(
                    groupIndex, 
                    deploymentGroups.length, 
                    group.map(s => s.name)
                );
                
                const groupResults = await this.deployGroup(group, options, config);
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
        },
        deploymentConfig?: DeploymentConfig
    ): Promise<DeploymentResult[]> {
        const parallel = options?.parallel !== false; // Default to parallel
        const continueOnFailure = options?.continueOnFailure !== false; // Default to true
        
        if (parallel && stacks.length > 1 && continueOnFailure) {
            // Deploy stacks in parallel only if we continue on failure
            const promises = stacks.map(stack => this.deployStack(stack, options, deploymentConfig));
            return Promise.all(promises);
        } else {
            // Deploy stacks sequentially
            const results: DeploymentResult[] = [];
            for (const stack of stacks) {
                const result = await this.deployStack(stack, options, deploymentConfig);
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
        },
        deploymentConfig?: DeploymentConfig
    ): Promise<DeploymentResult> {
        const startTime = Date.now();
        
        try {
            // Show stack header
            if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                console.log(`\n📦 Deploying: ${stackConfig.name}`);
                console.log(`🔐 Policy enforcement: enabled (advisory mode)`);
                console.log(`${'─'.repeat(60)}`);
            }
            
            const stack = await automation.LocalWorkspace.createOrSelectStack({
                stackName: stackConfig.stackName || stackConfig.name,
                workDir: stackConfig.workDir
            });
            
            // Explicitly add ESC environment reference for shared-services stacks
            // This ensures the automation API loads secrets from ESC
            if (stackConfig.name.includes('shared-services')) {
                const workspace = stack.workspace;
                try {
                    await workspace.addEnvironments(stackConfig.stackName || stackConfig.name, 'namecheap-credentials');
                    console.log(`✅ ESC environment 'namecheap-credentials' loaded for ${stackConfig.name}`);
                } catch (error) {
                    // Environment might already be added from Pulumi.yaml, that's okay
                    console.log(`Note: ESC environment configuration from Pulumi.yaml`);
                }
            }
            
            // Set up role assumption if roleArn is provided
            if (stackConfig.roleArn) {
                await this.setupRoleAssumption(stackConfig.roleArn, stackConfig.name);
            }
            
            // Set stack configuration if provided
            const configValues: Record<string, automation.ConfigValue> = {};
            
            // Add default tags from deployment config
            if (deploymentConfig?.defaultTags) {
                Object.entries(deploymentConfig.defaultTags).forEach(([key, value]) => {
                    configValues[`tags:${key}`] = { value };
                });
            }
            
            // Add stack-specific tags (these override default tags)
            if (stackConfig.tags) {
                Object.entries(stackConfig.tags).forEach(([key, value]) => {
                    configValues[`tags:${key}`] = { value };
                });
            }
            
            // Add stack-specific configuration based on stack name and deployment config
            if (deploymentConfig) {
                this.setStackSpecificConfig(stackConfig, deploymentConfig, configValues);
            }
            
            // Set all config values at once (no verbose logging)
            if (Object.keys(configValues).length > 0) {
                await stack.setAllConfig(configValues);
            }
            
            let outputs: Record<string, any> | undefined;
            let previewSummary: any = undefined;
            
            if (options?.dryRun) {
                // Show preview with cleaner formatting
                let lastPreviewOutput = '';
                // Get absolute path to policies directory (relative to project root)
                const policiesPath = path.resolve(__dirname, '..', 'policies');
                const previewResult = await stack.preview({
                    policyPacks: [policiesPath],
                    onOutput: (out) => {
                        if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                            // Filter out progress updates, empty lines, and repetitive output
                            const cleanOutput = out.trim();
                            if (cleanOutput && 
                                cleanOutput !== lastPreviewOutput &&
                                !cleanOutput.includes('Previewing') && 
                                !cleanOutput.includes('@ Previewing') &&
                                !cleanOutput.match(/^[\s\n]*$/) &&
                                !cleanOutput.match(/^\s*\.\.\.\s*$/) &&
                                !cleanOutput.match(/^\s*\+\s*$/) &&
                                cleanOutput.length > 3 &&
                                !cleanOutput.match(/^[\s\+\-\~]*$/)) {
                                console.log(cleanOutput);
                                lastPreviewOutput = cleanOutput;
                            }
                        }
                    }
                });
                previewSummary = previewResult.changeSummary;
                
                // Show preview completion
                if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(`${'─'.repeat(60)}`);
                    console.log(`🔍 Preview completed: ${stackConfig.name} (${duration}s)`);
                }
            } else {
                if (options?.refresh) {
                    await stack.refresh();
                }
                // Show Pulumi output with cleaner formatting
                let lastOutput = '';
                // Get absolute path to policies directory (relative to project root)
                const policiesPath = path.resolve(__dirname, '..', 'policies');
                const result = await stack.up({
                    policyPacks: [policiesPath],
                    onOutput: (out) => {
                        if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                            // Filter out progress updates, empty lines, and repetitive output
                            const cleanOutput = out.trim();
                            if (cleanOutput && 
                                cleanOutput !== lastOutput &&
                                !cleanOutput.includes('Updating') && 
                                !cleanOutput.includes('@ Updating') &&
                                !cleanOutput.match(/^[\s\n]*$/) &&
                                !cleanOutput.match(/^\s*\.\.\.\s*$/) &&
                                !cleanOutput.match(/^\s*\+\s*$/) &&
                                cleanOutput.length > 3 &&
                                !cleanOutput.match(/^[\s\+\-\~]*$/)) {
                                console.log(cleanOutput);
                                lastOutput = cleanOutput;
                            }
                        }
                    }
                });
                outputs = result.outputs;
                
                // Show completion status
                if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(`${'─'.repeat(60)}`);
                    console.log(`✅ Completed: ${stackConfig.name} (${duration}s)`);
                }
            }
            
            const endTime = Date.now();
            return {
                stackName: stackConfig.name,
                success: true,
                outputs,
                previewSummary,
                duration: endTime - startTime
            };
            
        } catch (error) {
            const endTime = Date.now();
            // Show error with context
            if (!(process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)) {
                const duration = ((endTime - startTime) / 1000).toFixed(1);
                console.log(`${'─'.repeat(60)}`);
                console.log(`❌ Failed: ${stackConfig.name} (${duration}s)`);
                console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
            // Show destruction header
            console.log(`\n🗑️  Destroying: ${stackConfig.name}`);
            console.log(`${'─'.repeat(60)}`);
            
            const stack = await automation.LocalWorkspace.createOrSelectStack({
                stackName: stackConfig.stackName || stackConfig.name,
                workDir: stackConfig.workDir
            });
            
            // Set up role assumption if roleArn is provided (CRITICAL for cross-account destroy)
            if (stackConfig.roleArn) {
                await this.setupRoleAssumption(stackConfig.roleArn, stackConfig.name);
            }
            
            // Show destruction output
            let lastDestroyOutput = '';
            await stack.destroy({
                onOutput: (out) => {
                    // Filter out progress updates, empty lines, and repetitive output
                    const cleanOutput = out.trim();
                    if (cleanOutput && 
                        cleanOutput !== lastDestroyOutput &&
                        !cleanOutput.includes('Destroying') && 
                        !cleanOutput.includes('@ Destroying') &&
                        !cleanOutput.match(/^[\s\n]*$/) &&
                        !cleanOutput.match(/^\s*\.\.\.\s*$/) &&
                        !cleanOutput.match(/^\s*\-\s*$/) &&
                        cleanOutput.length > 3 &&
                        !cleanOutput.match(/^[\s\+\-\~]*$/)) {
                        console.log(cleanOutput);
                        lastDestroyOutput = cleanOutput;
                    }
                }
            });
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`${'─'.repeat(60)}`);
            console.log(`✅ Destroyed: ${stackConfig.name} (${duration}s)`);
            
            const endTime = Date.now();
            return {
                stackName: stackConfig.name,
                success: true,
                duration: endTime - startTime
            };
            
        } catch (error) {
            const endTime = Date.now();
            const duration = ((endTime - startTime) / 1000).toFixed(1);
            console.log(`${'─'.repeat(60)}`);
            console.log(`❌ Failed to destroy: ${stackConfig.name} (${duration}s)`);
            console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
            
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
     * Set stack-specific configuration values from deployment config
     */
    private setStackSpecificConfig(
        stackConfig: StackConfig,
        deploymentConfig: DeploymentConfig,
        configValues: Record<string, automation.ConfigValue>
    ): void {
        // Set common configuration
        configValues['aws:region'] = { value: stackConfig.tags?.Region || deploymentConfig.defaultRegion || 'us-east-1' };
        
        // AWS role assumption is handled at the workspace level before deployment
        
        // Extract just the directory name from workDir, handling both relative and absolute paths
        const namespace = this.extractNamespaceFromWorkDir(stackConfig.workDir);
        
        // Extract configuration from the stack's components in deployment config
        if (stackConfig.components) {
            stackConfig.components.forEach(component => {
                if (component.config) {
                    // Convert component config to Pulumi config format
                    Object.entries(component.config).forEach(([key, value]) => {
                        // Handle arrays and objects by JSON stringifying them
                        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
                            configValues[`${namespace}:${key}`] = { value: JSON.stringify(value) };
                        } else {
                            configValues[`${namespace}:${key}`] = { value: String(value) };
                        }
                    });
                }
            });
        }
        
        // Set additional stack-level configuration
        configValues[`${namespace}:defaultRegion`] = { 
            value: deploymentConfig.defaultRegion || 'us-east-1' 
        };
        
        // Add stack tags as configuration
        if (stackConfig.tags) {
            Object.entries(stackConfig.tags).forEach(([key, value]) => {
                configValues[`${namespace}:${key.toLowerCase()}`] = { value };
            });
        }
    }

    /**
     * Extract namespace from workDir, handling both relative and absolute paths
     */
    private extractNamespaceFromWorkDir(workDir: string): string {
        // Handle relative paths like "./shared-services"
        if (workDir.startsWith('./')) {
            return workDir.replace(/^\.\//, '');
        }
        
        // Handle absolute paths by extracting the last directory name
        if (workDir.includes('/')) {
            const parts = workDir.split('/');
            return parts[parts.length - 1];
        }
        
        // Handle simple directory names
        return workDir;
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
        totalGroups?: number,
        deploymentConfig?: DeploymentConfig
    ): Promise<DeploymentResult[]> {
        const parallel = options?.parallel !== false; // Default to parallel
        
        if (parallel && stacks.length > 1) {
            // Deploy stacks in parallel with individual error handling
            const promises = stacks.map(stack => 
                this.deployStackWithErrorHandling(stack, options, groupIndex, totalGroups, deploymentConfig)
            );
            return Promise.all(promises);
        } else {
            // Deploy stacks sequentially
            const results: DeploymentResult[] = [];
            for (const stack of stacks) {
                const result = await this.deployStackWithErrorHandling(stack, options, groupIndex, totalGroups, deploymentConfig);
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
        totalGroups?: number,
        deploymentConfig?: DeploymentConfig
    ): Promise<DeploymentResult> {
        if (this.metricsCollector) {
            this.metricsCollector.startStack(stackConfig.name);
        }

        this.logger?.stackDeploymentStart(stackConfig.name, groupIndex || 1, totalGroups || 1);
        
        return ErrorHandler.executeWithRecovery(
            async () => {
                return this.deployStack(stackConfig, options, deploymentConfig);
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

    /**
     * Set up role assumption by configuring AWS credentials
     */
    private async setupRoleAssumption(roleArn: string, stackName: string): Promise<void> {
        try {
            const AWS = require('aws-sdk');
            const sts = new AWS.STS();
            
            // Assume the role
            const assumeRoleParams = {
                RoleArn: roleArn,
                RoleSessionName: `pulumi-${stackName}-${Date.now()}`,
                DurationSeconds: 3600 // 1 hour
            };
            
            const assumeRoleResult = await sts.assumeRole(assumeRoleParams).promise();
            
            // Set environment variables for the assumed role credentials
            process.env.AWS_ACCESS_KEY_ID = assumeRoleResult.Credentials.AccessKeyId;
            process.env.AWS_SECRET_ACCESS_KEY = assumeRoleResult.Credentials.SecretAccessKey;
            process.env.AWS_SESSION_TOKEN = assumeRoleResult.Credentials.SessionToken;
            
            this.logger?.info(`Successfully assumed role: ${roleArn}`);
            
        } catch (error) {
            const errorMessage = `Failed to assume role ${roleArn}: ${error}`;
            this.logger?.error(errorMessage, error instanceof Error ? error : new Error(String(error)));
            throw new Error(errorMessage);
        }
    }

    /**
     * Print detailed preview information for a stack
     */
    private printPreviewDetails(stackName: string, previewResult: any): void {
        console.log(`\n🔍 Preview for: ${stackName}`);
        console.log(`${'='.repeat(60)}`);
        
        // Show the raw Pulumi preview output - it's already well formatted
        if (previewResult.stdout) {
            console.log(previewResult.stdout);
        }
        
        // Show any errors if present
        if (previewResult.stderr && previewResult.stderr.trim()) {
            console.log(`\n⚠️  Warnings/Errors:`);
            console.log(previewResult.stderr);
        }
        
        console.log(`${'='.repeat(60)}\n`);
    }
    
    /**
     * Get operation symbol for display
     */
    private getOperationSymbol(operation: string): string {
        switch (operation) {
            case 'create': return '+';
            case 'update': return '~';
            case 'delete': return '-';
            case 'replace': return '±';
            case 'create-replacement': return '++';
            case 'delete-replaced': return '--';
            default: return '?';
        }
    }

    private printSummary(summary: DeploymentSummary): void {
        // Skip logging during tests to avoid async logging issues
        if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
            return;
        }
        
        const duration = (summary.totalDuration / 1000).toFixed(1);
        const successRate = ((summary.successfulStacks / summary.totalStacks) * 100).toFixed(0);
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 ${summary.deploymentName} | ${summary.successfulStacks}/${summary.totalStacks} (${successRate}%) | ${duration}s`);
        
        if (summary.failedStacks > 0) {
            console.log(`\n❌ Failed (${summary.failedStacks}):`);
            summary.results
                .filter(r => !r.success)
                .forEach(result => {
                    const errorMsg = result.error?.split('\n')[0] || 'Unknown error';
                    console.log(`   ${result.stackName.padEnd(30)} ${errorMsg.substring(0, 40)}`);
                });
        }
        
        if (summary.successfulStacks > 0) {
            console.log(`\n✅ Successful (${summary.successfulStacks}):`);
            summary.results
                .filter(r => r.success)
                .forEach(result => {
                    const duration = result.duration ? `${(result.duration / 1000).toFixed(1)}s` : '';
                    console.log(`   ${result.stackName.padEnd(30)} ${duration.padStart(6)}`);
                });
        }
        console.log(`${'='.repeat(60)}`);
    }
}