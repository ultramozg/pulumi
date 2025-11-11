/**
 * AWS-specific utility functions
 */

/**
 * Extract account ID from an AWS ARN
 * @param arn AWS ARN string
 * @returns Account ID extracted from the ARN
 * @throws Error if ARN format is invalid
 */
export function extractAccountIdFromArn(arn: string): string {
    if (!arn || typeof arn !== 'string') {
        throw new Error('ARN must be a non-empty string');
    }

    // AWS ARN format: arn:partition:service:region:account-id:resource
    const arnParts = arn.split(':');
    
    if (arnParts.length < 6 || arnParts[0] !== 'arn') {
        throw new Error(`Invalid ARN format: ${arn}`);
    }

    const accountId = arnParts[4];
    
    if (!accountId || !/^\d{12}$/.test(accountId)) {
        throw new Error(`Invalid account ID in ARN: ${arn}`);
    }

    return accountId;
}

/**
 * Parse AWS ARN into its components
 * @param arn AWS ARN string
 * @returns Parsed ARN components
 */
export interface ParsedArn {
    partition: string;
    service: string;
    region: string;
    accountId: string;
    resource: string;
    resourceType?: string;
    resourceId?: string;
}

export function parseArn(arn: string): ParsedArn {
    if (!arn || typeof arn !== 'string') {
        throw new Error('ARN must be a non-empty string');
    }

    const arnParts = arn.split(':');
    
    if (arnParts.length < 6 || arnParts[0] !== 'arn') {
        throw new Error(`Invalid ARN format: ${arn}`);
    }

    const [, partition, service, region, accountId, ...resourceParts] = arnParts;
    const resource = resourceParts.join(':');

    // Parse resource type and ID if applicable
    let resourceType: string | undefined;
    let resourceId: string | undefined;

    if (resource.includes('/')) {
        const resourceSplit = resource.split('/');
        resourceType = resourceSplit[0];
        resourceId = resourceSplit.slice(1).join('/');
    } else if (resource.includes(':')) {
        const resourceSplit = resource.split(':');
        resourceType = resourceSplit[0];
        resourceId = resourceSplit.slice(1).join(':');
    }

    return {
        partition,
        service,
        region,
        accountId,
        resource,
        resourceType,
        resourceId
    };
}

/**
 * Validate AWS account ID format
 * @param accountId Account ID to validate
 * @returns True if valid, false otherwise
 */
export function isValidAccountId(accountId: string): boolean {
    return typeof accountId === 'string' && /^\d{12}$/.test(accountId);
}

/**
 * Get account ID from environment variable (role ARN)
 * @param roleArnEnvVar Environment variable name containing the role ARN
 * @returns Account ID extracted from the role ARN
 */
export function getAccountIdFromEnv(roleArnEnvVar: string): string {
    const roleArn = process.env[roleArnEnvVar];
    
    if (!roleArn) {
        throw new Error(`Environment variable ${roleArnEnvVar} is not set`);
    }

    return extractAccountIdFromArn(roleArn);
}