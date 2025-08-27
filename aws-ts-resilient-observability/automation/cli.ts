#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { DeploymentOrchestrator } from './deployment-orchestrator';

/**
 * CLI interface for the automation API
 */
class AutomationCLI {
    private orchestrator: DeploymentOrchestrator;
    
    constructor() {
        this.orchestrator = new DeploymentOrchestrator();
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
        
        console.log(`Using configuration: ${configPath}`);
        
        const summary = await this.orchestrator.deployFromConfig(configPath, {
            parallel: options.parallel !== false,
            refresh: options.refresh === true,
            dryRun: false
        });
        
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
        
        console.log(`Using configuration: ${configPath}`);
        
        const summary = await this.orchestrator.deployFromConfig(configPath, {
            parallel: options.parallel !== false,
            refresh: options.refresh === true,
            dryRun: true
        });
        
        if (summary.failedStacks > 0) {
            process.exit(1);
        }
    }
    
    private parseOptions(args: string[]): Record<string, any> {
        const options: Record<string, any> = {};
        
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            if (arg.startsWith('--')) {
                const key = arg.slice(2);
                
                if (key === 'config' && i + 1 < args.length) {
                    options.config = args[i + 1];
                    i++; // Skip next argument
                } else if (key === 'no-parallel') {
                    options.parallel = false;
                } else if (key === 'refresh') {
                    options.refresh = true;
                } else if (key === 'force') {
                    options.force = true;
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
Infrastructure Automation CLI

Usage:
  automation <command> [options]

Commands:
  deploy    Deploy all stacks from configuration
  destroy   Destroy all stacks from configuration
  preview   Preview deployment changes
  help      Show this help message

Options:
  --config <path>    Path to deployment configuration file
  --no-parallel      Disable parallel deployment within groups
  --refresh          Refresh stack state before deployment
  --force            Skip confirmation prompts (for destroy)

Examples:
  automation deploy --config deployment.yaml
  automation preview --config deployment.yaml --refresh
  automation destroy --config deployment.yaml --force
        `);
    }
}

// Run CLI if this file is executed directly
if (require.main === module) {
    const cli = new AutomationCLI();
    cli.run().catch(console.error);
}

export { AutomationCLI };