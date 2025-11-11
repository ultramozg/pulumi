/**
 * AWS Provider configuration utilities for cross-account deployments
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { extractAccountIdFromArn } from "./aws-helpers";

/**
 * Create an AWS provider configured to assume a role in another account
 * @param roleArn Role ARN to assume
 * @param region AWS region for the provider
 * @param alias Optional alias for the provider
 * @returns Configured AWS provider
 */
export function createCrossAccountProvider(
    roleArn: string,
    region: string,
    alias?: string
): aws.Provider {
    const accountId = extractAccountIdFromArn(roleArn);
    
    const assumeRoleConfig: any = {
        roleArn: roleArn,
        sessionName: `pulumi-deployment-${Date.now()}`,
    };

    return new aws.Provider(`aws-${alias || accountId}-${region}`, {
        region: region,
        assumeRoles: [assumeRoleConfig],
        defaultTags: {
            tags: {
                "ManagedBy": "pulumi",
                "DeploymentAccount": accountId,
                "AssumedRole": "true"
            }
        }
    });
}

/**
 * Get or create a cached AWS provider for a role ARN and region
 * This helps avoid creating multiple providers for the same account/region combination
 */
const providerCache = new Map<string, aws.Provider>();

export function getCachedProvider(
    roleArn: string,
    region: string,
    alias?: string
): aws.Provider {
    const accountId = extractAccountIdFromArn(roleArn);
    const cacheKey = `${accountId}-${region}`;
    
    if (!providerCache.has(cacheKey)) {
        const provider = createCrossAccountProvider(roleArn, region, alias);
        providerCache.set(cacheKey, provider);
    }
    
    return providerCache.get(cacheKey)!;
}

/**
 * Create AWS providers for role ARNs and regions
 * @param roleArns List of role ARNs
 * @param regions List of regions to create providers for
 * @returns Map of providers keyed by "accountId-region"
 */
export function createProvidersForDeployment(
    roleArns: string[],
    regions: string[]
): Map<string, aws.Provider> {
    const providers = new Map<string, aws.Provider>();
    
    roleArns.forEach(roleArn => {
        const accountId = extractAccountIdFromArn(roleArn);
        regions.forEach(region => {
            const provider = createCrossAccountProvider(roleArn, region);
            providers.set(`${accountId}-${region}`, provider);
        });
    });
    
    return providers;
}

/**
 * Helper to get the current AWS account ID (useful for validation)
 */
export async function getCurrentAccountId(): Promise<string> {
    const caller = await aws.getCallerIdentity();
    return caller.accountId;
}

/**
 * Validate that we can assume the specified role
 * @param roleArn Role ARN to validate
 * @returns Promise that resolves if role assumption is successful
 */
export async function validateRoleAssumption(roleArn: string): Promise<void> {
    try {
        const expectedAccountId = extractAccountIdFromArn(roleArn);
        
        // Use AWS SDK directly for validation (not Pulumi functions)
        const AWS = require('aws-sdk');
        const sts = new AWS.STS();
        
        // Try to assume the role
        const assumeRoleParams = {
            RoleArn: roleArn,
            RoleSessionName: `pulumi-validation-${Date.now()}`,
            DurationSeconds: 900 // 15 minutes minimum
        };
        
        const assumeRoleResult = await sts.assumeRole(assumeRoleParams).promise();
        
        // Create temporary credentials and test them
        const tempCredentials = new AWS.Config({
            accessKeyId: assumeRoleResult.Credentials.AccessKeyId,
            secretAccessKey: assumeRoleResult.Credentials.SecretAccessKey,
            sessionToken: assumeRoleResult.Credentials.SessionToken,
            region: 'us-east-1'
        });
        
        const tempSts = new AWS.STS(tempCredentials);
        const identity = await tempSts.getCallerIdentity().promise();
        
        if (identity.Account !== expectedAccountId) {
            throw new Error(
                `Role assumption succeeded but landed in wrong account. ` +
                `Expected: ${expectedAccountId}, Got: ${identity.Account}`
            );
        }
        
        console.log(`✅ Successfully validated role assumption for account ${expectedAccountId}`);
    } catch (error) {
        throw new Error(
            `Failed to assume role ${roleArn}: ${error}`
        );
    }
}