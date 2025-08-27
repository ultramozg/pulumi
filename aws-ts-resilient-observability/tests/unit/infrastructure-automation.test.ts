import { InfrastructureAutomation } from '../../index';
import { RecoveryStrategy } from '../../components/utils/error-handling';

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
            expect(config.stacks.length).toBeGreaterThan(0);

            // Check that all stacks have the expected structure
            config.stacks.forEach(stack => {
                expect(stack.name).toMatch(/-stack$/);
                expect(stack.workDir).toMatch(/^\.\/examples\/.+-example$/);
                expect(stack.components).toHaveLength(1);
                expect(stack.components[0].type).toBeTruthy();
                expect(stack.components[0].name).toBeTruthy();
                expect(stack.components[0].config).toBeTruthy();
                expect(stack.tags).toEqual({ Environment: 'test', Component: stack.components[0].type });
            });
        });

        test('should create configuration with specific components only', () => {
            const config = automation.createComponentsConfig('vpc-ecr-deployment', {
                region: 'us-west-2',
                includeComponents: ['vpc', 'ecr']
            });

            expect(config.stacks).toHaveLength(2);
            
            const vpcStack = config.stacks.find(s => s.name.includes('vpc'));
            const ecrStack = config.stacks.find(s => s.name.includes('ecr'));

            expect(vpcStack).toBeDefined();
            expect(ecrStack).toBeDefined();
            expect(vpcStack!.components[0].type).toBe('vpc');
            expect(ecrStack!.components[0].type).toBe('ecr');
        });

        test('should create configuration excluding specific components', () => {
            const config = automation.createComponentsConfig('minimal-deployment', {
                region: 'us-east-1',
                excludeComponents: ['rds', 'eks']
            });

            const componentTypes = config.stacks.map(s => s.components[0].type);
            expect(componentTypes).not.toContain('rds');
            expect(componentTypes).not.toContain('eks');
            expect(componentTypes).toContain('vpc');
            expect(componentTypes).toContain('ecr');
        });

        test('should apply default component configurations', () => {
            const config = automation.createComponentsConfig('default-config-test', {
                region: 'us-east-1'
            });

            const vpcStack = config.stacks.find(s => s.components[0].type === 'vpc');
            const ecrStack = config.stacks.find(s => s.components[0].type === 'ecr');

            expect(vpcStack).toBeDefined();
            expect(ecrStack).toBeDefined();

            // Check VPC default configuration
            const vpcConfig = vpcStack!.components[0].config;
            expect(vpcConfig.region).toBe('us-east-1');
            expect(vpcConfig.cidrBlock).toBe('10.0.0.0/16');
            expect(vpcConfig.internetGatewayEnabled).toBe(true);
            expect(vpcConfig.natGatewayEnabled).toBe(false);
            expect(vpcConfig.availabilityZoneCount).toBe(2);

            // Check ECR default configuration
            const ecrConfig = ecrStack!.components[0].config;
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