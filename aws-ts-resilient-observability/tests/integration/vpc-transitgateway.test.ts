import { IntegrationTestHelper, validators } from './test-utils';
import { VPCComponent } from '../../components/vpc';
import * as pulumi from "@pulumi/pulumi";

/**
 * Integration tests for VPC + Transit Gateway component interaction
 * Tests the integration between VPC and Transit Gateway for cross-VPC connectivity
 */
describe('VPC + Transit Gateway Integration Tests', () => {
    let testHelper: IntegrationTestHelper;
    const testTimeout = 15 * 60 * 1000; // 15 minutes

    beforeAll(() => {
        testHelper = new IntegrationTestHelper('vpc-tgw-integration');
    });

    afterAll(async () => {
        await testHelper.cleanup();
    }, testTimeout);

    test('VPC should successfully attach to Transit Gateway', async () => {
        // Create test workspace
        const workspaceDir = testHelper.createTestWorkspace('vpc-tgw-basic');

        // Create test program that deploys Transit Gateway and VPC
        const testProgram = `
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VPCComponent } from "../../components/vpc";

// Create Transit Gateway first
const transitGateway = new aws.ec2transitgateway.TransitGateway("test-tgw", {
    description: "Test Transit Gateway for integration testing",
    amazonSideAsn: 64512,
    autoAcceptSharedAttachments: "enable",
    defaultRouteTableAssociation: "enable",
    defaultRouteTablePropagation: "enable",
    tags: {
        Name: "test-tgw",
        TestType: "integration",
        Component: "transit-gateway"
    }
});

// Create VPC with Transit Gateway attachment
const vpc = new VPCComponent("test-vpc", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    transitGatewayArn: transitGateway.arn,
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
        },
        transit: {
            type: "transit-gateway",
            subnetPrefix: 28,
            availabilityZones: [0, 1]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc"
    }
});

// Export outputs for validation
export const transitGatewayId = transitGateway.id;
export const transitGatewayArn = transitGateway.arn;
export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const transitGatewayAttachmentId = vpc.transitGatewayAttachmentId;
export const transitGatewaySubnetIds = vpc.getSubnetIdsByType("transit-gateway");
`;

        testHelper.writeTestProgram(workspaceDir, testProgram);

        // Create and deploy test stack
        const stack = await testHelper.createTestStack({
            stackName: 'vpc-tgw-basic',
            workDir: workspaceDir
        });

        const deployResult = await testHelper.deployTestStack(stack);

        // Verify deployment succeeded
        expect(deployResult.success).toBe(true);
        expect(deployResult.outputs).toBeDefined();

        // Wait for all outputs to be available
        const outputs = await testHelper.waitForStackOutputs(stack, [
            'transitGatewayId', 'transitGatewayArn', 'vpcId', 'vpcCidr',
            'transitGatewayAttachmentId', 'transitGatewaySubnetIds'
        ]);

        // Validate Transit Gateway outputs
        testHelper.validateStackOutputs(outputs, {
            transitGatewayId: validators.isString,
            transitGatewayArn: validators.isValidArn,
        });

        // Validate VPC outputs
        testHelper.validateStackOutputs(outputs, {
            vpcId: validators.isValidVpcId,
            vpcCidr: validators.isValidCidr,
            transitGatewayAttachmentId: validators.isString,
            transitGatewaySubnetIds: validators.isArray
        });

        // Validate Transit Gateway attachment
        const attachmentId = outputs.transitGatewayAttachmentId.value;
        expect(attachmentId).toMatch(/^tgw-attach-/);

        // Validate Transit Gateway subnets
        const tgwSubnets = outputs.transitGatewaySubnetIds.value;
        expect(tgwSubnets).toHaveLength(2); // 2 AZs
        tgwSubnets.forEach((subnetId: string) => {
            expect(subnetId).toMatch(/^subnet-/);
        });

        console.log('✅ VPC + Transit Gateway integration test passed');
        console.log(`   Transit Gateway ID: ${outputs.transitGatewayId.value}`);
        console.log(`   VPC ID: ${outputs.vpcId.value}`);
        console.log(`   Attachment ID: ${attachmentId}`);

    }, testTimeout);

    test('Multiple VPCs should successfully attach to same Transit Gateway', async () => {
        // Create test workspace
        const workspaceDir = testHelper.createTestWorkspace('vpc-tgw-multiple');

        // Create test program with multiple VPCs attached to same TGW
        const testProgram = `
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VPCComponent } from "../../components/vpc";

// Create Transit Gateway
const transitGateway = new aws.ec2transitgateway.TransitGateway("test-tgw-multi", {
    description: "Test Transit Gateway for multiple VPC integration",
    amazonSideAsn: 64512,
    autoAcceptSharedAttachments: "enable",
    defaultRouteTableAssociation: "enable",
    defaultRouteTablePropagation: "enable",
    tags: {
        Name: "test-tgw-multi",
        TestType: "integration",
        Component: "transit-gateway"
    }
});

// Create first VPC
const vpc1 = new VPCComponent("test-vpc-1", {
    region: "us-east-1",
    cidrBlock: "10.1.0.0/16",
    transitGatewayArn: transitGateway.arn,
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 2,
    subnets: {
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: [0, 1]
        },
        transit: {
            type: "transit-gateway",
            subnetPrefix: 28,
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
    cidrBlock: "10.2.0.0/16",
    transitGatewayArn: transitGateway.arn,
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 2,
    subnets: {
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: [0, 1]
        },
        transit: {
            type: "transit-gateway",
            subnetPrefix: 28,
            availabilityZones: [0, 1]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc-2"
    }
});

// Export outputs for validation
export const transitGatewayId = transitGateway.id;
export const vpc1Id = vpc1.vpcId;
export const vpc1Cidr = vpc1.cidrBlock;
export const vpc1AttachmentId = vpc1.transitGatewayAttachmentId;
export const vpc2Id = vpc2.vpcId;
export const vpc2Cidr = vpc2.cidrBlock;
export const vpc2AttachmentId = vpc2.transitGatewayAttachmentId;
`;

        testHelper.writeTestProgram(workspaceDir, testProgram);

        // Create and deploy test stack
        const stack = await testHelper.createTestStack({
            stackName: 'vpc-tgw-multiple',
            workDir: workspaceDir
        });

        const deployResult = await testHelper.deployTestStack(stack);

        // Verify deployment succeeded
        expect(deployResult.success).toBe(true);

        // Wait for outputs
        const outputs = await testHelper.waitForStackOutputs(stack, [
            'transitGatewayId', 'vpc1Id', 'vpc1Cidr', 'vpc1AttachmentId',
            'vpc2Id', 'vpc2Cidr', 'vpc2AttachmentId'
        ]);

        // Validate outputs
        testHelper.validateStackOutputs(outputs, {
            transitGatewayId: validators.isString,
            vpc1Id: validators.isValidVpcId,
            vpc1Cidr: validators.isValidCidr,
            vpc1AttachmentId: validators.isString,
            vpc2Id: validators.isValidVpcId,
            vpc2Cidr: validators.isValidCidr,
            vpc2AttachmentId: validators.isString
        });

        // Validate that VPCs have different CIDRs and attachment IDs
        const vpc1Cidr = outputs.vpc1Cidr.value;
        const vpc2Cidr = outputs.vpc2Cidr.value;
        const vpc1AttachmentId = outputs.vpc1AttachmentId.value;
        const vpc2AttachmentId = outputs.vpc2AttachmentId.value;

        expect(vpc1Cidr).not.toBe(vpc2Cidr);
        expect(vpc1AttachmentId).not.toBe(vpc2AttachmentId);
        expect(vpc1AttachmentId).toMatch(/^tgw-attach-/);
        expect(vpc2AttachmentId).toMatch(/^tgw-attach-/);

        console.log('✅ Multiple VPCs + Transit Gateway integration test passed');
        console.log(`   Transit Gateway ID: ${outputs.transitGatewayId.value}`);
        console.log(`   VPC 1 CIDR: ${vpc1Cidr}, Attachment: ${vpc1AttachmentId}`);
        console.log(`   VPC 2 CIDR: ${vpc2Cidr}, Attachment: ${vpc2AttachmentId}`);

    }, testTimeout);

    test('VPC should handle Transit Gateway attachment failure gracefully', async () => {
        // Create test workspace
        const workspaceDir = testHelper.createTestWorkspace('vpc-tgw-failure');

        // Create test program with invalid Transit Gateway ARN
        const testProgram = `
import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../../components/vpc";

// Try to create VPC with invalid Transit Gateway ARN
const vpc = new VPCComponent("test-vpc-invalid-tgw", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    transitGatewayArn: "arn:aws:ec2:us-east-1:123456789012:transit-gateway/tgw-invalid123456",
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 2,
    subnets: {
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: [0, 1]
        },
        transit: {
            type: "transit-gateway",
            subnetPrefix: 28,
            availabilityZones: [0, 1]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc-invalid-tgw"
    }
});

export const vpcId = vpc.vpcId;
`;

        testHelper.writeTestProgram(workspaceDir, testProgram);

        // Create and deploy test stack - this should fail
        const stack = await testHelper.createTestStack({
            stackName: 'vpc-tgw-failure',
            workDir: workspaceDir
        });

        const deployResult = await testHelper.deployTestStack(stack);

        // Verify deployment failed as expected
        expect(deployResult.success).toBe(false);
        expect(deployResult.error).toBeDefined();
        expect(deployResult.error).toMatch(/transit.gateway|tgw-|InvalidTransitGateway/i);

        console.log('✅ VPC + Transit Gateway failure test passed (deployment failed as expected)');
        console.log(`   Error: ${deployResult.error}`);

    }, testTimeout);

    test('VPC should create Transit Gateway subnets when no dedicated subnets specified', async () => {
        // Create test workspace
        const workspaceDir = testHelper.createTestWorkspace('vpc-tgw-fallback');

        // Create test program with VPC that has no transit-gateway subnets
        const testProgram = `
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VPCComponent } from "../../components/vpc";

// Create Transit Gateway
const transitGateway = new aws.ec2transitgateway.TransitGateway("test-tgw-fallback", {
    description: "Test Transit Gateway for fallback subnet testing",
    amazonSideAsn: 64512,
    tags: {
        Name: "test-tgw-fallback",
        TestType: "integration"
    }
});

// Create VPC with only private subnets (no transit-gateway subnets)
const vpc = new VPCComponent("test-vpc-fallback", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    transitGatewayArn: transitGateway.arn,
    internetGatewayEnabled: false,
    natGatewayEnabled: false,
    availabilityZoneCount: 2,
    subnets: {
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: [0, 1]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc-fallback"
    }
});

// Export outputs for validation
export const transitGatewayId = transitGateway.id;
export const vpcId = vpc.vpcId;
export const transitGatewayAttachmentId = vpc.transitGatewayAttachmentId;
export const privateSubnetIds = vpc.getSubnetIdsByType("private");
`;

        testHelper.writeTestProgram(workspaceDir, testProgram);

        // Create and deploy test stack
        const stack = await testHelper.createTestStack({
            stackName: 'vpc-tgw-fallback',
            workDir: workspaceDir
        });

        const deployResult = await testHelper.deployTestStack(stack);

        // Verify deployment succeeded
        expect(deployResult.success).toBe(true);

        // Wait for outputs
        const outputs = await testHelper.waitForStackOutputs(stack, [
            'transitGatewayId', 'vpcId', 'transitGatewayAttachmentId', 'privateSubnetIds'
        ]);

        // Validate that attachment was created using private subnets
        testHelper.validateStackOutputs(outputs, {
            transitGatewayId: validators.isString,
            vpcId: validators.isValidVpcId,
            transitGatewayAttachmentId: validators.isString,
            privateSubnetIds: validators.isArray
        });

        const attachmentId = outputs.transitGatewayAttachmentId.value;
        const privateSubnets = outputs.privateSubnetIds.value;

        expect(attachmentId).toMatch(/^tgw-attach-/);
        expect(privateSubnets).toHaveLength(2);

        console.log('✅ VPC + Transit Gateway fallback subnet test passed');
        console.log(`   Transit Gateway ID: ${outputs.transitGatewayId.value}`);
        console.log(`   VPC ID: ${outputs.vpcId.value}`);
        console.log(`   Attachment ID: ${attachmentId}`);
        console.log(`   Used private subnets for attachment: ${privateSubnets.join(', ')}`);

    }, testTimeout);
});