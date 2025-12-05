import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { DeploymentConfig, StackConfig, ComponentConfig } from './types';

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

        // Normalize stacks to array for validation
        const stacks = this.normalizeStacksToArray(config.stacks);

        if (!stacks || stacks.length === 0) {
            throw new Error('Deployment configuration must have at least one stack');
        }

        const stackNames = new Set<string>();
        for (const stack of stacks) {
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

            // Normalize components to array for validation
            const components = this.normalizeComponentsToArray(stack.components);

            if (!components || components.length === 0) {
                throw new Error(`Stack '${stack.name}' must have at least one component`);
            }

            for (const component of components) {
                if (!component.type) {
                    throw new Error(`Component in stack '${stack.name}' must have a type`);
                }

                if (!component.name) {
                    throw new Error(`Component in stack '${stack.name}' must have a name`);
                }
            }
        }
    }

    /**
     * Normalize stacks from map or array to array format
     * @param stacks Stacks as array or map
     * @returns Stacks as array with names populated
     */
    private static normalizeStacksToArray(stacks: StackConfig[] | Record<string, StackConfig>): StackConfig[] {
        if (Array.isArray(stacks)) {
            return stacks;
        }

        return Object.entries(stacks).map(([name, stack]) => ({
            ...stack,
            name: stack.name || name
        }));
    }

    /**
     * Normalize components from map or array to array format
     * @param components Components as array or map
     * @returns Components as array with names populated
     */
    private static normalizeComponentsToArray(components: ComponentConfig[] | Record<string, ComponentConfig>): ComponentConfig[] {
        if (Array.isArray(components)) {
            return components;
        }

        return Object.entries(components).map(([name, component]) => ({
            ...component,
            name: component.name || name
        }));
    }
    
    private static normalizeConfig(config: DeploymentConfig): void {
        // Normalize stacks to array if needed
        const stacks = this.normalizeStacksToArray(config.stacks);

        // Apply default tags to stacks that don't have them
        if (config.defaultTags) {
            stacks.forEach(stack => {
                if (!stack.tags) {
                    stack.tags = { ...config.defaultTags };
                } else {
                    stack.tags = { ...config.defaultTags, ...stack.tags };
                }
            });
        }

        // Apply default region to components that don't have one
        if (config.defaultRegion) {
            stacks.forEach(stack => {
                const components = this.normalizeComponentsToArray(stack.components);
                components.forEach(component => {
                    if (!component.region) {
                        component.region = config.defaultRegion;
                    }
                });

                // Update stack components if they were normalized
                if (!Array.isArray(stack.components)) {
                    const componentsMap: Record<string, ComponentConfig> = {};
                    components.forEach(comp => {
                        if (comp.name) {
                            componentsMap[comp.name] = comp;
                        }
                    });
                    stack.components = componentsMap;
                } else {
                    stack.components = components;
                }
            });
        }

        // Ensure workDir is absolute or relative to current directory
        stacks.forEach(stack => {
            if (!path.isAbsolute(stack.workDir)) {
                stack.workDir = path.resolve(stack.workDir);
            }
        });

        // Update config.stacks with normalized stacks if it was a map
        if (!Array.isArray(config.stacks)) {
            const stacksMap: Record<string, StackConfig> = {};
            stacks.forEach(stack => {
                if (stack.name) {
                    stacksMap[stack.name] = stack;
                }
            });
            config.stacks = stacksMap;
        } else {
            config.stacks = stacks;
        }
    }
    
    /**
     * Get stacks as array (works with both map and array formats)
     * @param config Deployment configuration
     * @returns Stacks as array
     */
    public static getStacksArray(config: DeploymentConfig): StackConfig[] {
        return this.normalizeStacksToArray(config.stacks);
    }

    /**
     * Get components as array (works with both map and array formats)
     * @param stack Stack configuration
     * @returns Components as array
     */
    public static getComponentsArray(stack: StackConfig): ComponentConfig[] {
        return this.normalizeComponentsToArray(stack.components);
    }

    /**
     * Get stacks count (works with both map and array formats)
     * @param stacks Stacks as array or map
     * @returns Number of stacks
     */
    public static getStacksCount(stacks: StackConfig[] | Record<string, StackConfig>): number {
        if (Array.isArray(stacks)) {
            return stacks.length;
        }
        return Object.keys(stacks).length;
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
                // For role ARNs, return empty string if not defined (optional cross-account)
                if (varName.includes('ROLE_ARN')) {
                    return '';
                }
                throw new Error(`Environment variable ${varName} is not defined`);
            }
            return value;
        });
        
        // Replace $VAR_NAME syntax (word boundary to avoid partial matches)
        content = content.replace(/\$([A-Z_][A-Z0-9_]*)\b/g, (match, varName) => {
            const value = process.env[varName];
            if (value === undefined) {
                // For role ARNs, return empty string if not defined (optional cross-account)
                if (varName.includes('ROLE_ARN')) {
                    return '';
                }
                throw new Error(`Environment variable ${varName} is not defined`);
            }
            return value;
        });
        
        return content;
    }
}