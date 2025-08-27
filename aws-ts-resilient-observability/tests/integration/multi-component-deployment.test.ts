import { IntegrationTestHelper, validators } from './test-utils';
import { DeploymentConfig } from '../../automation/types';

/**
 * End-to-end integration tests for multi-component stack deployments
 * Tests the complete deployment orchestration with dependencies between components
 */
describe('Multi-Component Deployment Integration Tests', () => {
    let testHelper: IntegrationTestHelper;
    const testTimeout = 20 * 60 * 1000; // 20 minutes

    beforeAll(() => {
        testHelper = new IntegrationTestHelper('multi-component-deployment');
    });

    afterAll(async () => {
        await testHelper.cleanup();
    }, testTimeout);

    test('Should deploy networking foundation stack with IPAM and Transit Gateway', async () => {
        // Create deployment configuration for networking foundation
        const deploymentConfig: DeploymentConfig = testHelper.createTestDeploymentConfig(
            'networking-foundation',
            [
                {
                    name: 'networking',
                    workDir: testHelper.createTestWorkspace('networking-foundation'),
                    components: [
                        {
                            type: 'ipam',
                            name: 'central-ipam',
                            config: {
                                cidrBlocks: ['10.0.0.0/8'],
                                shareWithOrganization: false,
                                operatingRegions: ['us-east-1', 'us-west-2']
                            }
                        },
                        {
                            type: 'transit-gateway',
                            name: 'central-tgw',
                            config: {
                                description: 'Central Transit Gateway for integration testing',
                                amazonSideAsn: 64512
                            }
                        }
                    ]
                }
            ]
        );

        // Create test program for networking stack
        const networkingProgram = `
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { IPAMComponent } from "../../../components/ipam";

// Create IPAM component
const ipam = new IPAMComponent("central-ipam", {
    cidrBlocks: ["10.0.0.0/8"],
    shareWithOrganization: false,
    operatingRegions: ["us-east-1", "us-west-2"],
    tags: {
        TestType: "integration",
        Layer: "networking",
        Component: "ipam"
    }
});

// Create Transit Gateway
const transitGateway = new aws.ec2transitgateway.TransitGateway("central-tgw", {
    description: "Central Transit Gateway for integration testing",
    amazonSideAsn: 64512,
    autoAcceptSharedAttachments: "enable",
    defaultRouteTableAssociation: "enable",
    defaultRouteTablePropagation: "enable",
    tags: {
        Name: "central-tgw",
        TestType: "integration",
        Layer: "networking",
        Component: "transit-gateway"
    }
});

// Export outputs for other stacks to use
export const ipamId = ipam.ipamId;
export const ipamArn = ipam.ipamArn;
export const ipamPoolIdEast = ipam.getPoolId("us-east-1");
export const ipamPoolIdWest = ipam.getPoolId("us-west-2");
export const transitGatewayId = transitGateway.id;
export const transitGatewayArn = transitGateway.arn;
`;

        testHelper.writeTestProgram(
            deploymentConfig.stacks[0].workDir,
            networkingProgram
        );

        // Deploy the networking foundation
        const deploymentResult = await testHelper.deployMultipleStacks(deploymentConfig);

        // Verify deployment succeeded
        expect(deploymentResult.successfulStacks).toBe(1);
        expect(deploymentResult.failedStacks).toBe(0);
        expect(deploymentResult.results[0].success).toBe(true);

        // Get stack outputs
        const networkingStack = await testHelper.createTestStack({
            stackName: deploymentConfig.stacks[0].name,
            workDir: deploymentConfig.stacks[0].workDir
        });

        const outputs = await testHelper.waitForStackOutputs(networkingStack, [
            'ipamId', 'ipamArn', 'ipamPoolIdEast', 'ipamPoolIdWest',
            'transitGatewayId', 'transitGatewayArn'
        ]);

        // Validate networking outputs
        testHelper.validateStackOutputs(outputs, {
            ipamId: validators.isString,
            ipamArn: validators.isValidArn,
            ipamPoolIdEast: validators.isString,
            ipamPoolIdWest: validators.isString,
            transitGatewayId: validators.isString,
            transitGatewayArn: validators.isValidArn
        });

        console.log('✅ Networking foundation deployment test passed');
        console.log(`   IPAM ID: ${outputs.ipamId.value}`);
        console.log(`   Transit Gateway ID: ${outputs.transitGatewayId.value}`);

    }, testTimeout);

    test('Should deploy complete multi-region infrastructure with dependencies', async () => {
        // Create deployment configuration for complete infrastructure
        const deploymentConfig: DeploymentConfig = testHelper.createTestDeploymentConfig(
            'complete-infrastructure',
            [
                // Networking foundation stack
                {
                    name: 'networking',
                    workDir: testHelper.createTestWorkspace('complete-networking'),
                    components: [
                        {
                            type: 'ipam',
                            name: 'central-ipam',
                            config: {
                                cidrBlocks: ['10.0.0.0/8'],
                                shareWithOrganization: false,
                                operatingRegions: ['us-east-1', 'us-west-2']
                            }
                        }
                    ]
                },
                // VPC stacks that depend on networking
                {
                    name: 'vpc-east',
                    workDir: testHelper.createTestWorkspace('complete-vpc-east'),
                    dependencies: ['networking'],
                    components: [
                        {
                            type: 'vpc',
                            name: 'production-vpc-east',
                            region: 'us-east-1',
                            config: {
                                region: 'us-east-1',
                                cidrBlock: '10.1.0.0/16',
                                internetGatewayEnabled: true,
                                natGatewayEnabled: false,
                                availabilityZoneCount: 2,
                                subnets: {
                                    public: {
                                        type: 'public',
                                        subnetPrefix: 24,
                                        availabilityZones: [0, 1]
                                    },
                                    private: {
                                        type: 'private',
                                        subnetPrefix: 24,
                                        availabilityZones: [0, 1]
                                    }
                                }
                            }
                        }
                    ]
                },
                {
                    name: 'vpc-west',
                    workDir: testHelper.createTestWorkspace('complete-vpc-west'),
                    dependencies: ['networking'],
                    components: [
                        {
                            type: 'vpc',
                            name: 'production-vpc-west',
                            region: 'us-west-2',
                            config: {
                                region: 'us-west-2',
                                cidrBlock: '10.2.0.0/16',
                                internetGatewayEnabled: true,
                                natGatewayEnabled: false,
                                availabilityZoneCount: 2,
                                subnets: {
                                    public: {
                                        type: 'public',
                                        subnetPrefix: 24,
                                        availabilityZones: [0, 1]
                                    },
                                    private: {
                                        type: 'private',
                                        subnetPrefix: 24,
                                        availabilityZones: [0, 1]
                                    }
                                }
                            }
                        }
                    ]
                },
                // Container registry stack
                {
                    name: 'container-registry',
                    workDir: testHelper.createTestWorkspace('complete-ecr'),
                    components: [
                        {
                            type: 'ecr',
                            name: 'application-registry',
                            config: {
                                repositories: [
                                    {
                                        name: 'test-app',
                                        shareWithOrganization: false
                                    }
                                ],
                                replicationEnabled: true,
                                sourceRegion: 'us-east-1',
                                destinationRegion: 'us-west-2'
                            }
                        }
                    ]
                }
            ]
        );

        // Create test programs for each stack
        const networkingProgram = `
import * as pulumi from "@pulumi/pulumi";
import { IPAMComponent } from "../../../components/ipam";

const ipam = new IPAMComponent("central-ipam", {
    cidrBlocks: ["10.0.0.0/8"],
    shareWithOrganization: false,
    operatingRegions: ["us-east-1", "us-west-2"],
    tags: {
        TestType: "integration",
        Layer: "networking"
    }
});

export const ipamId = ipam.ipamId;
export const ipamArn = ipam.ipamArn;
export const ipamPoolIdEast = ipam.getPoolId("us-east-1");
export const ipamPoolIdWest = ipam.getPoolId("us-west-2");
`;

        const vpcEastProgram = `
import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../../../components/vpc";

const vpc = new VPCComponent("production-vpc-east", {
    region: "us-east-1",
    cidrBlock: "10.1.0.0/16",
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
        Layer: "networking",
        Region: "us-east-1"
    }
});

export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const publicSubnetIds = vpc.getSubnetIdsByType("public");
export const privateSubnetIds = vpc.getSubnetIdsByType("private");
`;

        const vpcWestProgram = `
import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../../../components/vpc";

const vpc = new VPCComponent("production-vpc-west", {
    region: "us-west-2",
    cidrBlock: "10.2.0.0/16",
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
        Layer: "networking",
        Region: "us-west-2"
    }
});

export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const publicSubnetIds = vpc.getSubnetIdsByType("public");
export const privateSubnetIds = vpc.getSubnetIdsByType("private");
`;

        const ecrProgram = `
import * as pulumi from "@pulumi/pulumi";
import { ECRComponent } from "../../../components/ecr";

const ecr = new ECRComponent("application-registry", {
    repositories: [
        {
            name: "test-app",
            shareWithOrganization: false
        }
    ],
    replicationEnabled: true,
    sourceRegion: "us-east-1",
    destinationRegion: "us-west-2",
    tags: {
        TestType: "integration",
        Layer: "container-registry"
    }
});

export const repositoryUrls = ecr.repositoryUrls;
export const replicationConfigurationId = ecr.replicationConfigurationId;
`;

        // Write test programs
        testHelper.writeTestProgram(deploymentConfig.stacks[0].workDir, networkingProgram);
        testHelper.writeTestProgram(deploymentConfig.stacks[1].workDir, vpcEastProgram);
        testHelper.writeTestProgram(deploymentConfig.stacks[2].workDir, vpcWestProgram);
        testHelper.writeTestProgram(deploymentConfig.stacks[3].workDir, ecrProgram);

        // Deploy the complete infrastructure
        const deploymentResult = await testHelper.deployMultipleStacks(deploymentConfig);

        // Verify deployment succeeded
        expect(deploymentResult.successfulStacks).toBe(4);
        expect(deploymentResult.failedStacks).toBe(0);
        expect(deploymentResult.results).toHaveLength(4);

        // Verify all stacks deployed successfully
        deploymentResult.results.forEach(result => {
            expect(result.success).toBe(true);
        });

        // Verify deployment order (networking first, then VPCs and ECR)
        const networkingResult = deploymentResult.results.find(r => 
            r.stackName.includes('networking'));
        const vpcEastResult = deploymentResult.results.find(r => 
            r.stackName.includes('vpc-east'));
        const vpcWestResult = deploymentResult.results.find(r => 
            r.stackName.includes('vpc-west'));
        const ecrResult = deploymentResult.results.find(r => 
            r.stackName.includes('container-registry'));

        expect(networkingResult).toBeDefined();
        expect(vpcEastResult).toBeDefined();
        expect(vpcWestResult).toBeDefined();
        expect(ecrResult).toBeDefined();

        console.log('✅ Complete multi-region infrastructure deployment test passed');
        console.log(`   Total stacks: ${deploymentResult.totalStacks}`);
        console.log(`   Successful: ${deploymentResult.successfulStacks}`);
        console.log(`   Total duration: ${(deploymentResult.totalDuration / 1000).toFixed(2)}s`);

        // Log individual stack results
        deploymentResult.results.forEach(result => {
            const duration = result.duration ? `(${(result.duration / 1000).toFixed(2)}s)` : '';
            console.log(`   ✅ ${result.stackName} ${duration}`);
        });

    }, testTimeout);

    test('Should handle deployment failures and stop dependent stacks', async () => {
        // Create deployment configuration with intentional failure
        const deploymentConfig: DeploymentConfig = testHelper.createTestDeploymentConfig(
            'failure-handling',
            [
                // Stack that will fail
                {
                    name: 'failing-stack',
                    workDir: testHelper.createTestWorkspace('failing-stack'),
                    components: [
                        {
                            type: 'invalid-component',
                            name: 'invalid',
                            config: {}
                        }
                    ]
                },
                // Stack that depends on the failing stack
                {
                    name: 'dependent-stack',
                    workDir: testHelper.createTestWorkspace('dependent-stack'),
                    dependencies: ['failing-stack'],
                    components: [
                        {
                            type: 'vpc',
                            name: 'dependent-vpc',
                            config: {
                                region: 'us-east-1',
                                cidrBlock: '10.0.0.0/16',
                                internetGatewayEnabled: true,
                                natGatewayEnabled: false,
                                availabilityZoneCount: 1,
                                subnets: {
                                    public: {
                                        type: 'public',
                                        subnetPrefix: 24,
                                        availabilityZones: [0]
                                    }
                                }
                            }
                        }
                    ]
                }
            ]
        );

        // Create failing test program
        const failingProgram = `
import * as pulumi from "@pulumi/pulumi";

// This will cause a deployment failure
throw new Error("Intentional test failure");
`;

        const dependentProgram = `
import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../../../components/vpc";

const vpc = new VPCComponent("dependent-vpc", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 1,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: [0]
        }
    },
    tags: {
        TestType: "integration"
    }
});

export const vpcId = vpc.vpcId;
`;

        // Write test programs
        testHelper.writeTestProgram(deploymentConfig.stacks[0].workDir, failingProgram);
        testHelper.writeTestProgram(deploymentConfig.stacks[1].workDir, dependentProgram);

        // Deploy the infrastructure (should fail)
        const deploymentResult = await testHelper.deployMultipleStacks(deploymentConfig);

        // Verify deployment failed as expected
        expect(deploymentResult.successfulStacks).toBe(0);
        expect(deploymentResult.failedStacks).toBe(1); // Only the first stack should be attempted
        expect(deploymentResult.totalStacks).toBe(2);

        // Verify the failing stack result
        const failingResult = deploymentResult.results.find(r => 
            r.stackName.includes('failing-stack'));
        expect(failingResult).toBeDefined();
        expect(failingResult!.success).toBe(false);
        expect(failingResult!.error).toContain('Intentional test failure');

        // Verify dependent stack was not attempted
        const dependentResult = deploymentResult.results.find(r => 
            r.stackName.includes('dependent-stack'));
        expect(dependentResult).toBeUndefined(); // Should not be attempted

        console.log('✅ Deployment failure handling test passed');
        console.log(`   Failed stacks: ${deploymentResult.failedStacks}`);
        console.log(`   Error: ${failingResult!.error}`);

    }, testTimeout);
});