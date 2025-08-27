import { IntegrationTestHelper, validators } from './test-utils';
import { IPAMComponent } from '../../components/ipam';
import { VPCComponent } from '../../components/vpc';
import * as pulumi from "@pulumi/pulumi";

/**
 * Integration tests for VPC + IPAM component interaction
 * Tests the integration between IPAM for centralized IP management and VPC for network infrastructure
 */
describe('VPC + IPAM Integration Tests', () => {
    let testHelper: IntegrationTestHelper;
    const testTimeout = 10 * 60 * 1000; // 10 minutes

    beforeAll(() => {
        testHelper = new IntegrationTestHelper('vpc-ipam-integration');
    });

    afterAll(async () => {
        await testHelper.cleanup();
    }, testTimeout);

    test('VPC should successfully integrate with IPAM for automatic CIDR allocation', async () => {
        // Create test workspace
        const workspaceDir = testHelper.createTestWorkspace('vpc-ipam-basic');

        // Create test program that deploys IPAM and VPC together
        const testProgram = `
import * as pulumi from "@pulumi/pulumi";
import { IPAMComponent } from "../../components/ipam";
import { VPCComponent } from "../../components/vpc";

// Create IPAM component
const ipam = new IPAMComponent("test-ipam", {
    cidrBlocks: ["10.0.0.0/16"],
    shareWithOrganization: false,
    operatingRegions: ["us-east-1"],
    tags: {
        TestType: "integration",
        Component: "ipam"
    }
});

// Create VPC component that uses IPAM
const vpc = new VPCComponent("test-vpc", {
    region: "us-east-1",
    ipamPoolArn: ipam.getPoolArn("us-east-1"),
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 2,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: [0, 1]
        },
        private: {
            type: "private", 
            subnetPrefix: 24,
            availabilityZones: [0, 1]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc"
    }
});

// Export outputs for validation
export const ipamId = ipam.ipamId;
export const ipamArn = ipam.ipamArn;
export const poolId = ipam.getPoolId("us-east-1");
export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const subnetIds = vpc.subnetIds;
export const publicSubnetIds = vpc.getSubnetIdsByType("public");
export const privateSubnetIds = vpc.getSubnetIdsByType("private");
`;

        testHelper.writeTestProgram(workspaceDir, testProgram);

        // Create and deploy test stack
        const stack = await testHelper.createTestStack({
            stackName: 'vpc-ipam-basic',
            workDir: workspaceDir
        });

        const deployResult = await testHelper.deployTestStack(stack);

        // Verify deployment succeeded
        expect(deployResult.success).toBe(true);
        expect(deployResult.outputs).toBeDefined();

        // Wait for all outputs to be available
        const outputs = await testHelper.waitForStackOutputs(stack, [
            'ipamId', 'ipamArn', 'poolId', 'vpcId', 'vpcCidr', 
            'subnetIds', 'publicSubnetIds', 'privateSubnetIds'
        ]);

        // Validate IPAM outputs
        testHelper.validateStackOutputs(outputs, {
            ipamId: validators.isString,
            ipamArn: validators.isValidArn,
            poolId: validators.isString,
        });

        // Validate VPC outputs
        testHelper.validateStackOutputs(outputs, {
            vpcId: validators.isValidVpcId,
            vpcCidr: validators.isValidCidr,
            subnetIds: validators.isArray,
            publicSubnetIds: validators.isArray,
            privateSubnetIds: validators.isArray
        });

        // Validate that VPC CIDR is within IPAM CIDR range
        const vpcCidr = outputs.vpcCidr.value;
        expect(vpcCidr).toMatch(/^10\.0\.\d+\.\d+\/\d+$/);

        // Validate subnet counts
        const publicSubnets = outputs.publicSubnetIds.value;
        const privateSubnets = outputs.privateSubnetIds.value;
        expect(publicSubnets).toHaveLength(2); // 2 AZs
        expect(privateSubnets).toHaveLength(2); // 2 AZs

        console.log('✅ VPC + IPAM integration test passed');
        console.log(`   IPAM ID: ${outputs.ipamId.value}`);
        console.log(`   VPC ID: ${outputs.vpcId.value}`);
        console.log(`   VPC CIDR: ${outputs.vpcCidr.value}`);

    }, testTimeout);

    test('VPC should handle IPAM pool exhaustion gracefully', async () => {
        // Create test workspace
        const workspaceDir = testHelper.createTestWorkspace('vpc-ipam-exhaustion');

        // Create test program with small IPAM pool and large VPC requirements
        const testProgram = `
import * as pulumi from "@pulumi/pulumi";
import { IPAMComponent } from "../../components/ipam";
import { VPCComponent } from "../../components/vpc";

// Create IPAM with very small CIDR block
const ipam = new IPAMComponent("test-ipam-small", {
    cidrBlocks: ["10.0.0.0/30"], // Very small - only 4 IPs
    shareWithOrganization: false,
    operatingRegions: ["us-east-1"],
    tags: {
        TestType: "integration",
        Component: "ipam-small"
    }
});

// Try to create VPC that requires more space than available
const vpc = new VPCComponent("test-vpc-large", {
    region: "us-east-1",
    ipamPoolArn: ipam.getPoolArn("us-east-1"),
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24, // Requires /24 but IPAM only has /30
            availabilityZones: [0, 1, 2]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc-large"
    }
});

export const vpcId = vpc.vpcId;
`;

        testHelper.writeTestProgram(workspaceDir, testProgram);

        // Create and deploy test stack - this should fail
        const stack = await testHelper.createTestStack({
            stackName: 'vpc-ipam-exhaustion',
            workDir: workspaceDir
        });

        const deployResult = await testHelper.deployTestStack(stack);

        // Verify deployment failed as expected
        expect(deployResult.success).toBe(false);
        expect(deployResult.error).toBeDefined();
        expect(deployResult.error).toContain('CIDR'); // Should mention CIDR-related error

        console.log('✅ VPC + IPAM exhaustion test passed (deployment failed as expected)');
        console.log(`   Error: ${deployResult.error}`);

    }, testTimeout);

    test('Multiple VPCs should get non-overlapping CIDRs from same IPAM pool', async () => {
        // Create test workspace
        const workspaceDir = testHelper.createTestWorkspace('vpc-ipam-multiple');

        // Create test program with multiple VPCs using same IPAM
        const testProgram = `
import * as pulumi from "@pulumi/pulumi";
import { IPAMComponent } from "../../components/ipam";
import { VPCComponent } from "../../components/vpc";

// Create IPAM with sufficient space for multiple VPCs
const ipam = new IPAMComponent("test-ipam-multi", {
    cidrBlocks: ["10.0.0.0/16"], // Large enough for multiple /24 VPCs
    shareWithOrganization: false,
    operatingRegions: ["us-east-1"],
    tags: {
        TestType: "integration",
        Component: "ipam-multi"
    }
});

// Create first VPC
const vpc1 = new VPCComponent("test-vpc-1", {
    region: "us-east-1",
    ipamPoolArn: ipam.getPoolArn("us-east-1"),
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 2,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 26,
            availabilityZones: [0, 1]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc-1"
    }
});

// Create second VPC
const vpc2 = new VPCComponent("test-vpc-2", {
    region: "us-east-1",
    ipamPoolArn: ipam.getPoolArn("us-east-1"),
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 2,
    subnets: {
        private: {
            type: "private",
            subnetPrefix: 26,
            availabilityZones: [0, 1]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc-2"
    }
});

// Export outputs for validation
export const ipamId = ipam.ipamId;
export const vpc1Id = vpc1.vpcId;
export const vpc1Cidr = vpc1.cidrBlock;
export const vpc2Id = vpc2.vpcId;
export const vpc2Cidr = vpc2.cidrBlock;
`;

        testHelper.writeTestProgram(workspaceDir, testProgram);

        // Create and deploy test stack
        const stack = await testHelper.createTestStack({
            stackName: 'vpc-ipam-multiple',
            workDir: workspaceDir
        });

        const deployResult = await testHelper.deployTestStack(stack);

        // Verify deployment succeeded
        expect(deployResult.success).toBe(true);

        // Wait for outputs
        const outputs = await testHelper.waitForStackOutputs(stack, [
            'ipamId', 'vpc1Id', 'vpc1Cidr', 'vpc2Id', 'vpc2Cidr'
        ]);

        // Validate outputs
        testHelper.validateStackOutputs(outputs, {
            ipamId: validators.isString,
            vpc1Id: validators.isValidVpcId,
            vpc1Cidr: validators.isValidCidr,
            vpc2Id: validators.isValidVpcId,
            vpc2Cidr: validators.isValidCidr
        });

        // Validate that VPCs have different CIDRs
        const vpc1Cidr = outputs.vpc1Cidr.value;
        const vpc2Cidr = outputs.vpc2Cidr.value;
        
        expect(vpc1Cidr).not.toBe(vpc2Cidr);
        expect(vpc1Cidr).toMatch(/^10\.0\.\d+\.\d+\/\d+$/);
        expect(vpc2Cidr).toMatch(/^10\.0\.\d+\.\d+\/\d+$/);

        console.log('✅ Multiple VPCs + IPAM integration test passed');
        console.log(`   VPC 1 CIDR: ${vpc1Cidr}`);
        console.log(`   VPC 2 CIDR: ${vpc2Cidr}`);

    }, testTimeout);
});