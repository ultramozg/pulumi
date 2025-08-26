import * as pulumi from "@pulumi/pulumi";

/**
 * Test setup configuration for Jest
 * This file is run before each test suite
 */

// Mock Pulumi runtime for testing
export const mockPulumiRuntime = () => {
    const mocks: pulumi.runtime.Mocks = {
        newResource: (args: pulumi.runtime.MockResourceArgs): {
            id: string;
            state: any;
        } => {
            // Generate a mock ID based on the resource type and name
            const id = `${args.type}-${args.name}-mock-id`;
            
            // Return mock state based on resource type
            const state = {
                ...args.inputs,
                id: id,
                arn: `arn:aws:${args.type}:us-east-1:123456789012:${args.name}`,
            };
            
            return { id, state };
        },
        call: (args: pulumi.runtime.MockCallArgs): any => {
            // Mock AWS provider calls
            switch (args.token) {
                case "aws:index/getRegion:getRegion":
                    return { name: "us-east-1" };
                case "aws:index/getCallerIdentity:getCallerIdentity":
                    return { accountId: "123456789012" };
                default:
                    return {};
            }
        },
    };
    
    pulumi.runtime.setMocks(mocks);
};

// Set up global test environment
beforeEach(() => {
    mockPulumiRuntime();
});

// Clean up after each test
afterEach(() => {
    // Reset any global state if needed
});