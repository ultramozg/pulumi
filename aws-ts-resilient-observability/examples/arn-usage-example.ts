/**
 * Example: Using ARN utilities to extract account IDs
 * 
 * This example demonstrates how to use the new ARN utility functions
 * to extract account IDs from role ARNs instead of maintaining separate
 * environment variables.
 */

import { extractAccountIdFromArn, getAccountIdFromEnv, parseArn } from '../components/utils';

// Example 1: Extract account ID from environment variable containing role ARN
function getSharedServicesAccountId(): string {
    return getAccountIdFromEnv('SHARED_SERVICES_ROLE_ARN');
}

function getWorkloadsAccountId(): string {
    return getAccountIdFromEnv('WORKLOADS_ROLE_ARN');
}

// Example 2: Extract account ID from a known ARN string
function extractAccountFromRoleArn(roleArn: string): string {
    return extractAccountIdFromArn(roleArn);
}

// Example 3: Parse complete ARN for detailed information
function analyzeRoleArn(roleArn: string) {
    const parsed = parseArn(roleArn);
    
    return {
        accountId: parsed.accountId,
        roleName: parsed.resourceId,
        region: parsed.region || 'global', // IAM is global
        service: parsed.service
    };
}

// Usage examples
export function demonstrateArnUtilities() {
    console.log('=== ARN Utilities Demo ===');
    
    // Simulate environment variables
    process.env.SHARED_SERVICES_ROLE_ARN = 'arn:aws:iam::123456789012:role/PulumiExecutionRole';
    process.env.WORKLOADS_ROLE_ARN = 'arn:aws:iam::987654321098:role/PulumiExecutionRole';
    
    try {
        // Extract account IDs from environment
        const sharedServicesAccount = getSharedServicesAccountId();
        const workloadsAccount = getWorkloadsAccountId();
        
        console.log(`Shared Services Account: ${sharedServicesAccount}`);
        console.log(`Workloads Account: ${workloadsAccount}`);
        
        // Parse role ARN for detailed info
        const roleInfo = analyzeRoleArn(process.env.SHARED_SERVICES_ROLE_ARN!);
        console.log('Role Analysis:', roleInfo);
        
        // Direct extraction from ARN string
        const directExtraction = extractAccountFromRoleArn(
            'arn:aws:iam::555666777888:role/CrossAccountRole'
        );
        console.log(`Direct extraction: ${directExtraction}`);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

// Run the demo if this file is executed directly
if (require.main === module) {
    demonstrateArnUtilities();
}