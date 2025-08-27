import * as pulumi from "@pulumi/pulumi";

/**
 * Log levels for structured logging
 */
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

/**
 * Log context interface for structured logging
 */
export interface LogContext {
    componentType?: string;
    componentName?: string;
    resourceType?: string;
    resourceName?: string;
    operation?: string;
    region?: string;
    stackName?: string;
    timestamp?: string;
    duration?: number;
    [key: string]: any;
}

/**
 * Structured logger for components and automation
 */
export class ComponentLogger {
    private readonly componentType: string;
    private readonly componentName: string;
    private readonly baseContext: LogContext;

    constructor(componentType: string, componentName: string, additionalContext?: LogContext) {
        this.componentType = componentType;
        this.componentName = componentName;
        this.baseContext = {
            componentType,
            componentName,
            timestamp: new Date().toISOString(),
            ...additionalContext
        };
    }

    /**
     * Log debug message
     */
    public debug(message: string, context?: LogContext): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    /**
     * Log info message
     */
    public info(message: string, context?: LogContext): void {
        this.log(LogLevel.INFO, message, context);
    }

    /**
     * Log warning message
     */
    public warn(message: string, context?: LogContext): void {
        this.log(LogLevel.WARN, message, context);
    }

    /**
     * Log error message
     */
    public error(message: string, error?: Error, context?: LogContext): void {
        const errorContext = error ? {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        } : {};

        this.log(LogLevel.ERROR, message, { ...errorContext, ...context });
    }

    /**
     * Log resource creation start
     */
    public resourceCreationStart(resourceType: string, resourceName: string, context?: LogContext): void {
        this.info(`Creating ${resourceType}: ${resourceName}`, {
            resourceType,
            resourceName,
            operation: 'create_start',
            ...context
        });
    }

    /**
     * Log resource creation success
     */
    public resourceCreationSuccess(resourceType: string, resourceName: string, duration?: number, context?: LogContext): void {
        this.info(`Successfully created ${resourceType}: ${resourceName}`, {
            resourceType,
            resourceName,
            operation: 'create_success',
            duration,
            ...context
        });
    }

    /**
     * Log resource creation failure
     */
    public resourceCreationFailure(resourceType: string, resourceName: string, error: Error, duration?: number, context?: LogContext): void {
        this.error(`Failed to create ${resourceType}: ${resourceName}`, error, {
            resourceType,
            resourceName,
            operation: 'create_failure',
            duration,
            ...context
        });
    }

    /**
     * Log validation start
     */
    public validationStart(operation: string, context?: LogContext): void {
        this.debug(`Starting validation: ${operation}`, {
            operation: `validation_${operation}`,
            ...context
        });
    }

    /**
     * Log validation success
     */
    public validationSuccess(operation: string, context?: LogContext): void {
        this.debug(`Validation successful: ${operation}`, {
            operation: `validation_${operation}_success`,
            ...context
        });
    }

    /**
     * Log validation failure
     */
    public validationFailure(operation: string, error: Error, context?: LogContext): void {
        this.warn(`Validation failed: ${operation}`, {
            operation: `validation_${operation}_failure`,
            error: {
                name: error.name,
                message: error.message
            },
            ...context
        });
    }

    /**
     * Log dependency resolution
     */
    public dependencyResolution(dependencyType: string, dependencyName: string, status: 'found' | 'not_found' | 'error', context?: LogContext): void {
        const level = status === 'error' ? LogLevel.ERROR : status === 'not_found' ? LogLevel.WARN : LogLevel.INFO;
        this.log(level, `Dependency ${status}: ${dependencyType} '${dependencyName}'`, {
            dependencyType,
            dependencyName,
            dependencyStatus: status,
            operation: 'dependency_resolution',
            ...context
        });
    }

    /**
     * Log operation timing
     */
    public operationTiming(operation: string, duration: number, context?: LogContext): void {
        this.info(`Operation completed: ${operation} (${duration}ms)`, {
            operation,
            duration,
            ...context
        });
    }

    /**
     * Create a child logger for a specific resource
     */
    public forResource(resourceType: string, resourceName: string): ComponentLogger {
        return new ComponentLogger(this.componentType, this.componentName, {
            ...this.baseContext,
            resourceType,
            resourceName
        });
    }

    /**
     * Create a child logger for a specific operation
     */
    public forOperation(operation: string): ComponentLogger {
        return new ComponentLogger(this.componentType, this.componentName, {
            ...this.baseContext,
            operation
        });
    }

    /**
     * Internal logging method
     */
    private log(level: LogLevel, message: string, context?: LogContext): void {
        const fullContext = {
            ...this.baseContext,
            timestamp: new Date().toISOString(),
            ...context
        };

        const logMessage = `[${this.componentType}:${this.componentName}] ${message}`;
        const contextString = Object.keys(fullContext).length > 0 
            ? ` | Context: ${JSON.stringify(fullContext)}`
            : '';

        switch (level) {
            case LogLevel.DEBUG:
                // Pulumi doesn't have debug level, use info with debug prefix
                pulumi.log.info(`DEBUG: ${logMessage}${contextString}`);
                break;
            case LogLevel.INFO:
                pulumi.log.info(`${logMessage}${contextString}`);
                break;
            case LogLevel.WARN:
                pulumi.log.warn(`${logMessage}${contextString}`);
                break;
            case LogLevel.ERROR:
                pulumi.log.error(`${logMessage}${contextString}`);
                break;
        }
    }
}

/**
 * Deployment logger for automation operations
 */
export class DeploymentLogger {
    public readonly deploymentName: string;
    private readonly baseContext: LogContext;

    constructor(deploymentName: string, additionalContext?: LogContext) {
        this.deploymentName = deploymentName;
        this.baseContext = {
            deploymentName,
            timestamp: new Date().toISOString(),
            ...additionalContext
        };
    }

    /**
     * Log deployment start
     */
    public deploymentStart(totalStacks: number): void {
        const context = {
            ...this.baseContext,
            operation: 'deployment_start',
            totalStacks
        };
        pulumi.log.info(`🚀 Starting deployment: ${this.deploymentName} | Context: ${JSON.stringify(context)}`);
    }

    /**
     * Log deployment completion
     */
    public deploymentComplete(successfulStacks: number, failedStacks: number, duration: number): void {
        const level = failedStacks > 0 ? LogLevel.WARN : LogLevel.INFO;
        const emoji = failedStacks > 0 ? '⚠️' : '✅';
        
        this.log(level, `${emoji} Deployment completed: ${this.deploymentName}`, {
            operation: 'deployment_complete',
            successfulStacks,
            failedStacks,
            duration
        });
    }

    /**
     * Log stack deployment start
     */
    public stackDeploymentStart(stackName: string, groupIndex: number, totalGroups: number): void {
        const context = {
            ...this.baseContext,
            operation: 'stack_deployment_start',
            stackName,
            groupIndex,
            totalGroups
        };
        pulumi.log.info(`📦 Deploying stack: ${stackName} (group ${groupIndex}/${totalGroups}) | Context: ${JSON.stringify(context)}`);
    }

    /**
     * Log stack deployment success
     */
    public stackDeploymentSuccess(stackName: string, duration: number, outputs?: Record<string, any>): void {
        const context = {
            ...this.baseContext,
            operation: 'stack_deployment_success',
            stackName,
            duration,
            outputCount: outputs ? Object.keys(outputs).length : 0
        };
        pulumi.log.info(`✅ Stack deployed successfully: ${stackName} | Context: ${JSON.stringify(context)}`);
    }

    /**
     * Log stack deployment failure
     */
    public stackDeploymentFailure(stackName: string, error: Error, duration: number): void {
        const context = {
            ...this.baseContext,
            operation: 'stack_deployment_failure',
            stackName,
            duration,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        };
        pulumi.log.error(`❌ Stack deployment failed: ${stackName} | Context: ${JSON.stringify(context)}`);
    }

    /**
     * Log dependency resolution
     */
    public dependencyResolution(totalGroups: number, groups: string[][]): void {
        const context = {
            ...this.baseContext,
            operation: 'dependency_resolution',
            totalGroups,
            groups: groups.map((group, index) => ({
                groupIndex: index + 1,
                stacks: group
            }))
        };
        pulumi.log.info(`📋 Dependency resolution completed: ${totalGroups} groups | Context: ${JSON.stringify(context)}`);
    }

    /**
     * Log group deployment start
     */
    public groupDeploymentStart(groupIndex: number, totalGroups: number, stackNames: string[]): void {
        const context = {
            ...this.baseContext,
            operation: 'group_deployment_start',
            groupIndex,
            totalGroups,
            stackNames,
            stackCount: stackNames.length
        };
        pulumi.log.info(`🔄 Deploying group ${groupIndex}/${totalGroups}: ${stackNames.join(', ')} | Context: ${JSON.stringify(context)}`);
    }

    /**
     * Log group deployment completion
     */
    public groupDeploymentComplete(groupIndex: number, successfulStacks: string[], failedStacks: string[]): void {
        const level = failedStacks.length > 0 ? LogLevel.WARN : LogLevel.INFO;
        const emoji = failedStacks.length > 0 ? '⚠️' : '✅';
        
        this.log(level, `${emoji} Group ${groupIndex} completed`, {
            operation: 'group_deployment_complete',
            groupIndex,
            successfulStacks,
            failedStacks,
            successCount: successfulStacks.length,
            failureCount: failedStacks.length
        });
    }

    /**
     * Log retry attempt
     */
    public retryAttempt(operation: string, attempt: number, maxAttempts: number, delay: number): void {
        const context = {
            ...this.baseContext,
            operation: 'retry_attempt',
            retryOperation: operation,
            attempt,
            maxAttempts,
            delay
        };
        pulumi.log.warn(`🔄 Retrying ${operation} (attempt ${attempt}/${maxAttempts}) after ${delay}ms | Context: ${JSON.stringify(context)}`);
    }

    /**
     * Log rollback start
     */
    public rollbackStart(reason: string): void {
        const context = {
            ...this.baseContext,
            operation: 'rollback_start',
            reason
        };
        pulumi.log.warn(`🔙 Starting rollback: ${reason} | Context: ${JSON.stringify(context)}`);
    }

    /**
     * Log rollback completion
     */
    public rollbackComplete(success: boolean, duration: number): void {
        const level = success ? LogLevel.INFO : LogLevel.ERROR;
        const emoji = success ? '✅' : '❌';
        
        this.log(level, `${emoji} Rollback ${success ? 'completed' : 'failed'}`, {
            operation: 'rollback_complete',
            success,
            duration
        });
    }

    /**
     * Log info message
     */
    public info(message: string, context?: LogContext): void {
        this.log(LogLevel.INFO, message, context);
    }

    /**
     * Log warning message
     */
    public warn(message: string, context?: LogContext): void {
        this.log(LogLevel.WARN, message, context);
    }

    /**
     * Log error message
     */
    public error(message: string, error?: Error, context?: LogContext): void {
        const errorContext = error ? {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        } : {};

        this.log(LogLevel.ERROR, message, { ...errorContext, ...context });
    }

    /**
     * Internal logging method
     */
    private log(level: LogLevel, message: string, context?: LogContext): void {
        const fullContext = {
            ...this.baseContext,
            timestamp: new Date().toISOString(),
            ...context
        };

        const contextString = Object.keys(fullContext).length > 0 
            ? ` | Context: ${JSON.stringify(fullContext)}`
            : '';

        switch (level) {
            case LogLevel.DEBUG:
                pulumi.log.info(`DEBUG: ${message}${contextString}`);
                break;
            case LogLevel.INFO:
                pulumi.log.info(`${message}${contextString}`);
                break;
            case LogLevel.WARN:
                pulumi.log.warn(`${message}${contextString}`);
                break;
            case LogLevel.ERROR:
                pulumi.log.error(`${message}${contextString}`);
                break;
        }
    }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
    private startTime: number;
    private readonly operation: string;
    private readonly logger: ComponentLogger | DeploymentLogger;

    constructor(operation: string, logger: ComponentLogger | DeploymentLogger) {
        this.operation = operation;
        this.logger = logger;
        this.startTime = Date.now();
    }

    /**
     * Start timing an operation
     */
    public static start(operation: string, logger: ComponentLogger | DeploymentLogger): PerformanceMonitor {
        return new PerformanceMonitor(operation, logger);
    }

    /**
     * End timing and log the duration
     */
    public end(context?: LogContext): number {
        const duration = Date.now() - this.startTime;
        
        if (this.logger instanceof ComponentLogger) {
            this.logger.operationTiming(this.operation, duration, context);
        } else {
            // For DeploymentLogger, we'll use a generic info log
            const logContext = {
                operation: this.operation,
                duration,
                ...context
            };
            pulumi.log.info(`Operation completed: ${this.operation} (${duration}ms) | Context: ${JSON.stringify(logContext)}`);
        }
        
        return duration;
    }

    /**
     * Get current duration without ending the timer
     */
    public getCurrentDuration(): number {
        return Date.now() - this.startTime;
    }
}

/**
 * Metrics collection for deployment tracking
 */
export interface DeploymentMetrics {
    deploymentName: string;
    startTime: number;
    endTime?: number;
    totalDuration?: number;
    stackMetrics: StackMetrics[];
    totalStacks: number;
    successfulStacks: number;
    failedStacks: number;
    retryCount: number;
    rollbackCount: number;
}

export interface StackMetrics {
    stackName: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    success: boolean;
    retryCount: number;
    resourceCount?: number;
    error?: string;
}

/**
 * Metrics collector for deployment operations
 */
export class MetricsCollector {
    private metrics: DeploymentMetrics;

    constructor(deploymentName: string) {
        this.metrics = {
            deploymentName,
            startTime: Date.now(),
            stackMetrics: [],
            totalStacks: 0,
            successfulStacks: 0,
            failedStacks: 0,
            retryCount: 0,
            rollbackCount: 0
        };
    }

    /**
     * Start tracking a stack deployment
     */
    public startStack(stackName: string): void {
        this.metrics.stackMetrics.push({
            stackName,
            startTime: Date.now(),
            success: false,
            retryCount: 0
        });
        this.metrics.totalStacks++;
    }

    /**
     * Complete stack deployment tracking
     */
    public completeStack(stackName: string, success: boolean, error?: string, resourceCount?: number): void {
        const stackMetric = this.metrics.stackMetrics.find(s => s.stackName === stackName);
        if (stackMetric) {
            stackMetric.endTime = Date.now();
            stackMetric.duration = stackMetric.endTime - stackMetric.startTime;
            stackMetric.success = success;
            stackMetric.error = error;
            stackMetric.resourceCount = resourceCount;

            if (success) {
                this.metrics.successfulStacks++;
            } else {
                this.metrics.failedStacks++;
            }
        }
    }

    /**
     * Record a retry attempt
     */
    public recordRetry(stackName?: string): void {
        this.metrics.retryCount++;
        if (stackName) {
            const stackMetric = this.metrics.stackMetrics.find(s => s.stackName === stackName);
            if (stackMetric) {
                stackMetric.retryCount++;
            }
        }
    }

    /**
     * Record a rollback
     */
    public recordRollback(): void {
        this.metrics.rollbackCount++;
    }

    /**
     * Complete deployment tracking
     */
    public completeDeployment(): DeploymentMetrics {
        this.metrics.endTime = Date.now();
        this.metrics.totalDuration = this.metrics.endTime - this.metrics.startTime;
        return { ...this.metrics };
    }

    /**
     * Get current metrics snapshot
     */
    public getMetrics(): DeploymentMetrics {
        return { ...this.metrics };
    }

    /**
     * Export metrics to JSON
     */
    public exportMetrics(): string {
        return JSON.stringify(this.completeDeployment(), null, 2);
    }
}