import { InfrastructureAutomation } from '../../index';
import { RecoveryStrategy } from "../../components/shared/utils/error-handling";
import { StackConfig, ComponentConfig } from "../../automation/types";

describe('InfrastructureAutomation', () => {
    let automation: InfrastructureAutomation;

    beforeEach(() => {
        automation = new InfrastructureAutomation({
            errorHandling: {
                strategy: RecoveryStrategy.RETRY,
                maxRetries: 2,
                retryDelay: 1000
            }
        });
    });

    describe('createComponentsConfig', () => {
        test('should create configuration with all components by default', () => {
            const config = automation.createComponentsConfig('test-deployment', {
                region: 'us-east-1',
                tags: { Environment: 'test' }
            });

            expect(config.name).toBe('test-deployment');
            expect(config.defaultRegion).toBe('us-east-1');
            expect(config.defaultTags).toEqual({ Environment: 'test' });

            const stacksArray = Array.isArray(config.stacks) ? config.stacks : Object.values(config.stacks);
            expect(stacksArray.length).toBeGreaterThan(0);

            // Check that all stacks have the expected structure
            stacksArray.forEach((stack: StackConfig) => {
                expect(stack.name).toMatch(/-stack$/);
                expect(stack.workDir).toMatch(/^\.\/examples\/.+-example$/);
                const components = Array.isArray(stack.components) ? stack.components : Object.values(stack.components);
                expect(components).toHaveLength(1);
                expect(components[0].type).toBeTruthy();
                expect(components[0].name).toBeTruthy();
                expect(components[0].config).toBeTruthy();
                expect(stack.tags).toEqual({ Environment: 'test', Component: components[0].type });
            });
        });

        test('should create configuration with specific components only', () => {
            const config = automation.createComponentsConfig('vpc-ecr-deployment', {
                region: 'us-west-2',
                includeComponents: ['vpc', 'ecr']
            });

            const stacksArray = Array.isArray(config.stacks) ? config.stacks : Object.values(config.stacks);
            expect(stacksArray).toHaveLength(2);

            const vpcStack = stacksArray.find((s: StackConfig) => s.name?.includes('vpc'));
            const ecrStack = stacksArray.find((s: StackConfig) => s.name?.includes('ecr'));

            expect(vpcStack).toBeDefined();
            expect(ecrStack).toBeDefined();
            const vpcComps = Array.isArray(vpcStack!.components) ? vpcStack!.components : Object.values(vpcStack!.components);
            const ecrComps = Array.isArray(ecrStack!.components) ? ecrStack!.components : Object.values(ecrStack!.components);
            expect(vpcComps[0].type).toBe('vpc');
            expect(ecrComps[0].type).toBe('ecr');
        });

        test('should create configuration excluding specific components', () => {
            const config = automation.createComponentsConfig('minimal-deployment', {
                region: 'us-east-1',
                excludeComponents: ['rds', 'eks']
            });

            const stacksArray = Array.isArray(config.stacks) ? config.stacks : Object.values(config.stacks);
            const componentTypes = stacksArray.map((s: StackConfig) => {
                const comps = Array.isArray(s.components) ? s.components : Object.values(s.components);
                return comps[0].type;
            });
            expect(componentTypes).not.toContain('rds');
            expect(componentTypes).not.toContain('eks');
            expect(componentTypes).toContain('vpc');
            expect(componentTypes).toContain('ecr');
        });

        test('should apply default component configurations', () => {
            const config = automation.createComponentsConfig('default-config-test', {
                region: 'us-east-1'
            });

            const stacksArray = Array.isArray(config.stacks) ? config.stacks : Object.values(config.stacks);
            const vpcStack = stacksArray.find((s: StackConfig) => {
                const comps = Array.isArray(s.components) ? s.components : Object.values(s.components);
                return comps[0]?.type === 'vpc';
            });
            const ecrStack = stacksArray.find((s: StackConfig) => {
                const comps = Array.isArray(s.components) ? s.components : Object.values(s.components);
                return comps[0]?.type === 'ecr';
            });

            expect(vpcStack).toBeDefined();
            expect(ecrStack).toBeDefined();

            // Check VPC default configuration
            const vpcComponents = Array.isArray(vpcStack!.components) ? vpcStack!.components : Object.values(vpcStack!.components);
            const vpcConfig = vpcComponents[0].config;
            expect(vpcConfig.region).toBe('us-east-1');
            expect(vpcConfig.cidrBlock).toBe('10.0.0.0/16');
            expect(vpcConfig.internetGatewayEnabled).toBe(true);
            expect(vpcConfig.natGatewayEnabled).toBe(false);
            expect(vpcConfig.availabilityZoneCount).toBe(2);

            // Check ECR default configuration
            const ecrComponents = Array.isArray(ecrStack!.components) ? ecrStack!.components : Object.values(ecrStack!.components);
            const ecrConfig = ecrComponents[0].config;
            expect(ecrConfig.repositories).toHaveLength(1);
            expect(ecrConfig.repositories[0].name).toBe('default-repo');
            expect(ecrConfig.repositories[0].shareWithOrganization).toBe(false);
            expect(ecrConfig.replicationEnabled).toBe(false);
        });
    });

    describe('createConfig', () => {
        test('should create deployment configuration from stacks', () => {
            const stacks = [
                {
                    name: 'test-stack',
                    workDir: './test',
                    components: [
                        {
                            type: 'vpc',
                            name: 'test-vpc',
                            config: { cidrBlock: '10.0.0.0/16' }
                        }
                    ]
                }
            ];

            const config = automation.createConfig('test-deployment', stacks, {
                defaultRegion: 'us-west-2',
                defaultTags: { Project: 'test' }
            });

            expect(config.name).toBe('test-deployment');
            expect(config.defaultRegion).toBe('us-west-2');
            expect(config.defaultTags).toEqual({ Project: 'test' });
            expect(config.stacks).toEqual(stacks);
        });
    });

    describe('constructor', () => {
        test('should create instance with default options', () => {
            const defaultAutomation = new InfrastructureAutomation();
            expect(defaultAutomation).toBeInstanceOf(InfrastructureAutomation);
        });

        test('should create instance with custom error handling options', () => {
            const customAutomation = new InfrastructureAutomation({
                errorHandling: {
                    strategy: RecoveryStrategy.FAIL_FAST,
                    maxRetries: 5,
                    retryDelay: 2000,
                    backoffMultiplier: 1.5
                }
            });
            expect(customAutomation).toBeInstanceOf(InfrastructureAutomation);
        });
    });
});