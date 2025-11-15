/**
 * Provider Registry - Centralized AWS provider management
 * 
 * This registry ensures that only one AWS provider is created per region/account combination,
 * preventing duplicate provider resources and improving deployment performance.
 */

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

interface ProviderKey {
    region: string;
    accountId?: string;
    roleArn?: string;
}

/**
 * Global provider registry to ensure provider reuse across components
 */
class ProviderRegistry {
    private providers: Map<string, aws.Provider> = new Map();

    /**
     * Generate a unique cache key for a provider configuration
     */
    private getCacheKey(key: ProviderKey): string {
        const parts = [key.region];
        if (key.accountId) parts.push(key.accountId);
        if (key.roleArn) parts.push(key.roleArn);
        return parts.join('-');
    }

    /**
     * Get or create an AWS provider for the specified configuration
     * 
     * @param region AWS region
     * @param parent Optional parent resource for the provider
     * @param accountId Optional account ID for cross-account scenarios
     * @param roleArn Optional role ARN to assume
     * @returns Cached or newly created AWS provider
     */
    getOrCreateProvider(
        region: string,
        parent?: pulumi.Resource,
        accountId?: string,
        roleArn?: string
    ): aws.Provider {
        const key: ProviderKey = { region, accountId, roleArn };
        const cacheKey = this.getCacheKey(key);

        // Return cached provider if it exists
        if (this.providers.has(cacheKey)) {
            return this.providers.get(cacheKey)!;
        }

        // Create new provider
        const providerName = `aws-provider-${region}${accountId ? `-${accountId}` : ''}`;
        const providerConfig: aws.ProviderArgs = {
            region: region
        };

        // Add role assumption if specified
        if (roleArn) {
            providerConfig.assumeRoles = [{
                roleArn: roleArn,
                sessionName: `pulumi-deployment-${Date.now()}`
            }];
        } else {
            // Check for global AWS config
            const awsConfig = new pulumi.Config("aws");
            try {
                const assumeRoles = awsConfig.getObject<aws.types.input.ProviderAssumeRole[]>("assumeRoles");
                if (assumeRoles && assumeRoles.length > 0) {
                    providerConfig.assumeRoles = assumeRoles;
                }
            } catch {
                // No assumeRoles configured, use default credentials
            }
        }

        const provider = new aws.Provider(providerName, providerConfig, parent ? { parent } : undefined);
        
        // Cache the provider
        this.providers.set(cacheKey, provider);
        
        return provider;
    }

    /**
     * Clear all cached providers (useful for testing)
     */
    clear(): void {
        this.providers.clear();
    }

    /**
     * Get the number of cached providers
     */
    size(): number {
        return this.providers.size;
    }

    /**
     * Get all cached provider keys (for debugging)
     */
    getKeys(): string[] {
        return Array.from(this.providers.keys());
    }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();

/**
 * Helper function to get or create a provider (convenience wrapper)
 */
export function getProvider(
    region: string,
    parent?: pulumi.Resource,
    accountId?: string,
    roleArn?: string
): aws.Provider {
    return providerRegistry.getOrCreateProvider(region, parent, accountId, roleArn);
}
