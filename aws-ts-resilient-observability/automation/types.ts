/**
 * Configuration types for multi-stack deployment automation
 */

export interface ComponentConfig {
    type: string;
    name: string;
    config: Record<string, any>;
    region?: string;
}

export interface StackConfig {
    name: string;
    workDir: string;
    stackName?: string;
    configFile?: string;
    description?: string;
    dependencies?: string[];
    components: ComponentConfig[];
    tags?: Record<string, string>;
    roleArn?: string;
}

export interface DeploymentConfig {
    name: string;
    description?: string;
    defaultRegion?: string;
    defaultTags?: Record<string, string>;
    stacks: StackConfig[];
    deploymentOptions?: {
        parallel?: boolean;
        continueOnFailure?: boolean;
        rollbackOnFailure?: boolean;
        refresh?: boolean;
    };
}

export interface DeploymentResult {
    stackName: string;
    success: boolean;
    outputs?: Record<string, any>;
    error?: string;
    duration?: number;
    retryCount?: number;
}

export interface DeploymentSummary {
    deploymentName: string;
    totalStacks: number;
    successfulStacks: number;
    failedStacks: number;
    results: DeploymentResult[];
    totalDuration: number;
}