import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { ComponentLogger, PerformanceMonitor } from "./utils/logging";
import { 
    ErrorHandler, 
    RecoveryStrategy, 
    RecoveryOptions, 
    ValidationUtils,
    ComponentError,
    ValidationError,
    ResourceCreationError
} from "./utils/error-handling";

/**
 * Common configuration interface for all AWS components
 */
export interface ComponentConfig {
    defaultRegion?: string;
    defaultTags?: { [key: string]: string };
    governance?: {
        crossGuardEnabled?: boolean;
        policyPackages?: string[];
    };
    errorHandling?: {
        retryEnabled?: boolean;
        maxRetries?: number;
        retryDelay?: number;
        backoffMultiplier?: number;
        recoveryStrategy?: RecoveryStrategy;
    };
    logging?: {
        enablePerformanceMonitoring?: boolean;
        logLevel?: 'debug' | 'info' | 'warn' | 'error';
    };
}

/**
 * Base arguments interface that all component arguments should extend
 */
export interface BaseComponentArgs {
    region?: string;
    tags?: { [key: string]: string };
    errorHandling?: {
        retryEnabled?: boolean;
        maxRetries?: number;
        retryDelay?: number;
        backoffMultiplier?: number;
        recoveryStrategy?: RecoveryStrategy;
    };
    logging?: {
        enablePerformanceMonitoring?: boolean;
        logLevel?: 'debug' | 'info' | 'warn' | 'error';
    };
}

/**
 * Base AWS component class that provides common functionality
 * All AWS infrastructure components should extend this class
 */
export abstract class BaseAWSComponent extends pulumi.ComponentResource {
    protected readonly region: string;
    protected readonly tags: { [key: string]: string };
    protected readonly logger: ComponentLogger;
    protected readonly errorHandlingOptions: RecoveryOptions;
    protected readonly performanceMonitoringEnabled: boolean;

    constructor(
        type: string,
        name: string,
        args: BaseComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super(type, name, {}, opts);
        
        // Initialize logger first
        this.logger = new ComponentLogger(type, name, {
            region: args.region,
            stackName: pulumi.getStack()
        });

        this.logger.info("Initializing component", { args: this.sanitizeArgsForLogging(args) });

        try {
            // Validate and set region
            this.region = this.validateAndSetRegion(args.region);
            
            // Merge default tags with component-specific tags
            this.tags = this.buildTags(type, args.tags);
            
            // Set up error handling options
            this.errorHandlingOptions = this.buildErrorHandlingOptions(args.errorHandling);
            
            // Set up performance monitoring
            this.performanceMonitoringEnabled = args.logging?.enablePerformanceMonitoring ?? true;

            this.logger.info("Component initialization completed", {
                region: this.region,
                tagCount: Object.keys(this.tags).length,
                errorHandling: this.errorHandlingOptions.strategy,
                performanceMonitoring: this.performanceMonitoringEnabled
            });

            // Register outputs that are common to all components
            this.registerOutputs({
                region: this.region,
                tags: this.tags
            });

        } catch (error) {
            this.logger.error("Component initialization failed", error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Validate and set region with proper error handling
     */
    private validateAndSetRegion(region?: string): string {
        const targetRegion = region || "us-east-1";
        
        try {
            ValidationUtils.validateRegion(targetRegion, this.getResourceType(), this.getResourceName());
            this.logger.debug("Region validation successful", { region: targetRegion });
            return targetRegion;
        } catch (error) {
            this.logger.validationFailure("region", error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Build tags with validation
     */
    private buildTags(componentType: string, userTags?: { [key: string]: string }): { [key: string]: string } {
        const baseTags = {
            Component: componentType,
            ManagedBy: "Pulumi",
            CreatedAt: new Date().toISOString(),
            Stack: pulumi.getStack(),
            Project: pulumi.getProject()
        };

        const mergedTags = {
            ...baseTags,
            ...userTags
        };

        // Validate tag values
        Object.entries(mergedTags).forEach(([key, value]) => {
            if (typeof value !== 'string' || value.length === 0) {
                throw new ValidationError(
                    componentType,
                    this.getResourceName(),
                    `tag.${key}`,
                    value,
                    'non-empty string'
                );
            }
        });

        return mergedTags;
    }

    /**
     * Build error handling options
     */
    private buildErrorHandlingOptions(errorHandling?: BaseComponentArgs['errorHandling']): RecoveryOptions {
        return {
            strategy: errorHandling?.recoveryStrategy || RecoveryStrategy.RETRY,
            maxRetries: errorHandling?.maxRetries || 3,
            retryDelay: errorHandling?.retryDelay || 1000,
            backoffMultiplier: errorHandling?.backoffMultiplier || 2
        };
    }

    /**
     * Sanitize args for logging (remove sensitive data)
     */
    private sanitizeArgsForLogging(args: BaseComponentArgs): any {
        const sanitized = { ...args };
        
        // Remove or mask sensitive fields
        if (sanitized.tags) {
            sanitized.tags = Object.keys(sanitized.tags).reduce((acc, key) => {
                // Mask potentially sensitive tag values
                if (key.toLowerCase().includes('password') || 
                    key.toLowerCase().includes('secret') || 
                    key.toLowerCase().includes('key')) {
                    acc[key] = '***MASKED***';
                } else {
                    acc[key] = sanitized.tags![key];
                }
                return acc;
            }, {} as { [key: string]: string });
        }
        
        return sanitized;
    }

    /**
     * Helper method to create AWS provider for specific region with error handling
     */
    protected createProvider(region?: string): aws.Provider {
        const targetRegion = region || this.region;
        
        this.logger.debug("Creating AWS provider", { region: targetRegion });
        
        // Use a static name instead of this.urn which is an Output
        const providerName = `${this.getResourceName()}-provider-${targetRegion}`;
        const provider = new aws.Provider(providerName, {
            region: targetRegion
        }, { parent: this });

        this.logger.debug("AWS provider created successfully", { region: targetRegion });
        return provider;
    }

    /**
     * Helper method to merge tags with resource-specific tags
     */
    protected mergeTags(resourceTags?: { [key: string]: string }): { [key: string]: string } {
        return {
            ...this.tags,
            ...resourceTags
        };
    }

    /**
     * Execute an operation with error handling and performance monitoring
     */
    protected async executeWithErrorHandling<T>(
        operation: () => Promise<T>,
        operationName: string,
        resourceType?: string,
        resourceName?: string
    ): Promise<T> {
        const monitor = this.performanceMonitoringEnabled 
            ? PerformanceMonitor.start(operationName, this.logger)
            : null;

        try {
            if (resourceType && resourceName) {
                this.logger.resourceCreationStart(resourceType, resourceName);
            }

            const result = await ErrorHandler.executeWithRecovery(
                operation,
                operationName,
                this.getResourceType(),
                this.getResourceName(),
                this.errorHandlingOptions
            );

            const duration = monitor?.end();
            
            if (resourceType && resourceName) {
                this.logger.resourceCreationSuccess(resourceType, resourceName, duration);
            }

            return result;
        } catch (error) {
            const duration = monitor?.end();
            
            if (resourceType && resourceName) {
                this.logger.resourceCreationFailure(
                    resourceType, 
                    resourceName, 
                    error instanceof Error ? error : new Error(String(error)),
                    duration
                );
            }

            throw error;
        }
    }

    /**
     * Validate arguments with structured error handling
     */
    protected validateArgs<T extends Record<string, any>>(args: T, validationRules: ValidationRule<T>[]): void {
        this.logger.validationStart("component-arguments");

        try {
            for (const rule of validationRules) {
                rule.validate(args, this.getResourceType(), this.getResourceName());
            }
            
            this.logger.validationSuccess("component-arguments");
        } catch (error) {
            this.logger.validationFailure("component-arguments", error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Create a resource with error handling and logging
     */
    protected async createResource<T extends pulumi.Resource>(
        resourceFactory: () => T,
        resourceType: string,
        resourceName: string
    ): Promise<T> {
        return this.executeWithErrorHandling(
            async () => resourceFactory(),
            `create-${resourceType}`,
            resourceType,
            resourceName
        );
    }

    /**
     * Get component type for error reporting
     */
    protected getResourceType(): string {
        return this.constructor.name;
    }

    /**
     * Get component name for error reporting
     */
    protected getResourceName(): string {
        return this.urn.apply ? this.urn.apply(urn => urn.split('::').pop() || 'unknown') as any : 'unknown';
    }

    /**
     * Handle dependency resolution with logging
     */
    protected resolveDependency<T>(
        dependencyName: string,
        dependencyType: string,
        resolver: () => T | undefined
    ): T {
        try {
            const dependency = resolver();
            
            if (dependency) {
                this.logger.dependencyResolution(dependencyType, dependencyName, 'found');
                return dependency;
            } else {
                this.logger.dependencyResolution(dependencyType, dependencyName, 'not_found');
                throw new ComponentError(
                    this.getResourceType(),
                    this.getResourceName(),
                    `Required dependency not found: ${dependencyType} '${dependencyName}'`,
                    'DEPENDENCY_NOT_FOUND'
                );
            }
        } catch (error) {
            this.logger.dependencyResolution(dependencyType, dependencyName, 'error');
            throw error;
        }
    }
}

/**
 * Validation rule interface
 */
export interface ValidationRule<T> {
    validate(args: T, componentType: string, componentName: string): void;
}

/**
 * Common validation rules
 */
export class CommonValidationRules {
    /**
     * Validate required field
     */
    static required<T>(fieldName: keyof T): ValidationRule<T> {
        return {
            validate: (args: T, componentType: string, componentName: string) => {
                ValidationUtils.validateRequired(args[fieldName], String(fieldName), componentType, componentName);
            }
        };
    }

    /**
     * Validate non-empty array
     */
    static nonEmptyArray<T>(fieldName: keyof T): ValidationRule<T> {
        return {
            validate: (args: T, componentType: string, componentName: string) => {
                const value = args[fieldName];
                if (Array.isArray(value)) {
                    ValidationUtils.validateNonEmptyArray(value, String(fieldName), componentType, componentName);
                }
            }
        };
    }

    /**
     * Validate enum value
     */
    static enumValue<T, K extends keyof T>(fieldName: K, validValues: T[K][]): ValidationRule<T> {
        return {
            validate: (args: T, componentType: string, componentName: string) => {
                const value = args[fieldName];
                if (value !== undefined) {
                    ValidationUtils.validateEnum(value, String(fieldName), validValues, componentType, componentName);
                }
            }
        };
    }

    /**
     * Validate numeric range
     */
    static numericRange<T>(fieldName: keyof T, min: number, max: number): ValidationRule<T> {
        return {
            validate: (args: T, componentType: string, componentName: string) => {
                const value = args[fieldName];
                if (typeof value === 'number') {
                    ValidationUtils.validateRange(value, String(fieldName), min, max, componentType, componentName);
                }
            }
        };
    }
}

/**
 * Legacy error class for backward compatibility
 * @deprecated Use ComponentError from error-handling.ts instead
 */
export class ComponentValidationError extends Error {
    constructor(componentType: string, message: string) {
        super(`${componentType}: ${message}`);
        this.name = 'ComponentValidationError';
    }
}

/**
 * Legacy validation functions for backward compatibility
 * @deprecated Use ValidationUtils from error-handling.ts instead
 */
export function validateRequired<T>(value: T | undefined, fieldName: string, componentType: string): T {
    if (value === undefined || value === null) {
        throw new ComponentValidationError(componentType, `${fieldName} is required`);
    }
    return value;
}

export function validateRegion(region: string, componentType: string): void {
    const regionPattern = /^[a-z]{2}-[a-z]+-\d+$/;
    if (!regionPattern.test(region)) {
        throw new ComponentValidationError(componentType, `Invalid region format: ${region}`);
    }
}