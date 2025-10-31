#!/usr/bin/env npx ts-node

/**
 * Deployment script demonstrating the new role assumption approach
 * 
 * This script shows how to deploy using the new account configuration
 * without needing environment variables for role ARNs.
 */

import { DeploymentOrchestrator } from '../automation/deployment-orchestrator';
import { ConfigManager } from '../automation/config-manager';
import path from 'path';

async function main() {
    console.log('🚀 Starting deployment with role assumption...');
    
    try {
        // Load configuration from file
        const configPath = path.join(__dirname, '..', 'deployment-config.json');
        const config = ConfigManager.loadConfig(configPath);
        
        console.log(`📋 Loaded configuration: ${config.name}`);
        console.log(`📊 Total stacks: ${config.stacks.length}`);
        
        if (config.accounts) {
            console.log('🔐 Account configuration:');
            Object.entries(config.accounts).forEach(([name, account]) => {
                console.log(`   ${name}: ${account.accountId} (${account.roleArn})`);
            });
        }
        
        // Create orchestrator
        const orchestrator = new DeploymentOrchestrator({
            strategy: 'RETRY',
            maxRetries: 3,
            retryDelay: 5000
        });
        
        // Deploy with options
        const summary = await orchestrator.deployAll(config, {
            parallel: false,
            dryRun: process.argv.includes('--dry-run'),
            refresh: true,
            continueOnFailure: false,
            rollbackOnFailure: true
        });
        
        console.log('\n🎉 Deployment completed!');
        console.log(`✅ Successful stacks: ${summary.successfulStacks}`);
        console.log(`❌ Failed stacks: ${summary.failedStacks}`);
        console.log(`⏱️  Total duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);
        
        if (summary.failedStacks > 0) {
            process.exit(1);
        }
        
    } catch (error) {
        console.error('💥 Deployment failed:', error);
        process.exit(1);
    }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: npx ts-node scripts/deploy-with-role-assumption.ts [options]

Options:
  --dry-run    Preview changes without applying them
  --help, -h   Show this help message

Examples:
  npx ts-node scripts/deploy-with-role-assumption.ts
  npx ts-node scripts/deploy-with-role-assumption.ts --dry-run
`);
    process.exit(0);
}

// Run the deployment
main().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
});