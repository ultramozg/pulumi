import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

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
}

/**
 * Base arguments interface that all component arguments should extend
 */
export interface BaseComponentArgs {
    region?: string;
    tags?: { [key: string]: string };
}

/**
 * Base AWS component class that provides common functionality
 * All AWS infrastructure components should extend this class
 */
export abstract class BaseAWSComponent extends pulumi.ComponentResource {
    protected readonly region: string;
    protected readonly tags: { [key: string]: string };
    
    constructor(
        type: string,
        name: string,
        args: BaseComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super(type, name, {}, opts);
        
        // Set region from args or use default
        this.region = args.region || "us-east-1";
        
        // Merge default tags with component-specific tags
        this.tags = {
            Component: type,
            ManagedBy: "Pulumi",
            ...args.tags
        };
        
        // Register outputs that are common to all components
        this.registerOutputs({
            region: this.region,
            tags: this.tags
        });
    }

    /**
     * Helper method to create AWS provider for specific region
     */
    protected createProvider(region?: string): aws.Provider {
        const targetRegion = region || this.region;
        return new aws.Provider(`${this.urn}-provider-${targetRegion}`, {
            region: targetRegion
        }, { parent: this });
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
}

/**
 * Common error types for component validation
 */
export class ComponentValidationError extends Error {
    constructor(componentType: string, message: string) {
        super(`${componentType}: ${message}`);
        this.name = 'ComponentValidationError';
    }
}

/**
 * Utility function to validate required arguments
 */
export function validateRequired<T>(value: T | undefined, fieldName: string, componentType: string): T {
    if (value === undefined || value === null) {
        throw new ComponentValidationError(componentType, `${fieldName} is required`);
    }
    return value;
}

/**
 * Utility function to validate region format
 */
export function validateRegion(region: string, componentType: string): void {
    const regionPattern = /^[a-z]{2}-[a-z]+-\d+$/;
    if (!regionPattern.test(region)) {
        throw new ComponentValidationError(componentType, `Invalid region format: ${region}`);
    }
}