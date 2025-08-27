import * as pulumi from "@pulumi/pulumi";

/**
 * Output sharing patterns and utilities for component integration
 */

/**
 * Shared output reference for cross-component communication
 */
export interface SharedOutput<T = any> {
    componentName: string;
    componentType: string;
    outputName: string;
    value: pulumi.Output<T>;
    metadata?: {
        region?: string;
        tags?: { [key: string]: string };
        description?: string;
    };
}

/**
 * Output registry for managing shared outputs across components
 */
export class OutputRegistry {
    private outputs: Map<string, SharedOutput> = new Map();

    /**
     * Register a shared output from a component
     */
    register<T>(
        componentName: string,
        componentType: string,
        outputName: string,
        value: pulumi.Output<T>,
        metadata?: SharedOutput<T>['metadata']
    ): void {
        const key = this.createKey(componentName, outputName);
        
        if (this.outputs.has(key)) {
            throw new Error(`Output '${outputName}' from component '${componentName}' is already registered`);
        }

        this.outputs.set(key, {
            componentName,
            componentType,
            outputName,
            value,
            metadata
        });
    }

    /**
     * Get a shared output by component name and output name
     */
    get<T>(componentName: string, outputName: string): pulumi.Output<T> {
        const key = this.createKey(componentName, outputName);
        const output = this.outputs.get(key);
        
        if (!output) {
            throw new Error(`Output '${outputName}' from component '${componentName}' not found`);
        }

        return output.value as pulumi.Output<T>;
    }

    /**
     * Check if an output exists
     */
    has(componentName: string, outputName: string): boolean {
        const key = this.createKey(componentName, outputName);
        return this.outputs.has(key);
    }

    /**
     * Get all outputs from a specific component
     */
    getComponentOutputs(componentName: string): SharedOutput[] {
        return Array.from(this.outputs.values()).filter(
            output => output.componentName === componentName
        );
    }

    /**
     * Get all outputs of a specific type
     */
    getOutputsByType(componentType: string): SharedOutput[] {
        return Array.from(this.outputs.values()).filter(
            output => output.componentType === componentType
        );
    }

    /**
     * List all registered outputs
     */
    list(): SharedOutput[] {
        return Array.from(this.outputs.values());
    }

    /**
     * Clear all registered outputs
     */
    clear(): void {
        this.outputs.clear();
    }

    private createKey(componentName: string, outputName: string): string {
        return `${componentName}:${outputName}`;
    }
}

/**
 * Global output registry instance
 */
export const globalOutputRegistry = new OutputRegistry();

/**
 * Networking output sharing patterns
 */
export interface NetworkingOutputs {
    vpcId?: pulumi.Output<string>;
    vpcArn?: pulumi.Output<string>;
    subnetIds?: pulumi.Output<string[]>;
    subnetsByType?: pulumi.Output<{ [type: string]: string[] }>;
    securityGroupIds?: pulumi.Output<string[]>;
    routeTableIds?: pulumi.Output<string[]>;
    internetGatewayId?: pulumi.Output<string>;
    natGatewayIds?: pulumi.Output<string[]>;
    transitGatewayAttachmentId?: pulumi.Output<string>;
}

/**
 * Compute output sharing patterns
 */
export interface ComputeOutputs {
    clusterName?: pulumi.Output<string>;
    clusterArn?: pulumi.Output<string>;
    clusterEndpoint?: pulumi.Output<string>;
    clusterSecurityGroupId?: pulumi.Output<string>;
    nodeGroupArns?: pulumi.Output<string[]>;
    oidcIssuerUrl?: pulumi.Output<string>;
}

/**
 * Storage output sharing patterns
 */
export interface StorageOutputs {
    repositoryUrls?: pulumi.Output<{ [name: string]: string }>;
    repositoryArns?: pulumi.Output<{ [name: string]: string }>;
    bucketNames?: pulumi.Output<string[]>;
    bucketArns?: pulumi.Output<string[]>;
}

/**
 * Database output sharing patterns
 */
export interface DatabaseOutputs {
    clusterIdentifier?: pulumi.Output<string>;
    clusterArn?: pulumi.Output<string>;
    clusterEndpoint?: pulumi.Output<string>;
    readerEndpoint?: pulumi.Output<string>;
    databaseName?: pulumi.Output<string>;
    port?: pulumi.Output<number>;
}

/**
 * DNS and Certificate output sharing patterns
 */
export interface DNSCertificateOutputs {
    hostedZoneIds?: pulumi.Output<{ [domain: string]: string }>;
    nameServers?: pulumi.Output<{ [domain: string]: string[] }>;
    certificateArns?: pulumi.Output<{ [domain: string]: string }>;
    validationRecords?: pulumi.Output<any[]>;
}

/**
 * Helper function to share VPC outputs with other components
 */
export function shareVPCOutputs(
    componentName: string,
    outputs: NetworkingOutputs,
    registry: OutputRegistry = globalOutputRegistry
): void {
    if (outputs.vpcId) {
        registry.register(componentName, 'VPC', 'vpcId', outputs.vpcId);
    }
    if (outputs.vpcArn) {
        registry.register(componentName, 'VPC', 'vpcArn', outputs.vpcArn);
    }
    if (outputs.subnetIds) {
        registry.register(componentName, 'VPC', 'subnetIds', outputs.subnetIds);
    }
    if (outputs.subnetsByType) {
        registry.register(componentName, 'VPC', 'subnetsByType', outputs.subnetsByType);
    }
    if (outputs.securityGroupIds) {
        registry.register(componentName, 'VPC', 'securityGroupIds', outputs.securityGroupIds);
    }
    if (outputs.routeTableIds) {
        registry.register(componentName, 'VPC', 'routeTableIds', outputs.routeTableIds);
    }
    if (outputs.internetGatewayId) {
        registry.register(componentName, 'VPC', 'internetGatewayId', outputs.internetGatewayId);
    }
    if (outputs.natGatewayIds) {
        registry.register(componentName, 'VPC', 'natGatewayIds', outputs.natGatewayIds);
    }
    if (outputs.transitGatewayAttachmentId) {
        registry.register(componentName, 'VPC', 'transitGatewayAttachmentId', outputs.transitGatewayAttachmentId);
    }
}

/**
 * Helper function to share EKS outputs with other components
 */
export function shareEKSOutputs(
    componentName: string,
    outputs: ComputeOutputs,
    registry: OutputRegistry = globalOutputRegistry
): void {
    if (outputs.clusterName) {
        registry.register(componentName, 'EKS', 'clusterName', outputs.clusterName);
    }
    if (outputs.clusterArn) {
        registry.register(componentName, 'EKS', 'clusterArn', outputs.clusterArn);
    }
    if (outputs.clusterEndpoint) {
        registry.register(componentName, 'EKS', 'clusterEndpoint', outputs.clusterEndpoint);
    }
    if (outputs.clusterSecurityGroupId) {
        registry.register(componentName, 'EKS', 'clusterSecurityGroupId', outputs.clusterSecurityGroupId);
    }
    if (outputs.nodeGroupArns) {
        registry.register(componentName, 'EKS', 'nodeGroupArns', outputs.nodeGroupArns);
    }
    if (outputs.oidcIssuerUrl) {
        registry.register(componentName, 'EKS', 'oidcIssuerUrl', outputs.oidcIssuerUrl);
    }
}

/**
 * Helper function to share ECR outputs with other components
 */
export function shareECROutputs(
    componentName: string,
    outputs: StorageOutputs,
    registry: OutputRegistry = globalOutputRegistry
): void {
    if (outputs.repositoryUrls) {
        registry.register(componentName, 'ECR', 'repositoryUrls', outputs.repositoryUrls);
    }
    if (outputs.repositoryArns) {
        registry.register(componentName, 'ECR', 'repositoryArns', outputs.repositoryArns);
    }
}

/**
 * Helper function to share RDS outputs with other components
 */
export function shareRDSOutputs(
    componentName: string,
    outputs: DatabaseOutputs,
    registry: OutputRegistry = globalOutputRegistry
): void {
    if (outputs.clusterIdentifier) {
        registry.register(componentName, 'RDS', 'clusterIdentifier', outputs.clusterIdentifier);
    }
    if (outputs.clusterArn) {
        registry.register(componentName, 'RDS', 'clusterArn', outputs.clusterArn);
    }
    if (outputs.clusterEndpoint) {
        registry.register(componentName, 'RDS', 'clusterEndpoint', outputs.clusterEndpoint);
    }
    if (outputs.readerEndpoint) {
        registry.register(componentName, 'RDS', 'readerEndpoint', outputs.readerEndpoint);
    }
    if (outputs.databaseName) {
        registry.register(componentName, 'RDS', 'databaseName', outputs.databaseName);
    }
    if (outputs.port) {
        registry.register(componentName, 'RDS', 'port', outputs.port);
    }
}

/**
 * Helper function to share Route53 and ACM outputs
 */
export function shareDNSCertificateOutputs(
    componentName: string,
    outputs: DNSCertificateOutputs,
    registry: OutputRegistry = globalOutputRegistry
): void {
    if (outputs.hostedZoneIds) {
        registry.register(componentName, 'Route53', 'hostedZoneIds', outputs.hostedZoneIds);
    }
    if (outputs.nameServers) {
        registry.register(componentName, 'Route53', 'nameServers', outputs.nameServers);
    }
    if (outputs.certificateArns) {
        registry.register(componentName, 'ACM', 'certificateArns', outputs.certificateArns);
    }
    if (outputs.validationRecords) {
        registry.register(componentName, 'ACM', 'validationRecords', outputs.validationRecords);
    }
}

/**
 * Utility to create cross-stack references
 */
export function createStackReference(
    stackName: string,
    outputName: string
): pulumi.Output<any> {
    const stackRef = new pulumi.StackReference(stackName);
    return stackRef.getOutput(outputName);
}

/**
 * Utility to export outputs for cross-stack sharing
 */
export function exportForSharing(
    outputs: { [key: string]: pulumi.Output<any> }
): void {
    Object.entries(outputs).forEach(([key, value]) => {
        // Use the global export function from Pulumi
        (global as any).exports = (global as any).exports || {};
        (global as any).exports[key] = value;
    });
}

/**
 * Pattern for sharing outputs between stacks in the same project
 */
export class CrossStackOutputManager {
    private stackReferences: Map<string, pulumi.StackReference> = new Map();

    /**
     * Get a stack reference (cached)
     */
    private getStackReference(stackName: string): pulumi.StackReference {
        if (!this.stackReferences.has(stackName)) {
            this.stackReferences.set(stackName, new pulumi.StackReference(stackName));
        }
        return this.stackReferences.get(stackName)!;
    }

    /**
     * Get an output from another stack
     */
    getOutput<T>(stackName: string, outputName: string): pulumi.Output<T> {
        const stackRef = this.getStackReference(stackName);
        return stackRef.getOutput(outputName) as pulumi.Output<T>;
    }

    /**
     * Get multiple outputs from another stack
     */
    getOutputs<T extends Record<string, any>>(
        stackName: string,
        outputNames: (keyof T)[]
    ): { [K in keyof T]: pulumi.Output<T[K]> } {
        const stackRef = this.getStackReference(stackName);
        const result = {} as { [K in keyof T]: pulumi.Output<T[K]> };
        
        outputNames.forEach(outputName => {
            result[outputName] = stackRef.getOutput(outputName as string) as pulumi.Output<T[keyof T]>;
        });
        
        return result;
    }

    /**
     * Check if a stack output exists
     */
    async hasOutput(stackName: string, outputName: string): Promise<boolean> {
        try {
            const stackRef = this.getStackReference(stackName);
            await stackRef.getOutput(outputName);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Global cross-stack output manager instance
 */
export const globalCrossStackManager = new CrossStackOutputManager();