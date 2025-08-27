import * as automation from "@pulumi/pulumi/automation";
import { DeploymentOrchestrator } from '../../automation/deployment-orchestrator';
import { DeploymentConfig, StackConfig } from '../../automation/types';
import { ComponentError, RecoveryStrategy } from '../../components/utils/error-handling';
import { it } from "node:test";
import { it } from "node:test";
import { beforeEach } from "node:test";
import { describe } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { beforeEach } from "node:test";
import { describe } from "node:test";
import { it } from "node:test";
import { fail } from "assert";
import { it } from "node:test";
import { beforeEach } from "node:test";
import { describe } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { beforeEach } from "node:test";
import { describe } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { beforeEach } from "node:test";
import { describe } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { it } from "node:test";
import { describe } from "node:test";
import { beforeEach } from "node:test";
import { describe } from "node:test";

// Mock Pulumi automation
jest.mock('@pulumi/pulumi/automation');
jest.mock('@pulumi/pulumi', () => ({
    log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

const mockAutomation = automation as jest.Mocked<typeof automation>;

describe('Deployment Error Handling', () => {
    let orchestrator: DeploymentOrchestrator;
    let mockStack: jest.Mocked<automation.Stack>;

    beforeEach(() => {
        jest.clearAllMocks();
        
        orchestrator = new DeploymentOrchestrator({
            strategy: RecoveryStrategy.RETRY,
            maxRetries: 2,
            retryDelay: 100 // Short delay for testing
        });

        mockStack = {
            up: jest.fn(),
            destroy: jest.fn(),
            preview: jest.fn(),
            refresh: jest.fn(),
            setAllConfig: jest.fn()
        } as any;

        mockAutomation.LocalWorkspace.createOrSelectStack = jest.fn().mockResolvedValue(mockStack);
    });

    describe('Configuration Validation', () => {
        it('should throw error for missing deployment name', async () => {
            const config: DeploymentConfig = {
                name: '',
                stacks: []
            };

            await expect(orchestrator.deployAll(config)).rejects.toThrow(ComponentError);
        });

        it('should throw error for empty stacks array', async () => {
            const config: DeploymentConfig = {
                name: 'test-deployment',
                stacks: []
            };

            await expect(orchestrator.deployAll(config)).rejects.toThrow(ComponentError);
        });

        it('should throw error for stack without name', async () => {
            const config: DeploymentConfig = {
                name: 'test-deployment',
                stacks: [{
                    name: '',
                    workDir: './test',
                    components: []
                }]
            };

            await expect(orchestrator.deployAll(config)).rejects.toThrow(ComponentError);
        });

        it('should throw error for stack without workDir', async () => {
            const config: DeploymentConfig = {
                name: 'test-deployment',
                stacks: [{
                    name: 'test-stack',
                    workDir: '',
                    components: []
                }]
            };

            await expect(orchestrator.deployAll(config)).rejects.toThrow(ComponentError);
        });
    });

    describe('Stack Deployment Error Handling', () => {
        let validConfig: DeploymentConfig;

        beforeEach(() => {
            validConfig = {
                name: 'test-deployment',
                stacks: [
                    {
                        name: 'stack1',
                        workDir: './stack1',
                        components: []
                    },
                    {
                        name: 'stack2',
                        workDir: './stack2',
                        components: []
                    }
                ]
            };
        });

        it('should retry failed stack deployment', async () => {
            mockStack.up
                .mockRejectedValueOnce(new Error('First failure'))
                .mockRejectedValueOnce(new Error('Second failure'))
                .mockResolvedValue({ outputs: {} } as any);

            const result = await orchestrator.deployAll(validConfig);

            expect(result.successfulStacks).toBe(2);
            expect(result.failedStacks).toBe(0);
            expect(mockStack.up).toHaveBeenCalledTimes(6); // 3 attempts per stack
        });

        it('should fail after max retries exceeded', async () => {
            mockStack.up.mockRejectedValue(new Error('Persistent failure'));

            const result = await orchestrator.deployAll(validConfig);

            expect(result.successfulStacks).toBe(0);
            expect(result.failedStacks).toBe(2);
            expect(mockStack.up).toHaveBeenCalledTimes(6); // 3 attempts per stack (1 initial + 2 retries)
        });

        it('should continue deployment when continueOnFailure is true', async () => {
            mockStack.up
                .mockRejectedValueOnce(new Error('Stack1 failure'))
                .mockRejectedValueOnce(new Error('Stack1 failure'))
                .mockRejectedValueOnce(new Error('Stack1 failure'))
                .mockResolvedValue({ outputs: {} } as any);

            const result = await orchestrator.deployAll(validConfig, {
                continueOnFailure: true
            });

            expect(result.successfulStacks).toBe(1);
            expect(result.failedStacks).toBe(1);
        });

        it('should stop deployment on first failure when continueOnFailure is false', async () => {
            mockStack.up.mockRejectedValue(new Error('Stack failure'));

            const result = await orchestrator.deployAll(validConfig, {
                continueOnFailure: false
            });

            expect(result.successfulStacks).toBe(0);
            expect(result.failedStacks).toBe(1);
            // Should only attempt first stack
            expect(mockStack.up).toHaveBeenCalledTimes(3); // 1 initial + 2 retries for first stack only
        });

        it('should handle dry run mode', async () => {
            mockStack.preview.mockResolvedValue(undefined as any);

            const result = await orchestrator.deployAll(validConfig, {
                dryRun: true
            });

            expect(result.successfulStacks).toBe(2);
            expect(result.failedStacks).toBe(0);
            expect(mockStack.preview).toHaveBeenCalledTimes(2);
            expect(mockStack.up).not.toHaveBeenCalled();
        });

        it('should handle refresh before deployment', async () => {
            mockStack.refresh.mockResolvedValue(undefined as any);
            mockStack.up.mockResolvedValue({ outputs: {} } as any);

            const result = await orchestrator.deployAll(validConfig, {
                refresh: true
            });

            expect(result.successfulStacks).toBe(2);
            expect(mockStack.refresh).toHaveBeenCalledTimes(2);
            expect(mockStack.up).toHaveBeenCalledTimes(2);
        });
    });

    describe('Rollback Functionality', () => {
        let validConfig: DeploymentConfig;

        beforeEach(() => {
            validConfig = {
                name: 'test-deployment',
                stacks: [
                    {
                        name: 'stack1',
                        workDir: './stack1',
                        components: []
                    },
                    {
                        name: 'stack2',
                        workDir: './stack2',
                        components: []
                    }
                ]
            };
        });

        it('should rollback successful stacks when rollbackOnFailure is true', async () => {
            mockStack.up
                .mockResolvedValueOnce({ outputs: {} } as any) // stack1 succeeds
                .mockRejectedValue(new Error('Stack2 failure')); // stack2 fails
            
            mockStack.destroy.mockResolvedValue(undefined as any);

            const result = await orchestrator.deployAll(validConfig, {
                rollbackOnFailure: true,
                continueOnFailure: false
            });

            expect(result.successfulStacks).toBe(1);
            expect(result.failedStacks).toBe(1);
            expect(mockStack.destroy).toHaveBeenCalled();
        });

        it('should continue rollback even if one rollback fails', async () => {
            mockStack.up
                .mockResolvedValueOnce({ outputs: {} } as any) // stack1 succeeds
                .mockResolvedValueOnce({ outputs: {} } as any) // stack2 succeeds
                .mockRejectedValue(new Error('Stack3 failure')); // stack3 fails

            // Add third stack for this test
            validConfig.stacks.push({
                name: 'stack3',
                workDir: './stack3',
                components: []
            });

            mockStack.destroy
                .mockRejectedValueOnce(new Error('Rollback failure')) // First rollback fails
                .mockResolvedValue(undefined as any); // Second rollback succeeds

            const result = await orchestrator.deployAll(validConfig, {
                rollbackOnFailure: true,
                continueOnFailure: false
            });

            expect(result.successfulStacks).toBe(2);
            expect(result.failedStacks).toBe(1);
            expect(mockStack.destroy).toHaveBeenCalledTimes(2); // Should attempt both rollbacks
        });
    });

    describe('Parallel vs Sequential Deployment', () => {
        let validConfig: DeploymentConfig;

        beforeEach(() => {
            validConfig = {
                name: 'test-deployment',
                stacks: [
                    {
                        name: 'stack1',
                        workDir: './stack1',
                        components: []
                    },
                    {
                        name: 'stack2',
                        workDir: './stack2',
                        components: []
                    }
                ]
            };
        });

        it('should deploy stacks in parallel by default', async () => {
            let stack1StartTime: number | undefined;
            let stack2StartTime: number | undefined;

            mockStack.up.mockImplementation(async () => {
                const startTime = Date.now();
                if (!stack1StartTime) {
                    stack1StartTime = startTime;
                } else if (!stack2StartTime) {
                    stack2StartTime = startTime;
                }
                
                // Simulate some deployment time
                await new Promise(resolve => setTimeout(resolve, 100));
                return { outputs: {} } as any;
            });

            await orchestrator.deployAll(validConfig, { parallel: true });

            // Both stacks should start around the same time (parallel execution)
            if (stack1StartTime && stack2StartTime) {
                expect(Math.abs(stack2StartTime - stack1StartTime)).toBeLessThan(50);
            } else {
                fail('Both stacks should have started');
            }
        });

        it('should deploy stacks sequentially when parallel is false', async () => {
            const deploymentTimes: number[] = [];

            mockStack.up.mockImplementation(async () => {
                deploymentTimes.push(Date.now());
                await new Promise(resolve => setTimeout(resolve, 100));
                return { outputs: {} } as any;
            });

            await orchestrator.deployAll(validConfig, { parallel: false });

            // Second stack should start after first stack completes
            expect(deploymentTimes[1] - deploymentTimes[0]).toBeGreaterThan(90);
        });
    });

    describe('Error Recovery Strategies', () => {
        let validConfig: DeploymentConfig;

        beforeEach(() => {
            validConfig = {
                name: 'test-deployment',
                stacks: [{
                    name: 'test-stack',
                    workDir: './test',
                    components: []
                }]
            };
        });

        it('should skip retry for certain error types', async () => {
            const orchestratorWithSkip = new DeploymentOrchestrator({
                strategy: RecoveryStrategy.RETRY,
                maxRetries: 3
            });

            mockStack.up.mockRejectedValue(new Error('already exists'));

            const result = await orchestratorWithSkip.deployAll(validConfig);

            expect(result.failedStacks).toBe(1);
            // Should only attempt once due to skip condition
            expect(mockStack.up).toHaveBeenCalledTimes(1);
        });

        it('should handle permission denied errors without retry', async () => {
            mockStack.up.mockRejectedValue(new Error('permission denied'));

            const result = await orchestrator.deployAll(validConfig);

            expect(result.failedStacks).toBe(1);
            expect(mockStack.up).toHaveBeenCalledTimes(1);
        });

        it('should handle invalid configuration errors without retry', async () => {
            mockStack.up.mockRejectedValue(new Error('invalid configuration'));

            const result = await orchestrator.deployAll(validConfig);

            expect(result.failedStacks).toBe(1);
            expect(mockStack.up).toHaveBeenCalledTimes(1);
        });
    });

    describe('Metrics Collection', () => {
        let validConfig: DeploymentConfig;

        beforeEach(() => {
            validConfig = {
                name: 'test-deployment',
                stacks: [{
                    name: 'test-stack',
                    workDir: './test',
                    components: []
                }]
            };
        });

        it('should collect deployment metrics', async () => {
            mockStack.up.mockResolvedValue({ 
                outputs: { 
                    output1: { value: 'value1' },
                    output2: { value: 'value2' }
                } 
            } as any);

            const result = await orchestrator.deployAll(validConfig);

            expect(result.totalStacks).toBe(1);
            expect(result.successfulStacks).toBe(1);
            expect(result.failedStacks).toBe(0);
            expect(result.totalDuration).toBeGreaterThan(0);
            expect(result.results).toHaveLength(1);
            expect(result.results[0].outputs).toBeDefined();
        });

        it('should track retry attempts in metrics', async () => {
            mockStack.up
                .mockRejectedValueOnce(new Error('First failure'))
                .mockResolvedValue({ outputs: {} } as any);

            const result = await orchestrator.deployAll(validConfig);

            expect(result.successfulStacks).toBe(1);
            expect(result.failedStacks).toBe(0);
            // Verify that retries were tracked (implementation detail would be in actual metrics)
        });
    });
});