import { DeploymentOrchestrator } from './deployment-orchestrator';
import { DeploymentConfig } from './types';

// Mock the Pulumi automation module
jest.mock('@pulumi/pulumi/automation', () => ({
    LocalWorkspace: {
        createOrSelectStack: jest.fn()
    }
}));

describe('DeploymentOrchestrator', () => {
    let orchestrator: DeploymentOrchestrator;
    
    beforeEach(() => {
        orchestrator = new DeploymentOrchestrator();
        jest.clearAllMocks();
    });
    
    describe('deployAll', () => {
        it('should handle simple deployment configuration', async () => {
            const config: DeploymentConfig = {
                name: 'test-deployment',
                stacks: [
                    {
                        name: 'test-stack',
                        workDir: './test-stack',
                        components: [
                            {
                                type: 'test',
                                name: 'test-component',
                                config: {}
                            }
                        ]
                    }
                ]
            };
            
            // Mock successful stack deployment
            const mockStack = {
                up: jest.fn().mockResolvedValue({ outputs: {} }),
                setAllConfig: jest.fn().mockResolvedValue(undefined)
            };
            
            const { LocalWorkspace } = require('@pulumi/pulumi/automation');
            LocalWorkspace.createOrSelectStack.mockResolvedValue(mockStack);
            
            const summary = await orchestrator.deployAll(config);
            
            expect(summary.deploymentName).toBe('test-deployment');
            expect(summary.totalStacks).toBe(1);
            expect(summary.successfulStacks).toBe(1);
            expect(summary.failedStacks).toBe(0);
        });
    });
});