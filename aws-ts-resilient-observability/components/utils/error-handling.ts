import * as pulumi from "@pulumi/pulumi";

/**
 * Custom error types for different component scenarios
 */
export class ComponentError extends Error {
    public readonly componentType: string;
    public readonly componentName: string;
    public readonly errorCode: string;
    public readonly timestamp: Date;
    public readonly context?: Record<string, any>;

    constructor(
        componentType: string,
        componentName: string,
        message: string,
        errorCode: string = 'COMPONENT_ERROR',
        context?: Record<string, any>
    ) {
        super(`[${componentType}:${componentName}] ${message}`);
        this.name = 'ComponentError';
        this.componentType = componentType;
        this.componentName = componentName;
        this.errorCode = errorCode;
        this.timestamp = new Date();
        this.context = context;
    }
}

export class ValidationError extends ComponentError {
    constructor(
        componentType: string,
        componentName: string,
        fieldName: string,
        value: any,
        expectedType?: string,
        context?: Record<string, any>
    ) {
        const message = expectedType 
            ? `Invalid ${fieldName}: expected ${expectedType}, got ${typeof value} (${value})`
            : `Invalid ${fieldName}: ${value}`;
        
        super(componentType, componentName, message, 'VALIDATION_ERROR', {
            fieldName,
            value,
            expectedType,
            ...context
        });
        this.name = 'ValidationError';
    }
}

export class ResourceCreationError extends ComponentError {
    public readonly resourceType: string;
    public readonly resourceName: string;
    public readonly awsError?: any;

    constructor(
        componentType: string,
        componentName: string,
        resourceType: string,
        resourceName: string,
        message: string,
        awsError?: any,
        context?: Record<string, any>
    ) {
        super(componentType, componentName, `Failed to create ${resourceType} '${resourceName}': ${message}`, 'RESOURCE_CREATION_ERROR', {
            resourceType,
            resourceName,
            awsError: awsError ? {
                code: awsError.code,
                message: awsError.message,
                statusCode: awsError.statusCode
            } : undefined,
            ...context
        });
        this.name = 'ResourceCreationError';
        this.resourceType = resourceType;
        this.resourceName = resourceName;
        this.awsError = awsError;
    }
}

export class DependencyError extends ComponentError {
    public readonly dependencyType: string;
    public readonly dependencyName: string;

    constructor(
        componentType: string,
        componentName: string,
        dependencyType: string,
        dependencyName: string,
        message: string,
        context?: Record<string, any>
    ) {
        super(componentType, componentName, `Dependency error with ${dependencyType} '${dependencyName}': ${message}`, 'DEPENDENCY_ERROR', {
            dependencyType,
            dependencyName,
            ...context
        });
        this.name = 'DependencyError';
        this.dependencyType = dependencyType;
        this.dependencyName = dependencyName;
    }
}

export class ConfigurationError extends ComponentError {
    public readonly configPath: string;

    constructor(
        componentType: string,
        componentName: string,
        configPath: string,
        message: string,
        context?: Record<string, any>
    ) {
        super(componentType, componentName, `Configuration error at '${configPath}': ${message}`, 'CONFIGURATION_ERROR', {
            configPath,
            ...context
        });
        this.name = 'ConfigurationError';
        this.configPath = configPath;
    }
}

/**
 * Error recovery strategies
 */
export enum RecoveryStrategy {
    RETRY = 'retry',
    SKIP = 'skip',
    FAIL_FAST = 'fail_fast',
    ROLLBACK = 'rollback',
    CONTINUE = 'continue'
}

export interface RecoveryOptions {
    strategy: RecoveryStrategy;
    maxRetries?: number;
    retryDelay?: number;
    backoffMultiplier?: number;
    skipCondition?: (error: Error) => boolean;
    rollbackActions?: (() => Promise<void>)[];
}

/**
 * Error handler with recovery mechanisms
 */
export class ErrorHandler {
    private static readonly DEFAULT_RETRY_DELAY = 1000; // 1 second
    private static readonly DEFAULT_MAX_RETRIES = 3;
    private static readonly DEFAULT_BACKOFF_MULTIPLIER = 2;

    /**
     * Execute an operation with error handling and recovery
     */
    public static async executeWithRecovery<T>(
        operation: () => Promise<T>,
        operationName: string,
        componentType: string,
        componentName: string,
        options: RecoveryOptions
    ): Promise<T> {
        let lastError: Error | undefined;
        let attempt = 0;
        const maxRetries = options.maxRetries || this.DEFAULT_MAX_RETRIES;

        while (attempt <= maxRetries) {
            try {
                if (attempt > 0) {
                    const delay = this.calculateDelay(attempt, options);
                    pulumi.log.info(`Retrying ${operationName} (attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms delay`);
                    await this.sleep(delay);
                }

                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                attempt++;

                // Log the error
                pulumi.log.warn(`${operationName} failed (attempt ${attempt}/${maxRetries + 1}): ${lastError.message}`);

                // Check if we should skip based on error condition
                if (options.skipCondition && options.skipCondition(lastError)) {
                    pulumi.log.info(`Skipping ${operationName} due to skip condition`);
                    throw new ComponentError(componentType, componentName, `Operation skipped: ${lastError.message}`, 'OPERATION_SKIPPED');
                }

                // Handle different recovery strategies
                switch (options.strategy) {
                    case RecoveryStrategy.FAIL_FAST:
                        throw this.wrapError(lastError, componentType, componentName, operationName);

                    case RecoveryStrategy.RETRY:
                        if (attempt > maxRetries) {
                            throw this.wrapError(lastError, componentType, componentName, operationName, attempt);
                        }
                        break;

                    case RecoveryStrategy.ROLLBACK:
                        if (options.rollbackActions && options.rollbackActions.length > 0) {
                            pulumi.log.info(`Executing rollback actions for ${operationName}`);
                            await this.executeRollback(options.rollbackActions);
                        }
                        throw this.wrapError(lastError, componentType, componentName, operationName);

                    case RecoveryStrategy.SKIP:
                        pulumi.log.warn(`Skipping ${operationName} due to error: ${lastError.message}`);
                        throw new ComponentError(componentType, componentName, `Operation skipped: ${lastError.message}`, 'OPERATION_SKIPPED');

                    case RecoveryStrategy.CONTINUE:
                        pulumi.log.warn(`Continuing despite error in ${operationName}: ${lastError.message}`);
                        return undefined as T; // This might need type adjustment based on usage
                }
            }
        }

        throw this.wrapError(lastError!, componentType, componentName, operationName, attempt);
    }

    /**
     * Wrap an error with component context
     */
    private static wrapError(
        error: Error,
        componentType: string,
        componentName: string,
        operationName: string,
        attempts?: number
    ): ComponentError {
        const context = {
            operationName,
            originalError: error.message,
            attempts
        };

        if (error instanceof ComponentError) {
            return error;
        }

        return new ComponentError(
            componentType,
            componentName,
            `Operation '${operationName}' failed: ${error.message}`,
            'OPERATION_FAILED',
            context
        );
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    private static calculateDelay(attempt: number, options: RecoveryOptions): number {
        const baseDelay = options.retryDelay || this.DEFAULT_RETRY_DELAY;
        const multiplier = options.backoffMultiplier || this.DEFAULT_BACKOFF_MULTIPLIER;
        return baseDelay * Math.pow(multiplier, attempt - 1);
    }

    /**
     * Sleep for specified milliseconds
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute rollback actions
     */
    private static async executeRollback(rollbackActions: (() => Promise<void>)[]): Promise<void> {
        for (const action of rollbackActions.reverse()) {
            try {
                await action();
            } catch (rollbackError) {
                pulumi.log.error(`Rollback action failed: ${rollbackError}`);
                // Continue with other rollback actions even if one fails
            }
        }
    }
}

/**
 * Validation utilities with enhanced error reporting
 */
export class ValidationUtils {
    /**
     * Validate required field with detailed error information
     */
    public static validateRequired<T>(
        value: T | undefined | null,
        fieldName: string,
        componentType: string,
        componentName: string,
        expectedType?: string
    ): T {
        if (value === undefined || value === null) {
            throw new ValidationError(componentType, componentName, fieldName, value, expectedType || 'non-null value');
        }
        return value;
    }

    /**
     * Validate string format with regex
     */
    public static validateFormat(
        value: string,
        fieldName: string,
        pattern: RegExp,
        componentType: string,
        componentName: string,
        formatDescription?: string
    ): void {
        if (!pattern.test(value)) {
            throw new ValidationError(
                componentType,
                componentName,
                fieldName,
                value,
                formatDescription || `string matching ${pattern}`,
                { pattern: pattern.source }
            );
        }
    }

    /**
     * Validate array is not empty
     */
    public static validateNonEmptyArray<T>(
        value: T[],
        fieldName: string,
        componentType: string,
        componentName: string
    ): T[] {
        if (!Array.isArray(value) || value.length === 0) {
            throw new ValidationError(
                componentType,
                componentName,
                fieldName,
                value,
                'non-empty array',
                { actualLength: Array.isArray(value) ? value.length : 'not an array' }
            );
        }
        return value;
    }

    /**
     * Validate numeric range
     */
    public static validateRange(
        value: number,
        fieldName: string,
        min: number,
        max: number,
        componentType: string,
        componentName: string
    ): void {
        if (value < min || value > max) {
            throw new ValidationError(
                componentType,
                componentName,
                fieldName,
                value,
                `number between ${min} and ${max}`,
                { min, max }
            );
        }
    }

    /**
     * Validate enum value
     */
    public static validateEnum<T>(
        value: T,
        fieldName: string,
        validValues: T[],
        componentType: string,
        componentName: string
    ): void {
        if (!validValues.includes(value)) {
            throw new ValidationError(
                componentType,
                componentName,
                fieldName,
                value,
                `one of: ${validValues.join(', ')}`,
                { validValues }
            );
        }
    }

    /**
     * Validate AWS region format
     */
    public static validateRegion(
        region: string,
        componentType: string,
        componentName: string
    ): void {
        const regionPattern = /^[a-z]{2}-[a-z]+-\d+$/;
        this.validateFormat(
            region,
            'region',
            regionPattern,
            componentType,
            componentName,
            'AWS region format (e.g., us-east-1)'
        );
    }

    /**
     * Validate CIDR block format
     */
    public static validateCidrBlock(
        cidr: string,
        componentType: string,
        componentName: string
    ): void {
        const cidrPattern = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
        this.validateFormat(
            cidr,
            'cidrBlock',
            cidrPattern,
            componentType,
            componentName,
            'CIDR block format (e.g., 10.0.0.0/16)'
        );

        // Additional validation for IP ranges
        const [ip, prefix] = cidr.split('/');
        const prefixNum = parseInt(prefix, 10);
        
        if (prefixNum < 8 || prefixNum > 32) {
            throw new ValidationError(
                componentType,
                componentName,
                'cidrBlock',
                cidr,
                'CIDR with prefix between 8 and 32',
                { prefix: prefixNum }
            );
        }

        // Validate IP octets
        const octets = ip.split('.').map(octet => parseInt(octet, 10));
        for (let i = 0; i < octets.length; i++) {
            if (octets[i] < 0 || octets[i] > 255) {
                throw new ValidationError(
                    componentType,
                    componentName,
                    'cidrBlock',
                    cidr,
                    'valid IP address in CIDR',
                    { invalidOctet: octets[i], octetIndex: i }
                );
            }
        }
    }
}