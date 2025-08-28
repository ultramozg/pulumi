#!/usr/bin/env ts-node

import { InfrastructureAutomation } from './index';
import * as path from 'path';

/**
 * Multi-region deployment script for resilient observability platform
 */
async function main() {
    console.log("🚀 Starting multi-region resilient observability deployment...");
    
    // Validate required environment variables
    const requiredEnvVars = [
        'SHARED_SERVICES_ROLE_ARN',
        'SHARED_SERVICES_ACCOUNT_ID',
        'WORKLOADS_ROLE_ARN', 
        'WORKLOADS_ACCOUNT_ID'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        console.error("❌ Missing required environment variables:");
        missingVars.forEach(varName => console.error(`  - ${varName}`));
        console.error("\nPlease set these environment variables before running the deployment.");
        console.error("Example:");
        console.error("export SHARED_SERVICES_ROLE_ARN='arn:aws:iam::123456789012:role/PulumiExecutionRole'");
        console.error("export SHARED_SERVICES_ACCOUNT_ID='123456789012'");
        console.error("export WORKLOADS_ROLE_ARN='arn:aws:iam::987654321098:role/PulumiExecutionRole'");
        console.error("export WORKLOADS_ACCOUNT_ID='987654321098'");
        process.exit(1);
    }

    const automation = new InfrastructureAutomation({
        errorHandling: {
            maxRetries: 3,
            retryDelay: 5000,
            backoffMultiplier: 2
        }
    });

    try {
        // Deploy from configuration file
        const configPath = path.join(__dirname, 'deployment-config.json');
        
        console.log("📋 Loading deployment configuration...");
        const summary = await automation.deployFromConfig(configPath, {
            parallel: false, // Deploy sequentially to respect dependencies
            refresh: true,
            continueOnFailure: false,
            rollbackOnFailure: true
        });

        console.log("\n✅ Deployment Summary:");
        console.log(`Total stacks: ${summary.totalStacks}`);
        console.log(`Successful: ${summary.successful}`);
        console.log(`Failed: ${summary.failed}`);
        console.log(`Duration: ${summary.duration}ms`);

        if (summary.failed > 0) {
            console.log("\n❌ Failed stacks:");
            summary.results.forEach(result => {
                if (!result.success) {
                    console.log(`  - ${result.stackName}: ${result.error}`);
                }
            });
            process.exit(1);
        }

        console.log("\n🎉 Multi-region deployment completed successfully!");
        console.log("\n📊 Deployed Infrastructure:");
        console.log("  Shared Services Account:");
        console.log("    ├── us-east-1 (Primary)");
        console.log("    │   ├── Transit Gateway (ASN: 64512)");
        console.log("    │   ├── Hub VPC (10.0.0.0/16)");
        console.log("    │   └── Shared EKS Cluster");
        console.log("    └── us-west-2 (Secondary)");
        console.log("        ├── Transit Gateway (ASN: 64513)");
        console.log("        ├── Hub VPC (10.2.0.0/16)");
        console.log("        └── Shared EKS Cluster");
        console.log("  Workloads Account:");
        console.log("    ├── us-east-1 (Primary)");
        console.log("    │   ├── Spoke VPC (10.1.0.0/16)");
        console.log("    │   ├── Workload EKS Cluster");
        console.log("    │   ├── RDS Aurora Global DB (Primary)");
        console.log("    │   └── Route 53 Failover Records");
        console.log("    └── us-west-2 (Secondary)");
        console.log("        ├── Spoke VPC (10.3.0.0/16)");
        console.log("        ├── Workload EKS Cluster");
        console.log("        └── RDS Aurora Global DB (Secondary)");

    } catch (error) {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'deploy':
        main().catch(console.error);
        break;
    case 'destroy':
        destroyAll().catch(console.error);
        break;
    case 'preview':
        previewAll().catch(console.error);
        break;
    default:
        console.log("Usage: ts-node deploy.ts [deploy|destroy|preview]");
        console.log("  deploy  - Deploy all stacks");
        console.log("  destroy - Destroy all stacks");
        console.log("  preview - Preview all changes");
        break;
}

async function destroyAll() {
    console.log("🗑️  Starting destruction of all stacks...");
    
    const automation = new InfrastructureAutomation();
    const configPath = path.join(__dirname, 'deployment-config.json');
    
    try {
        const summary = await automation.destroyAll(
            await import(configPath),
            { parallel: false }
        );
        
        console.log("\n✅ Destruction Summary:");
        console.log(`Total stacks: ${summary.totalStacks}`);
        console.log(`Successful: ${summary.successful}`);
        console.log(`Failed: ${summary.failed}`);
        
    } catch (error) {
        console.error("❌ Destruction failed:", error);
        process.exit(1);
    }
}

async function previewAll() {
    console.log("👀 Previewing all stack changes...");
    
    const automation = new InfrastructureAutomation();
    const configPath = path.join(__dirname, 'deployment-config.json');
    
    try {
        const summary = await automation.previewAll(
            await import(configPath),
            { parallel: false, refresh: true }
        );
        
        console.log("\n📋 Preview Summary:");
        console.log(`Total stacks: ${summary.totalStacks}`);
        console.log(`Successful previews: ${summary.successful}`);
        console.log(`Failed previews: ${summary.failed}`);
        
    } catch (error) {
        console.error("❌ Preview failed:", error);
        process.exit(1);
    }
}