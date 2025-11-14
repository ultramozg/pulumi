import * as pulumi from "@pulumi/pulumi";

/**
 * Common interfaces used across multiple components
 */

/**
 * Security group rule specification
 */
export interface SecurityGroupRule {
    type: 'ingress' | 'egress';
    fromPort: number;
    toPort: number;
    protocol: string;
    cidrBlocks?: string[];
    securityGroupIds?: string[];
    description?: string;
}

/**
 * Subnet specification for VPC components
 */
export interface SubnetSpec {
    type: 'public' | 'private' | 'transit-gateway';
    /** Subnet prefix length (e.g., 24 for /24) */
    subnetPrefix: number;
    /** Number of host bits (deprecated, use subnetPrefix instead) */
    cidrPrefix?: number;
    /** Number of subnets to create (one per AZ) */
    availabilityZones: number;
}

/**
 * Common deployment configuration
 */
export interface DeploymentConfig {
    name: string;
    environment: string;
    stacks: StackConfig[];
}

/**
 * Stack configuration for automation API
 */
export interface StackConfig {
    name: string;
    dependencies?: string[];
    components: ComponentSpec[];
}

/**
 * Component specification for deployment
 */
export interface ComponentSpec {
    type: string;
    name: string;
    config: { [key: string]: any };
}

/**
 * Common output interface for components that create networking resources
 */
export interface NetworkingOutputs {
    vpcId?: pulumi.Output<string>;
    subnetIds?: pulumi.Output<string[]>;
    securityGroupIds?: pulumi.Output<string[]>;
    routeTableIds?: pulumi.Output<string[]>;
}

/**
 * Common output interface for components that create compute resources
 */
export interface ComputeOutputs {
    clusterName?: pulumi.Output<string>;
    clusterEndpoint?: pulumi.Output<string>;
    clusterArn?: pulumi.Output<string>;
}

/**
 * Common output interface for components that create storage resources
 */
export interface StorageOutputs {
    bucketName?: pulumi.Output<string>;
    bucketArn?: pulumi.Output<string>;
    repositoryUrl?: pulumi.Output<string>;
    repositoryArn?: pulumi.Output<string>;
}