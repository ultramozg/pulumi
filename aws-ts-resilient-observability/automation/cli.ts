#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DeploymentOrchestrator } from './deployment-orchestrator';
import { InfrastructureAutomation } from '../index';
import { ConfigManager } from './config-manager';

// Load environment variables from .env file if it exists
if (fs.existsSync('.env')) {
    dotenv.config();
    console.log('🔧 Loaded environment variables from .env file');
}

/**
 * Enhanced CLI interface for the automation API with run-all capabilities
 */
class AutomationCLI {
    private orchestrator: DeploymentOrchestrator;
    private automation: InfrastructureAutomation;
    
    constructor() {
        this.orchestrator = new DeploymentOrchestrator();
        this.automation = new InfrastructureAutomation();
    }
    
    async run() {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            this.printHelp();
            return;
        }
        
        const command = args[0];
        
        try {
            switch (command) {
                case 'deploy':
                    await this.handleDeploy(args.slice(1));
                    break;
                case 'destroy':
                    await this.handleDestroy(args.slice(1));
                    break;
                case 'preview':
                    await this.handlePreview(args.slice(1));
                    break;
                case 'run-all':
                    await this.handleRunAll(args.slice(1));
                    break;
                case 'deploy-components':
                    await this.handleDeployComponents(args.slice(1));
                    break;
                case 'validate':
                    await this.handleValidate(args.slice(1));
                    break;
                case 'status':
                    await this.handleStatus(args.slice(1));
                    break;
                case 'rollback':
                    await this.handleRollback(args.slice(1));
                    break;
                case 'help':
                    this.printHelp();
                    break;
                default:
                    console.error(`Unknown command: ${command}`);
                    this.printHelp();
                    process.exit(1);
            }
        } catch (error) {
            console.error(`Command failed: ${error}`);
            process.exit(1);
        }
    }
    
    private async handleDeploy(args: string[]) {
        const options = this.parseOptions(args);
        const configPath = options.config || this.findDefaultConfig();
        
        if (!configPath || !fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }
        
        console.log(`🚀 Deploying infrastructure from: ${configPath}`);
        
        // Load config and filter stacks if specified
        const config = ConfigManager.loadConfig(configPath);
        if (options.stacks) {
            const stacksToDeploy = options.stacks.split(',').map((s: string) => s.trim());
            config.stacks = config.stacks.filter(stack => stacksToDeploy.includes(stack.name));
            
            if (config.stacks.length === 0) {
                throw new Error(`No matching stacks found. Available stacks: ${ConfigManager.loadConfig(configPath).stacks.map(s => s.name).join(', ')}`);
            }
            
            console.log(`📦 Deploying only: ${config.stacks.map(s => s.name).join(', ')}`);
        }
        
        const summary = await this.automation.deployAll(config, {
            parallel: options.parallel !== false,
            refresh: options.refresh === true,
            continueOnFailure: options.continueOnFailure === true,
            rollbackOnFailure: options.rollbackOnFailure === true,
            dryRun: false
        });
        
        this.printDeploymentSummary(summary);
        
        if (summary.failedStacks > 0) {
            process.exit(1);
        }
    }
    
    private async handleDestroy(args: string[]) {
        const options = this.parseOptions(args);
        const configPath = options.config || this.findDefaultConfig();
        
        if (!configPath || !fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }
        
        console.log(`Using configuration: ${configPath}`);
        
        // Confirm destruction
        if (!options.force) {
            console.log('⚠️  This will destroy all resources in the deployment.');
            console.log('Use --force to skip this confirmation.');
            return;
        }
        
        const { ConfigManager } = await import('./config-manager');
        const config = ConfigManager.loadConfig(configPath);
        
        const summary = await this.orchestrator.destroyAll(config, {
            parallel: options.parallel !== false
        });
        
        if (summary.failedStacks > 0) {
            process.exit(1);
        }
    }
    
    private async handlePreview(args: string[]) {
        const options = this.parseOptions(args);
        const configPath = options.config || this.findDefaultConfig();
        
        if (!configPath || !fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }
        
        console.log(`🔍 Previewing infrastructure from: ${configPath}`);
        
        // Load config and filter stacks if specified
        const config = ConfigManager.loadConfig(configPath);
        if (options.stacks) {
            const stacksToDeploy = options.stacks.split(',').map((s: string) => s.trim());
            config.stacks = config.stacks.filter(stack => stacksToDeploy.includes(stack.name));
            
            if (config.stacks.length === 0) {
                throw new Error(`No matching stacks found. Available stacks: ${ConfigManager.loadConfig(configPath).stacks.map(s => s.name).join(', ')}`);
            }
            
            console.log(`📦 Previewing only: ${config.stacks.map(s => s.name).join(', ')}`);
        }
        
        const summary = await this.automation.previewAll(config, {
            parallel: options.parallel !== false,
            refresh: options.refresh === true,
            verbose: options.verbose === true
        });
        
        this.printDeploymentSummary(summary);
        
        if (summary.failedStacks > 0) {
            process.exit(1);
        }
    }
    
    private async handleRunAll(args: string[]) {
        const options = this.parseOptions(args);
        const region = options.region || 'us-east-1';
        const components = options.components ? options.components.split(',') : undefined;
        const exclude = options.exclude ? options.exclude.split(',') : undefined;
        
        console.log(`🚀 Running all components deployment in region: ${region}`);
        
        const config = this.automation.createComponentsConfig('run-all-deployment', {
            region,
            tags: {
                DeploymentType: 'run-all',
                Region: region,
                Timestamp: new Date().toISOString()
            },
            includeComponents: components,
            excludeComponents: exclude
        });
        
        const summary = await this.automation.deployAll(config, {
            parallel: options.parallel !== false,
            refresh: options.refresh === true,
            continueOnFailure: options.continueOnFailure === true,
            rollbackOnFailure: options.rollbackOnFailure === true
        });
        
        this.printDeploymentSummary(summary);
        
        if (summary.failedStacks > 0) {
            process.exit(1);
        }
    }
    
    private async handleDeployComponents(args: string[]) {
        const options = this.parseOptions(args);
        
        if (!options.components) {
            throw new Error('--components option is required. Specify components as comma-separated list.');
        }
        
        const region = options.region || 'us-east-1';
        const components = options.components.split(',');
        
        console.log(`🚀 Deploying specific components: ${components.join(', ')}`);
        
        const config = this.automation.createComponentsConfig('component-deployment', {
            region,
            tags: {
                DeploymentType: 'component-specific',
                Region: region,
                Components: components.join(',')
            },
            includeComponents: components
        });
        
        const summary = await this.automation.deployAll(config, {
            parallel: options.parallel !== false,
            refresh: options.refresh === true,
            continueOnFailure: options.continueOnFailure === true,
            rollbackOnFailure: options.rollbackOnFailure === true
        });
        
        this.printDeploymentSummary(summary);
        
        if (summary.failedStacks > 0) {
            process.exit(1);
        }
    }
    
    private async handleValidate(args: string[]) {
        const options = this.parseOptions(args);
        const configPath = options.config || this.findDefaultConfig();
        
        if (!configPath || !fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }
        
        console.log(`🔍 Validating configuration: ${configPath}`);
        
        try {
            const config = ConfigManager.loadConfig(configPath);
            console.log(`✅ Configuration is valid`);
            console.log(`   Deployment: ${config.name}`);
            console.log(`   Stacks: ${config.stacks.length}`);
            console.log(`   Default Region: ${config.defaultRegion || 'not specified'}`);
            
            // Validate dependencies
            const stackNames = config.stacks.map(s => s.name);
            for (const stack of config.stacks) {
                if (stack.dependencies) {
                    for (const dep of stack.dependencies) {
                        if (!stackNames.includes(dep)) {
                            throw new Error(`Stack '${stack.name}' depends on '${dep}' which is not defined`);
                        }
                    }
                }
            }
            
            console.log(`✅ All dependencies are valid`);
        } catch (error) {
            console.error(`❌ Configuration validation failed: ${error}`);
            process.exit(1);
        }
    }
    
    private async handleStatus(args: string[]) {
        const options = this.parseOptions(args);
        const configPath = options.config || this.findDefaultConfig();
        
        if (!configPath || !fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }
        
        console.log(`📊 Checking deployment status from: ${configPath}`);
        
        // This would require implementing stack status checking
        // For now, just show configuration info
        const config = ConfigManager.loadConfig(configPath);
        console.log(`\nDeployment: ${config.name}`);
        console.log(`Stacks (${config.stacks.length}):`);
        
        for (const stack of config.stacks) {
            console.log(`  📦 ${stack.name}`);
            console.log(`     Work Dir: ${stack.workDir}`);
            console.log(`     Components: ${stack.components.length}`);
            if (stack.dependencies && stack.dependencies.length > 0) {
                console.log(`     Dependencies: ${stack.dependencies.join(', ')}`);
            }
        }
    }
    
    private async handleRollback(args: string[]) {
        const options = this.parseOptions(args);
        const configPath = options.config || this.findDefaultConfig();
        
        if (!configPath || !fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }
        
        if (!options.force) {
            console.log('⚠️  This will destroy all resources in the deployment.');
            console.log('Use --force to confirm rollback.');
            return;
        }
        
        console.log(`🔄 Rolling back deployment from: ${configPath}`);
        
        const config = ConfigManager.loadConfig(configPath);
        const summary = await this.automation.destroyAll(config, {
            parallel: options.parallel !== false
        });
        
        this.printDeploymentSummary(summary);
        
        if (summary.failedStacks > 0) {
            process.exit(1);
        }
    }
    
    private printDeploymentSummary(summary: any) {
        console.log(`\n📊 Deployment Summary: ${summary.deploymentName}`);
        console.log(`   Total stacks: ${summary.totalStacks}`);
        console.log(`   Successful: ${summary.successfulStacks} ✅`);
        console.log(`   Failed: ${summary.failedStacks} ${summary.failedStacks > 0 ? '❌' : ''}`);
        console.log(`   Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);
        
        if (summary.failedStacks > 0) {
            console.log(`\n❌ Failed stacks:`);
            summary.results
                .filter((r: any) => !r.success)
                .forEach((result: any) => {
                    console.log(`   ${result.stackName}: ${result.error}`);
                });
        }
        
        if (summary.successfulStacks > 0) {
            console.log(`\n✅ Successful stacks:`);
            summary.results
                .filter((r: any) => r.success)
                .forEach((result: any) => {
                    const duration = result.duration ? `(${(result.duration / 1000).toFixed(2)}s)` : '';
                    console.log(`   ${result.stackName} ${duration}`);
                });
        }
    }
    
    private parseOptions(args: string[]): Record<string, any> {
        const options: Record<string, any> = {};
        
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            if (arg.startsWith('--')) {
                const key = arg.slice(2);
                
                if (['config', 'region', 'components', 'exclude', 'stacks'].includes(key) && i + 1 < args.length) {
                    options[key] = args[i + 1];
                    i++; // Skip next argument
                } else if (key === 'no-parallel') {
                    options.parallel = false;
                } else if (['refresh', 'force', 'continue-on-failure', 'rollback-on-failure', 'verbose'].includes(key)) {
                    options[key.replace('-', '')] = true;
                } else {
                    options[key] = true;
                }
            }
        }
        
        return options;
    }
    
    private findDefaultConfig(): string | null {
        const possiblePaths = [
            'deployment.yaml',
            'deployment.yml',
            'config/deployment.yaml',
            'config/deployment.yml',
            '.kiro/deployment.yaml',
            '.kiro/deployment.yml'
        ];
        
        for (const configPath of possiblePaths) {
            if (fs.existsSync(configPath)) {
                return configPath;
            }
        }
        
        return null;
    }
    
    private printHelp() {
        console.log(`
Infrastructure Automation CLI - Run-All Capabilities

Usage:
  automation <command> [options]

Commands:
  deploy              Deploy all stacks from configuration file
  destroy             Destroy all stacks from configuration file
  preview             Preview deployment changes without applying
  run-all             Deploy all available components with default configuration
  deploy-components   Deploy specific components only
  validate            Validate deployment configuration file
  status              Show deployment status and configuration info
  rollback            Rollback (destroy) entire deployment
  help                Show this help message

Options:
  --config <path>           Path to deployment configuration file
  --stacks <list>           Comma-separated list of stack names to deploy
  --region <region>         AWS region for deployment (default: us-east-1)
  --components <list>       Comma-separated list of components to deploy
  --exclude <list>          Comma-separated list of components to exclude
  --no-parallel             Disable parallel deployment within groups
  --refresh                 Refresh stack state before deployment
  --continue-on-failure     Continue deployment even if some stacks fail
  --rollback-on-failure     Automatically rollback on deployment failure
  --verbose                 Show detailed preview information
  --force                   Skip confirmation prompts

Examples:
  # Deploy from configuration file
  automation deploy --config deployment-config.json --rollback-on-failure
  
  # Deploy only shared services stacks
  automation deploy --config deployment-config.json --stacks shared-services-primary
  
  # Deploy both shared services stacks
  automation deploy --config deployment-config.json --stacks shared-services-primary,shared-services-secondary
  
  # Preview changes with refresh
  automation preview --config deployment-config.json --refresh
  
  # Deploy all components with default settings
  automation run-all --region us-west-2
  
  # Deploy specific components only
  automation deploy-components --components vpc,ecr,eks --region us-east-1
  
  # Deploy excluding certain components
  automation run-all --exclude rds,eks --region us-east-1
  
  # Validate configuration
  automation validate --config deployment.yaml
  
  # Check deployment status
  automation status --config deployment.yaml
  
  # Rollback entire deployment
  automation rollback --config deployment.yaml --force
  
  # Destroy with parallel execution
  automation destroy --config deployment.yaml --force --no-parallel
        `);
    }
}

// Run CLI if this file is executed directly
if (require.main === module) {
    const cli = new AutomationCLI();
    cli.run().catch(console.error);
}

export { AutomationCLI };