import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from './config-manager';
import { DeploymentConfig, StackConfig, ComponentConfig } from './types';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    
    describe('createConfig', () => {
        it('should create a valid deployment configuration', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'test-stack',
                    workDir: './test-stack',
                    components: [
                        {
                            type: 'vpc',
                            name: 'test-vpc',
                            config: { cidrBlock: '10.0.0.0/16' }
                        }
                    ]
                }
            ];
            
            const config = ConfigManager.createConfig('test-deployment', stacks, {
                defaultRegion: 'us-east-1',
                defaultTags: { Environment: 'test' }
            });
            
            expect(config.name).toBe('test-deployment');
            expect(config.defaultRegion).toBe('us-east-1');
            expect(config.defaultTags).toEqual({ Environment: 'test' });
            expect(Array.isArray(config.stacks)).toBe(true);
            expect((config.stacks as StackConfig[])).toHaveLength(1);
            expect((config.stacks as StackConfig[])[0].name).toBe('test-stack');
        });
        
        it('should apply default tags to stacks', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'test-stack',
                    workDir: './test-stack',
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ];
            
            const config = ConfigManager.createConfig('test-deployment', stacks, {
                defaultTags: { Environment: 'test', Project: 'test-project' }
            });
            
            expect((config.stacks as StackConfig[])[0].tags).toEqual({
                Environment: 'test',
                Project: 'test-project'
            });
        });
        
        it('should merge default tags with stack-specific tags', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'test-stack',
                    workDir: './test-stack',
                    tags: { Layer: 'networking' },
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ];
            
            const config = ConfigManager.createConfig('test-deployment', stacks, {
                defaultTags: { Environment: 'test', Project: 'test-project' }
            });
            
            expect((config.stacks as StackConfig[])[0].tags).toEqual({
                Environment: 'test',
                Project: 'test-project',
                Layer: 'networking'
            });
        });
        
        it('should apply default region to components', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'test-stack',
                    workDir: './test-stack',
                    components: [
                        { type: 'test1', name: 'test1', config: {} },
                        { type: 'test2', name: 'test2', region: 'us-west-2', config: {} }
                    ]
                }
            ];
            
            const config = ConfigManager.createConfig('test-deployment', stacks, {
                defaultRegion: 'us-east-1'
            });
            
            const stacksArray = config.stacks as StackConfig[];
            const components = stacksArray[0].components as ComponentConfig[];
            expect(components[0].region).toBe('us-east-1');
            expect(components[1].region).toBe('us-west-2'); // Should not override existing region
        });
    });
    
    describe('validation', () => {
        it('should throw error for missing deployment name', () => {
            expect(() => {
                ConfigManager.createConfig('', []);
            }).toThrow('Deployment configuration must have a name');
        });
        
        it('should throw error for empty stacks array', () => {
            expect(() => {
                ConfigManager.createConfig('test', []);
            }).toThrow('Deployment configuration must have at least one stack');
        });
        
        it('should throw error for missing stack name', () => {
            const stacks = [
                {
                    workDir: './test',
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ] as StackConfig[];
            
            expect(() => {
                ConfigManager.createConfig('test', stacks);
            }).toThrow('Stack configuration must have a name');
        });
        
        it('should throw error for duplicate stack names', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'duplicate',
                    workDir: './test1',
                    components: [{ type: 'test', name: 'test', config: {} }]
                },
                {
                    name: 'duplicate',
                    workDir: './test2',
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ];
            
            expect(() => {
                ConfigManager.createConfig('test', stacks);
            }).toThrow('Duplicate stack name: duplicate');
        });
        
        it('should throw error for missing workDir', () => {
            const stacks = [
                {
                    name: 'test-stack',
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ] as StackConfig[];
            
            expect(() => {
                ConfigManager.createConfig('test', stacks);
            }).toThrow("Stack 'test-stack' must have a workDir");
        });
        
        it('should throw error for empty components array', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'test-stack',
                    workDir: './test',
                    components: []
                }
            ];
            
            expect(() => {
                ConfigManager.createConfig('test', stacks);
            }).toThrow("Stack 'test-stack' must have at least one component");
        });
        
        it('should throw error for component missing type', () => {
            const stacks = [
                {
                    name: 'test-stack',
                    workDir: './test',
                    components: [{ name: 'test', config: {} }]
                }
            ] as StackConfig[];
            
            expect(() => {
                ConfigManager.createConfig('test', stacks);
            }).toThrow("Component in stack 'test-stack' must have a type");
        });
        
        it('should throw error for component missing name', () => {
            const stacks = [
                {
                    name: 'test-stack',
                    workDir: './test',
                    components: [{ type: 'test', config: {} }]
                }
            ] as StackConfig[];
            
            expect(() => {
                ConfigManager.createConfig('test', stacks);
            }).toThrow("Component in stack 'test-stack' must have a name");
        });
    });
    
    describe('loadConfig', () => {
        it('should load and parse YAML configuration', () => {
            const yamlContent = `
name: "test-deployment"
defaultRegion: "us-east-1"
stacks:
  - name: "test-stack"
    workDir: "./test"
    components:
      - type: "vpc"
        name: "test-vpc"
        config:
          cidrBlock: "10.0.0.0/16"
`;
            
            mockFs.readFileSync.mockReturnValue(yamlContent);
            
            const config = ConfigManager.loadConfig('./test-config.yaml');
            
            expect(config.name).toBe('test-deployment');
            expect(config.defaultRegion).toBe('us-east-1');
            const stacksArray = config.stacks as StackConfig[];
            expect(stacksArray).toHaveLength(1);
            expect(stacksArray[0].name).toBe('test-stack');
            const components = stacksArray[0].components as ComponentConfig[];
            expect(components[0].type).toBe('vpc');
        });
        
        it('should throw error for invalid file path', () => {
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            
            expect(() => {
                ConfigManager.loadConfig('./nonexistent.yaml');
            }).toThrow('Failed to load configuration from ./nonexistent.yaml');
        });
    });
});