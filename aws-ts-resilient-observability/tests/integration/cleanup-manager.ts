import * as automation from "@pulumi/pulumi/automation";
import * as fs from "fs";
import * as path from "path";

/**
 * Automated cleanup manager for integration test resources
 * Provides mechanisms to track and clean up test resources automatically
 */

export interface CleanupResource {
    type: 'stack' | 'workspace' | 'file';
    identifier: string;
    metadata?: Record<string, any>;
    createdAt: Date;
}

export interface CleanupConfig {
    maxAge?: number; // Maximum age in milliseconds before auto-cleanup
    dryRun?: boolean; // If true, only log what would be cleaned up
    forceCleanup?: boolean; // If true, ignore errors and continue cleanup
}

/**
 * Manages cleanup of integration test resources
 */
export class CleanupManager {
    private readonly cleanupFilePath: string;
    private readonly resources: Map<string, CleanupResource> = new Map();

    constructor(cleanupFile?: string) {
        this.cleanupFilePath = cleanupFile || path.join(__dirname, '.cleanup-registry.json');
        this.loadCleanupRegistry();
    }

    /**
     * Register a resource for cleanup
     */
    registerResource(resource: CleanupResource): void {
        const key = `${resource.type}:${resource.identifier}`;
        this.resources.set(key, resource);
        this.saveCleanupRegistry();
    }

    /**
     * Register a Pulumi stack for cleanup
     */
    registerStack(stack: automation.Stack, metadata?: Record<string, any>): void {
        this.registerResource({
            type: 'stack',
            identifier: stack.name,
            metadata: {
                workDir: stack.workspace.workDir,
                ...metadata
            },
            createdAt: new Date()
        });
    }

    /**
     * Register a workspace directory for cleanup
     */
    registerWorkspace(workspaceDir: string, metadata?: Record<string, any>): void {
        this.registerResource({
            type: 'workspace',
            identifier: workspaceDir,
            metadata,
            createdAt: new Date()
        });
    }

    /**
     * Register a file for cleanup
     */
    registerFile(filePath: string, metadata?: Record<string, any>): void {
        this.registerResource({
            type: 'file',
            identifier: filePath,
            metadata,
            createdAt: new Date()
        });
    }

    /**
     * Clean up all registered resources
     */
    async cleanupAll(config: CleanupConfig = {}): Promise<void> {
        console.log(`🧹 Starting cleanup of ${this.resources.size} registered resources...`);

        const results = {
            successful: 0,
            failed: 0,
            skipped: 0
        };

        // Sort resources by type (stacks first, then workspaces, then files)
        const sortedResources = Array.from(this.resources.entries()).sort(([, a], [, b]) => {
            const typeOrder = { stack: 0, workspace: 1, file: 2 };
            return typeOrder[a.type] - typeOrder[b.type];
        });

        for (const [key, resource] of sortedResources) {
            try {
                const shouldCleanup = this.shouldCleanupResource(resource, config);
                
                if (!shouldCleanup) {
                    console.log(`   ⏭️  Skipping ${resource.type}: ${resource.identifier}`);
                    results.skipped++;
                    continue;
                }

                if (config.dryRun) {
                    console.log(`   🔍 Would cleanup ${resource.type}: ${resource.identifier}`);
                    results.skipped++;
                    continue;
                }

                await this.cleanupResource(resource);
                console.log(`   ✅ Cleaned up ${resource.type}: ${resource.identifier}`);
                results.successful++;

                // Remove from registry after successful cleanup
                this.resources.delete(key);

            } catch (error) {
                console.error(`   ❌ Failed to cleanup ${resource.type}: ${resource.identifier} - ${error}`);
                results.failed++;

                if (!config.forceCleanup) {
                    throw error;
                }
            }
        }

        // Save updated registry
        this.saveCleanupRegistry();

        console.log(`✅ Cleanup completed:`);
        console.log(`   Successful: ${results.successful}`);
        console.log(`   Failed: ${results.failed}`);
        console.log(`   Skipped: ${results.skipped}`);
    }

    /**
     * Clean up resources older than specified age
     */
    async cleanupOldResources(maxAgeMs: number, config: CleanupConfig = {}): Promise<void> {
        const cutoffTime = new Date(Date.now() - maxAgeMs);
        console.log(`🧹 Cleaning up resources older than ${new Date(cutoffTime).toISOString()}...`);

        const oldResources = Array.from(this.resources.entries()).filter(([, resource]) => 
            resource.createdAt < cutoffTime
        );

        if (oldResources.length === 0) {
            console.log('   No old resources found');
            return;
        }

        console.log(`   Found ${oldResources.length} old resources`);

        for (const [key, resource] of oldResources) {
            try {
                if (config.dryRun) {
                    console.log(`   🔍 Would cleanup old ${resource.type}: ${resource.identifier}`);
                    continue;
                }

                await this.cleanupResource(resource);
                console.log(`   ✅ Cleaned up old ${resource.type}: ${resource.identifier}`);
                this.resources.delete(key);

            } catch (error) {
                console.error(`   ❌ Failed to cleanup old ${resource.type}: ${resource.identifier} - ${error}`);
                
                if (!config.forceCleanup) {
                    throw error;
                }
            }
        }

        this.saveCleanupRegistry();
    }

    /**
     * Clean up resources by type
     */
    async cleanupByType(type: CleanupResource['type'], config: CleanupConfig = {}): Promise<void> {
        console.log(`🧹 Cleaning up all ${type} resources...`);

        const resourcesOfType = Array.from(this.resources.entries()).filter(([, resource]) => 
            resource.type === type
        );

        if (resourcesOfType.length === 0) {
            console.log(`   No ${type} resources found`);
            return;
        }

        for (const [key, resource] of resourcesOfType) {
            try {
                if (config.dryRun) {
                    console.log(`   🔍 Would cleanup ${resource.type}: ${resource.identifier}`);
                    continue;
                }

                await this.cleanupResource(resource);
                console.log(`   ✅ Cleaned up ${resource.type}: ${resource.identifier}`);
                this.resources.delete(key);

            } catch (error) {
                console.error(`   ❌ Failed to cleanup ${resource.type}: ${resource.identifier} - ${error}`);
                
                if (!config.forceCleanup) {
                    throw error;
                }
            }
        }

        this.saveCleanupRegistry();
    }

    /**
     * Get list of registered resources
     */
    getRegisteredResources(): CleanupResource[] {
        return Array.from(this.resources.values());
    }

    /**
     * Get count of registered resources by type
     */
    getResourceCounts(): Record<string, number> {
        const counts: Record<string, number> = { stack: 0, workspace: 0, file: 0 };
        
        for (const resource of Array.from(this.resources.values())) {
            counts[resource.type]++;
        }

        return counts;
    }

    /**
     * Clear all registered resources (without cleanup)
     */
    clearRegistry(): void {
        this.resources.clear();
        this.saveCleanupRegistry();
    }

    /**
     * Determine if a resource should be cleaned up
     */
    private shouldCleanupResource(resource: CleanupResource, config: CleanupConfig): boolean {
        if (config.maxAge) {
            const age = Date.now() - resource.createdAt.getTime();
            return age > config.maxAge;
        }

        return true; // Default to cleanup
    }

    /**
     * Clean up a specific resource
     */
    private async cleanupResource(resource: CleanupResource): Promise<void> {
        switch (resource.type) {
            case 'stack':
                await this.cleanupStack(resource);
                break;
            case 'workspace':
                await this.cleanupWorkspace(resource);
                break;
            case 'file':
                await this.cleanupFileResource(resource);
                break;
            default:
                throw new Error(`Unknown resource type: ${resource.type}`);
        }
    }

    /**
     * Clean up a Pulumi stack
     */
    private async cleanupStack(resource: CleanupResource): Promise<void> {
        try {
            const workDir = resource.metadata?.workDir || './';
            
            const stack = await automation.LocalWorkspace.selectStack({
                stackName: resource.identifier,
                workDir: workDir
            });

            // Destroy the stack
            await stack.destroy();

            // Remove the stack
            await stack.workspace.removeStack(resource.identifier);

        } catch (error) {
            // If stack doesn't exist, that's fine
            if (error instanceof Error && error.message.includes('not found')) {
                return;
            }
            throw error;
        }
    }

    /**
     * Clean up a workspace directory
     */
    private async cleanupWorkspace(resource: CleanupResource): Promise<void> {
        if (fs.existsSync(resource.identifier)) {
            fs.rmSync(resource.identifier, { recursive: true, force: true });
        }
    }

    /**
     * Clean up a file
     */
    private async cleanupFileResource(resource: CleanupResource): Promise<void> {
        if (fs.existsSync(resource.identifier)) {
            fs.unlinkSync(resource.identifier);
        }
    }

    /**
     * Load cleanup registry from file
     */
    private loadCleanupRegistry(): void {
        try {
            if (fs.existsSync(this.cleanupFilePath)) {
                const data = fs.readFileSync(this.cleanupFilePath, 'utf8');
                const registry = JSON.parse(data);
                
                for (const [key, resourceData] of Object.entries(registry)) {
                    const resource = resourceData as any;
                    resource.createdAt = new Date(resource.createdAt);
                    this.resources.set(key, resource);
                }
            }
        } catch (error) {
            console.warn(`Failed to load cleanup registry: ${error}`);
            // Continue with empty registry
        }
    }

    /**
     * Save cleanup registry to file
     */
    private saveCleanupRegistry(): void {
        try {
            const registry = Object.fromEntries(this.resources.entries());
            const data = JSON.stringify(registry, null, 2);
            
            // Ensure directory exists
            const dir = path.dirname(this.cleanupFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(this.cleanupFilePath, data);
        } catch (error) {
            console.warn(`Failed to save cleanup registry: ${error}`);
        }
    }
}

/**
 * Global cleanup manager instance
 */
export const globalCleanupManager = new CleanupManager();

/**
 * Jest setup for automatic cleanup
 */
export const setupCleanupForJest = () => {
    // Register cleanup on process exit
    process.on('exit', () => {
        // Synchronous cleanup only
        console.log('🧹 Process exiting, performing emergency cleanup...');
    });

    // Register cleanup on unhandled errors
    process.on('uncaughtException', async (error) => {
        console.error('Uncaught exception, performing cleanup...', error);
        try {
            await globalCleanupManager.cleanupAll({ forceCleanup: true });
        } catch (cleanupError) {
            console.error('Cleanup failed:', cleanupError);
        }
        process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
        console.error('Unhandled rejection, performing cleanup...', reason);
        try {
            await globalCleanupManager.cleanupAll({ forceCleanup: true });
        } catch (cleanupError) {
            console.error('Cleanup failed:', cleanupError);
        }
        process.exit(1);
    });
};

/**
 * Enhanced IntegrationTestHelper with automatic cleanup registration
 */
export class CleanupAwareTestHelper {
    private readonly testHelper: any; // Import from test-utils
    private readonly cleanupManager: CleanupManager;

    constructor(testPrefix: string, cleanupManager?: CleanupManager) {
        // This would import IntegrationTestHelper from test-utils
        // this.testHelper = new IntegrationTestHelper(testPrefix);
        this.cleanupManager = cleanupManager || globalCleanupManager;
    }

    /**
     * Create test stack with automatic cleanup registration
     */
    async createTestStack(config: any): Promise<any> {
        const stack = await this.testHelper.createTestStack(config);
        this.cleanupManager.registerStack(stack, {
            testPrefix: this.testHelper.testPrefix,
            createdBy: 'integration-test'
        });
        return stack;
    }

    /**
     * Create test workspace with automatic cleanup registration
     */
    createTestWorkspace(testName: string): string {
        const workspaceDir = this.testHelper.createTestWorkspace(testName);
        this.cleanupManager.registerWorkspace(workspaceDir, {
            testName,
            createdBy: 'integration-test'
        });
        return workspaceDir;
    }

    /**
     * Cleanup with both test helper and cleanup manager
     */
    async cleanup(): Promise<void> {
        await this.testHelper.cleanup();
        await this.cleanupManager.cleanupAll({ forceCleanup: true });
    }
}