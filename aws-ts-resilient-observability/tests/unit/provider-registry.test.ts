/**
 * Tests for Provider Registry
 */

import { providerRegistry, getProvider } from '../../components/shared/utils/provider-registry';

describe('ProviderRegistry', () => {
    beforeEach(() => {
        // Clear the registry before each test
        providerRegistry.clear();
    });

    describe('getProvider', () => {
        it('should create a provider for a region', () => {
            const provider = getProvider('us-east-1');
            expect(provider).toBeDefined();
            expect(providerRegistry.size()).toBe(1);
        });

        it('should reuse provider for the same region', () => {
            const provider1 = getProvider('us-east-1');
            const provider2 = getProvider('us-east-1');
            
            // Should be the exact same instance
            expect(provider1).toBe(provider2);
            expect(providerRegistry.size()).toBe(1);
        });

        it('should create separate providers for different regions', () => {
            const provider1 = getProvider('us-east-1');
            const provider2 = getProvider('us-west-2');
            
            expect(provider1).not.toBe(provider2);
            expect(providerRegistry.size()).toBe(2);
        });

        it('should create separate providers for different accounts', () => {
            const provider1 = getProvider('us-east-1', undefined, '123456789012');
            const provider2 = getProvider('us-east-1', undefined, '987654321098');
            
            expect(provider1).not.toBe(provider2);
            expect(providerRegistry.size()).toBe(2);
        });

        it('should reuse provider for same region and account', () => {
            const provider1 = getProvider('us-east-1', undefined, '123456789012');
            const provider2 = getProvider('us-east-1', undefined, '123456789012');
            
            expect(provider1).toBe(provider2);
            expect(providerRegistry.size()).toBe(1);
        });

        it('should handle multiple regions and accounts', () => {
            const regions = ['us-east-1', 'us-west-2', 'eu-west-1'];
            const accounts = ['123456789012', '987654321098'];
            
            const providers: any[] = [];
            regions.forEach(region => {
                accounts.forEach(account => {
                    providers.push(getProvider(region, undefined, account));
                });
            });
            
            // Should have 6 unique providers (3 regions × 2 accounts)
            expect(providerRegistry.size()).toBe(6);
            
            // Verify all providers are unique
            const uniqueProviders = new Set(providers);
            expect(uniqueProviders.size).toBe(6);
        });
    });

    describe('providerRegistry', () => {
        it('should clear all cached providers', () => {
            getProvider('us-east-1');
            getProvider('us-west-2');
            expect(providerRegistry.size()).toBe(2);
            
            providerRegistry.clear();
            expect(providerRegistry.size()).toBe(0);
        });

        it('should return correct cache keys', () => {
            getProvider('us-east-1');
            getProvider('us-west-2', undefined, '123456789012');
            
            const keys = providerRegistry.getKeys();
            expect(keys).toHaveLength(2);
            expect(keys).toContain('us-east-1');
            expect(keys).toContain('us-west-2-123456789012');
        });
    });
});
