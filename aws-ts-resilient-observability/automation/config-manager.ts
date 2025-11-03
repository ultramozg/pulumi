import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { DeploymentConfig, StackConfig } from './types';

/**
 * Configuration management for deployment specifications
 */
export class ConfigManager {
    /**
     * Load deployment configuration from YAML file
     * @param configPath Path to the configuration file
     * @returns Parsed deployment configuration
     */
    public static loadConfig(configPath: string): DeploymentConfig {
        try {
            let configContent = fs.readFileSync(configPath, 'utf8');
            
            // Substitute environment variables
            configContent = this.substituteEnvironmentVariables(configContent);
            
            const config = yaml.load(configContent) as DeploymentConfig;
            
            this.validateConfig(config);
            this.normalizeConfig(config);
            
            return config;
        } catch (error) {
            throw new Error(`Failed to load configuration from ${configPath}: ${error}`);
        }
    }
    
    /**
     * Create a deployment configuration programmatically
     * @param name Deployment name
     * @param stacks Array of stack configurations
     * @param options Optional deployment options
     * @returns Deployment configuration
     */
    public static createConfig(
        name: string,
        stacks: StackConfig[],
        options?: {
            defaultRegion?: string;
            defaultTags?: Record<string, string>;
        }
    ): DeploymentConfig {
        const config: DeploymentConfig = {
            name,
            stacks,
            ...options
        };
        
        this.validateConfig(config);
        this.normalizeConfig(config);
        
        return config;
    }
    
    /**
     * Save deployment configuration to YAML file
     * @param config Deployment configuration
     * @param outputPath Output file path
     */
    public static saveConfig(config: DeploymentConfig, outputPath: string): void {
        try {
            const yamlContent = yaml.dump(config, {
                indent: 2,
                lineWidth: 120,
                noRefs: true
            });
            
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(outputPath, yamlContent, 'utf8');
        } catch (error) {
            throw new Error(`Failed to save configuration to ${outputPath}: ${error}`);
        }
    }
    
    private static validateConfig(config: DeploymentConfig): void {
        if (!config.name) {
            throw new Error('Deployment configuration must have a name');
        }
        
        if (!config.stacks || config.stacks.length === 0) {
            throw new Error('Deployment configuration must have at least one stack');
        }
        
        const stackNames = new Set<string>();
        for (const stack of config.stacks) {
            if (!stack.name) {
                throw new Error('Stack configuration must have a name');
            }
            
            if (stackNames.has(stack.name)) {
                throw new Error(`Duplicate stack name: ${stack.name}`);
            }
            stackNames.add(stack.name);
            
            if (!stack.workDir) {
                throw new Error(`Stack '${stack.name}' must have a workDir`);
            }
            
            if (!stack.components || stack.components.length === 0) {
                throw new Error(`Stack '${stack.name}' must have at least one component`);
            }
            
            for (const component of stack.components) {
                if (!component.type) {
                    throw new Error(`Component in stack '${stack.name}' must have a type`);
                }
                
                if (!component.name) {
                    throw new Error(`Component in stack '${stack.name}' must have a name`);
                }
            }
        }
    }
    
    private static normalizeConfig(config: DeploymentConfig): void {
        // Apply default tags to stacks that don't have them
        if (config.defaultTags) {
            config.stacks.forEach(stack => {
                if (!stack.tags) {
                    stack.tags = { ...config.defaultTags };
                } else {
                    stack.tags = { ...config.defaultTags, ...stack.tags };
                }
            });
        }
        
        // Apply default region to components that don't have one
        if (config.defaultRegion) {
            config.stacks.forEach(stack => {
                stack.components.forEach(component => {
                    if (!component.region) {
                        component.region = config.defaultRegion;
                    }
                });
            });
        }
        
        // Ensure workDir is absolute or relative to current directory
        config.stacks.forEach(stack => {
            if (!path.isAbsolute(stack.workDir)) {
                stack.workDir = path.resolve(stack.workDir);
            }
        });
    }
    
    /**
     * Substitute environment variables in configuration content
     * Supports ${VAR_NAME} and $VAR_NAME syntax
     * @param content Configuration file content
     * @returns Content with environment variables substituted
     */
    private static substituteEnvironmentVariables(content: string): string {
        // Replace ${VAR_NAME} syntax
        content = content.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
            const value = process.env[varName];
            if (value === undefined) {
                throw new Error(`Environment variable ${varName} is not defined`);
            }
            return value;
        });
        
        // Replace $VAR_NAME syntax (word boundary to avoid partial matches)
        content = content.replace(/\$([A-Z_][A-Z0-9_]*)\b/g, (match, varName) => {
            const value = process.env[varName];
            if (value === undefined) {
                throw new Error(`Environment variable ${varName} is not defined`);
            }
            return value;
        });
        
        return content;
    }
}