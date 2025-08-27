import * as automation from "@pulumi/pulumi/automation";
import * as path from "path";
import * as fs from "fs";
import { DeploymentOrchestrator } from "../../automation/deployment-orchestrator";
import { DeploymentConfig, DeploymentSummary } from "../../automation/types";

/**
 * Utility functions for integration testing
 */

export interface TestStackConfig {
    stackName: string;
    workDir: string;
    program?: automation.PulumiFn;
    config?: Record<string, automation.ConfigValue>;
}

export interface TestDeploymentResult {
    success: boolean;
    outputs?: Record<string, any>;
    error?: string;
    duration: number;
}

/**
 * Integration test helper class for managing test stacks and deployments
 */
export class IntegrationTestHelper {
    private readonly testPrefix: string;
    private readonly createdStacks: automation.Stack[] = [];
    private readonly orchestrator: DeploymentOrchestrator;

    constructor(testPrefix: string = "integration-test") {
        this.testPrefix = testPrefix;
        this.orchestrator = new DeploymentOrchestrator();
    }

    /**
     * Create a test stack with the given configuration
     */
    async createTestStack(config: TestStackConfig): Promise<automation.Stack> {
        const stackName = `${this.testPrefix}-${config.stackName}-${Date.now()}`;
        
        let stack: automation.Stack;
        
        if (config.program) {
            // Create inline program stack
            stack = await automation.LocalWorkspace.createStack({
                stackName,
                projectName: `test-project-${Date.now()}`,
                program: config.program
            });
        } else {
            // Create stack from workspace
            stack = await automation.LocalWorkspace.createStack({
                stackName,
                workDir: config.workDir
            });
        }

        // Set configuration if provided
        if (config.config) {
            await stack.setAllConfig(config.config);
        }

        // Track created stack for cleanup
        this.createdStacks.push(stack);

        return stack;
    }

    /**
     * Deploy a test stack and return results
     */
    async deployTestStack(stack: automation.Stack): Promise<TestDeploymentResult> {
        const startTime = Date.now();

        try {
            const result = await stack.up();
            const endTime = Date.now();

            return {
                success: true,
                outputs: result.outputs,
                duration: endTime - startTime
            };
        } catch (error) {
            const endTime = Date.now();

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration: endTime - startTime
            };
        }
    }

    /**
     * Deploy multiple stacks using the orchestrator
     */
    async deployMultipleStacks(config: DeploymentConfig): Promise<DeploymentSummary> {
        return this.orchestrator.deployAll(config, { parallel: false });
    }

    /**
     * Create a temporary deployment configuration for testing
     */
    createTestDeploymentConfig(
        name: string,
        stacks: Array<{
            name: string;
            workDir: string;
            dependencies?: string[];
            components: Array<{
                type: string;
                name: string;
                config: Record<string, any>;
                region?: string;
            }>;
        }>
    ): DeploymentConfig {
        return {
            name: `${this.testPrefix}-${name}`,
            defaultRegion: "us-east-1",
            defaultTags: {
                Environment: "test",
                Purpose: "integration-testing",
                TestRun: Date.now().toString()
            },
            stacks: stacks.map(stack => ({
                ...stack,
                name: `${this.testPrefix}-${stack.name}-${Date.now()}`,
                tags: {
                    TestStack: "true",
                    TestType: "integration"
                }
            }))
        };
    }

    /**
     * Wait for stack outputs to be available
     */
    async waitForStackOutputs(
        stack: automation.Stack,
        expectedOutputs: string[],
        timeoutMs: number = 30000
    ): Promise<Record<string, any>> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            try {
                const outputs = await stack.outputs();
                const outputKeys = Object.keys(outputs);

                // Check if all expected outputs are present
                const hasAllOutputs = expectedOutputs.every(key => outputKeys.includes(key));

                if (hasAllOutputs) {
                    return outputs;
                }

                // Wait before checking again
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                // Stack might not be ready yet, continue waiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        throw new Error(`Timeout waiting for stack outputs: ${expectedOutputs.join(', ')}`);
    }

    /**
     * Validate that stack outputs match expected values
     */
    validateStackOutputs(
        outputs: Record<string, any>,
        expectations: Record<string, (value: any) => boolean>
    ): void {
        Object.entries(expectations).forEach(([key, validator]) => {
            if (!(key in outputs)) {
                throw new Error(`Expected output '${key}' not found in stack outputs`);
            }

            if (!validator(outputs[key].value)) {
                throw new Error(`Output '${key}' validation failed. Value: ${JSON.stringify(outputs[key].value)}`);
            }
        });
    }

    /**
     * Create a temporary Pulumi program for testing
     */
    createTestProgram(programFn: () => Promise<Record<string, any>>): automation.PulumiFn {
        return async () => {
            const outputs = await programFn();
            
            // For automation API, we don't need to export - just return the outputs
            // The automation API will handle the outputs
            return outputs;
        };
    }

    /**
     * Clean up all created test stacks
     */
    async cleanup(): Promise<void> {
        console.log(`🧹 Cleaning up ${this.createdStacks.length} test stacks...`);

        // Destroy stacks in reverse order (to handle dependencies)
        const stacksToDestroy = [...this.createdStacks].reverse();

        for (const stack of stacksToDestroy) {
            try {
                console.log(`   Destroying stack: ${stack.name}`);
                await stack.destroy();
                console.log(`   ✅ Destroyed: ${stack.name}`);
            } catch (error) {
                console.error(`   ❌ Failed to destroy ${stack.name}: ${error}`);
                // Continue with other stacks
            }
        }

        // Clear the tracked stacks
        this.createdStacks.length = 0;
        console.log(`✅ Cleanup completed`);
    }

    /**
     * Get the number of tracked stacks
     */
    getTrackedStackCount(): number {
        return this.createdStacks.length;
    }

    /**
     * Create a test workspace directory
     */
    createTestWorkspace(testName: string): string {
        const workspaceDir = path.join(__dirname, 'workspaces', testName);
        
        if (!fs.existsSync(workspaceDir)) {
            fs.mkdirSync(workspaceDir, { recursive: true });
        }

        return workspaceDir;
    }

    /**
     * Write a test Pulumi program to a workspace
     */
    writeTestProgram(workspaceDir: string, program: string): void {
        const programPath = path.join(workspaceDir, 'index.ts');
        fs.writeFileSync(programPath, program);

        // Create a basic package.json if it doesn't exist
        const packageJsonPath = path.join(workspaceDir, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            const packageJson = {
                name: "integration-test-program",
                main: "index.ts",
                dependencies: {
                    "@pulumi/pulumi": "^3.113.0",
                    "@pulumi/aws": "^7.5.0"
                }
            };
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        }

        // Create a basic tsconfig.json if it doesn't exist
        const tsconfigPath = path.join(workspaceDir, 'tsconfig.json');
        if (!fs.existsSync(tsconfigPath)) {
            const tsconfig = {
                compilerOptions: {
                    target: "es2018",
                    module: "commonjs",
                    lib: ["es2018"],
                    strict: true,
                    esModuleInterop: true,
                    skipLibCheck: true,
                    forceConsistentCasingInFileNames: true
                }
            };
            fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
        }
    }
}

/**
 * Common validation functions for integration tests
 */
export const validators = {
    isString: (value: any): boolean => typeof value === 'string' && value.length > 0,
    isArray: (value: any): boolean => Array.isArray(value) && value.length > 0,
    isValidArn: (value: any): boolean => 
        typeof value === 'string' && value.startsWith('arn:aws:'),
    isValidCidr: (value: any): boolean => {
        if (typeof value !== 'string') return false;
        const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
        return cidrRegex.test(value);
    },
    isValidVpcId: (value: any): boolean => 
        typeof value === 'string' && value.startsWith('vpc-'),
    isValidSubnetId: (value: any): boolean => 
        typeof value === 'string' && value.startsWith('subnet-'),
    isValidSecurityGroupId: (value: any): boolean => 
        typeof value === 'string' && value.startsWith('sg-'),
    hasMinLength: (minLength: number) => (value: any): boolean => 
        typeof value === 'string' && value.length >= minLength,
    isInRegion: (expectedRegion: string) => (value: any): boolean => 
        typeof value === 'string' && value.includes(expectedRegion)
};