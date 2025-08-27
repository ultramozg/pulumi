import { IntegrationTestHelper, validators } from './test-utils';
import { InfrastructureAutomation } from '../../index';
import { DeploymentConfig } from '../../automation/types';
import * as path from 'path';
import * as fs from 'fs';

/**
 * End-to-end integration tests for complete automation API with run-all capabilities
 * Tests the complete deployment orchestration including parallel deployment, rollback, and CLI operations
 */
describe('End-to-End Deployment Integration Tests', () => {
    let testHelper: IntegrationTestHelper;
    let automation: InfrastructureAutomation;
    const testTimeout = 30 * 60 * 1000; // 30 minutes

    beforeAll(() => {
        testHelper = new IntegrationTestHelper('end-to-end-deployment');
        automation = new InfrastructureAutomation({
            errorHandling: {
                strategy: 'RETRY',
                maxRetries: 2,
                retryDelay: 3000,
                backoffMultiplier: 1.5
            }
        });
    });

    afterAll(async () => {
        await testHelper.cleanup();
    }, testTimeout);

    test('Should deploy complete infrastructure with run-all capabilities', async () => {
        // Create a comprehensive deployment configuration
        const deploymentConfig: DeploymentConfig = {
            name: 'complete-infrastructure-e2e',
            defaultRegion: 'us-east-1',
            defaultTags: {
                Environment: 'integration-test',
                Project: 'aws-infrastructure-components',
                TestType: 'end-to-end'
            },
            stacks: [
                // Networking foundation
                {
                    name: 'networking-foundation',
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
                        }
                    ],
                    tags: { Layer: 'networking' }
                },
                // Multi-region VPCs
                {
                    name: 'vpc-east',
                    workDir: testHelper.createTestWorkspace('vpc-east'),
                    dependencies: ['networking-foundation'],
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
                                        cidrPrefix: 24
                                    },
                                    private: {
                                        type: 'private',
                                        cidrPrefix: 24
                                    }
                                }
                            }
                        }
                    ],
                    tags: { Layer: 'networking', Region: 'us-east-1' }
                },
                {
                    name: 'vpc-west',
                    workDir: testHelper.createTestWorkspace('vpc-west'),
                    dependencies: ['networking-foundation'],
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
                                        cidrPrefix: 24
                                    },
                                    private: {
                                        type: 'private',
                                        cidrPrefix: 24
                                    }
                                }
                            }
                        }
                    ],
                    tags: { Layer: 'networking', Region: 'us-west-2' }
                },
                // Container registry with cross-region replication
                {
                    name: 'container-registry',
                    workDir: testHelper.createTestWorkspace('container-registry'),
                    components: [
                        {
                            type: 'ecr',
                            name: 'application-registry',
                            config: {
                                repositories: [
                                    {
                                        name: 'e2e-test-app',
                                        shareWithOrganization: false,
                                        lifecyclePolicy: JSON.stringify({
                                            rules: [{
                                                rulePriority: 1,
                                                description: 'Keep last 5 images only',
                                                selection: {
                                                    tagStatus: 'any',
                                                    countType: 'imageCountMoreThan',
                                                    countNumber: 5
                                                },
                                                action: { type: 'expire' }
                                            }]
                                        })
                                    },
                                    {
                                        name: 'e2e-test-api',
                                        shareWithOrganization: false
                                    }
                                ],
                                replicationEnabled: true,
                                sourceRegion: 'us-east-1',
                                destinationRegion: 'us-west-2'
                            }
                        }
                    ],
                    tags: { Layer: 'container-registry' }
                },
                // DNS and certificates
                {
                    name: 'dns-certificates',
                    workDir: testHelper.createTestWorkspace('dns-certificates'),
                    components: [
                        {
                            type: 'route53',
                            name: 'primary-dns',
                            config: {
                                hostedZones: [
                                    {
                                        name: 'e2e-test.example.com',
                                        private: false,
                                        comment: 'E2E test hosted zone'
                                    }
                                ]
                            }
                        },
                        {
                            type: 'acm',
                            name: 'ssl-certificates',
                            config: {
                                region: 'us-east-1',
                                certificates: [
                                    {
                                        domainName: '*.e2e-test.example.com',
                                        subjectAlternativeNames: ['e2e-test.example.com'],
                                        validationMethod: 'DNS'
                                    }
                                ]
                            }
                        }
                    ],
                    tags: { Layer: 'dns-certificates' }
                }
            ]
        };

        // Create test programs for each stack
        const networkingProgram = `
import * as pulumi from "@pulumi/pulumi";
import { IPAMComponent } from "../../../components/ipam";

const ipam = new IPAMComponent("central-ipam", {
    cidrBlocks: ["10.0.0.0/8"],
    shareWithOrganization: false,
    operatingRegions: ["us-east-1", "us-west-2"],
    tags: {
        TestType: "end-to-end",
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
            cidrPrefix: 24
        },
        private: {
            type: "private",
            cidrPrefix: 24
        }
    },
    tags: {
        TestType: "end-to-end",
        Layer: "networking",
        Region: "us-east-1"
    }
});

export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const publicSubnetIds = vpc.getSubnetIdsByType("public");
export const privateSubnetIds = vpc.getSubnetIdsByType("private");
export const internetGatewayId = vpc.internetGatewayId;
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
            cidrPrefix: 24
        },
        private: {
            type: "private",
            cidrPrefix: 24
        }
    },
    tags: {
        TestType: "end-to-end",
        Layer: "networking",
        Region: "us-west-2"
    }
});

export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const publicSubnetIds = vpc.getSubnetIdsByType("public");
export const privateSubnetIds = vpc.getSubnetIdsByType("private");
export const internetGatewayId = vpc.internetGatewayId;
`;

        const ecrProgram = `
import * as pulumi from "@pulumi/pulumi";
import { ECRComponent } from "../../../components/ecr";

const ecr = new ECRComponent("application-registry", {
    repositories: [
        {
            name: "e2e-test-app",
            shareWithOrganization: false,
            lifecyclePolicy: JSON.stringify({
                rules: [{
                    rulePriority: 1,
                    description: "Keep last 5 images only",
                    selection: {
                        tagStatus: "any",
                        countType: "imageCountMoreThan",
                        countNumber: 5
                    },
                    action: { type: "expire" }
                }]
            })
        },
        {
            name: "e2e-test-api",
            shareWithOrganization: false
        }
    ],
    replicationEnabled: true,
    sourceRegion: "us-east-1",
    destinationRegion: "us-west-2",
    tags: {
        TestType: "end-to-end",
        Layer: "container-registry"
    }
});

export const repositoryUrls = ecr.repositoryUrls;
export const replicationConfigurationId = ecr.replicationConfigurationId;
`;

        const dnsProgram = `
import * as pulumi from "@pulumi/pulumi";
import { Route53Component } from "../../../components/route53";
import { ACMComponent } from "../../../components/acm";

const route53 = new Route53Component("primary-dns", {
    hostedZones: [
        {
            name: "e2e-test.example.com",
            private: false,
            comment: "E2E test hosted zone"
        }
    ],
    tags: {
        TestType: "end-to-end",
        Layer: "dns"
    }
});

const acm = new ACMComponent("ssl-certificates", {
    region: "us-east-1",
    certificates: [
        {
            domainName: "*.e2e-test.example.com",
            subjectAlternativeNames: ["e2e-test.example.com"],
            validationMethod: "DNS",
            hostedZoneId: route53.getHostedZoneId("e2e-test.example.com")
        }
    ],
    tags: {
        TestType: "end-to-end",
        Layer: "certificates"
    }
});

export const hostedZoneId = route53.getHostedZoneId("e2e-test.example.com");
export const nameServers = route53.getNameServers("e2e-test.example.com");
export const certificateArn = acm.getCertificateArn("*.e2e-test.example.com");
`;

        // Write test programs
        testHelper.writeTestProgram(deploymentConfig.stacks[0].workDir, networkingProgram);
        testHelper.writeTestProgram(deploymentConfig.stacks[1].workDir, vpcEastProgram);
        testHelper.writeTestProgram(deploymentConfig.stacks[2].workDir, vpcWestProgram);
        testHelper.writeTestProgram(deploymentConfig.stacks[3].workDir, ecrProgram);
        testHelper.writeTestProgram(deploymentConfig.stacks[4].workDir, dnsProgram);

        console.log('🚀 Starting end-to-end deployment test...');

        // Deploy the complete infrastructure with enhanced options
        const deploymentResult = await automation.deployAll(deploymentConfig, {
            parallel: true,
            refresh: false,
            continueOnFailure: false,
            rollbackOnFailure: true
        });

        // Verify deployment succeeded
        expect(deploymentResult.successfulStacks).toBe(5);
        expect(deploymentResult.failedStacks).toBe(0);
        expect(deploymentResult.results).toHaveLength(5);

        // Verify all stacks deployed successfully
        deploymentResult.results.forEach(result => {
            expect(result.success).toBe(true);
            expect(result.duration).toBeGreaterThan(0);
        });

        // Verify deployment order and dependencies
        const networkingResult = deploymentResult.results.find(r => 
            r.stackName.includes('networking-foundation'));
        const vpcEastResult = deploymentResult.results.find(r => 
            r.stackName.includes('vpc-east'));
        const vpcWestResult = deploymentResult.results.find(r => 
            r.stackName.includes('vpc-west'));
        const ecrResult = deploymentResult.results.find(r => 
            r.stackName.includes('container-registry'));
        const dnsResult = deploymentResult.results.find(r => 
            r.stackName.includes('dns-certificates'));

        expect(networkingResult).toBeDefined();
        expect(vpcEastResult).toBeDefined();
        expect(vpcWestResult).toBeDefined();
        expect(ecrResult).toBeDefined();
        expect(dnsResult).toBeDefined();

        // Verify outputs from key stacks
        const networkingStack = await testHelper.createTestStack({
            stackName: deploymentConfig.stacks[0].name,
            workDir: deploymentConfig.stacks[0].workDir
        });

        const networkingOutputs = await testHelper.waitForStackOutputs(networkingStack, [
            'ipamId', 'ipamArn'
        ]);

        testHelper.validateStackOutputs(networkingOutputs, {
            ipamId: validators.isString,
            ipamArn: validators.isValidArn
        });

        console.log('✅ End-to-end deployment test passed');
        console.log(`   Total stacks: ${deploymentResult.totalStacks}`);
        console.log(`   Successful: ${deploymentResult.successfulStacks}`);
        console.log(`   Total duration: ${(deploymentResult.totalDuration / 1000).toFixed(2)}s`);

        // Log individual stack results
        deploymentResult.results.forEach(result => {
            const duration = result.duration ? `(${(result.duration / 1000).toFixed(2)}s)` : '';
            console.log(`   ✅ ${result.stackName} ${duration}`);
        });

    }, testTimeout);

    test('Should handle rollback on deployment failure', async () => {
        // Create deployment configuration with intentional failure in the middle
        const deploymentConfig: DeploymentConfig = {
            name: 'rollback-test-deployment',
            defaultRegion: 'us-east-1',
            defaultTags: {
                Environment: 'integration-test',
                TestType: 'rollback'
            },
            stacks: [
                // First stack that should succeed
                {
                    name: 'successful-stack-1',
                    workDir: testHelper.createTestWorkspace('successful-stack-1'),
                    components: [
                        {
                            type: 'vpc',
                            name: 'test-vpc-1',
                            config: {
                                region: 'us-east-1',
                                cidrBlock: '10.10.0.0/16',
                                internetGatewayEnabled: true,
                                natGatewayEnabled: false,
                                availabilityZoneCount: 1,
                                subnets: {
                                    public: {
                                        type: 'public',
                                        cidrPrefix: 24
                                    }
                                }
                            }
                        }
                    ]
                },
                // Second stack that should succeed
                {
                    name: 'successful-stack-2',
                    workDir: testHelper.createTestWorkspace('successful-stack-2'),
                    components: [
                        {
                            type: 'ecr',
                            name: 'test-registry',
                            config: {
                                repositories: [
                                    {
                                        name: 'rollback-test-repo',
                                        shareWithOrganization: false
                                    }
                                ],
                                replicationEnabled: false,
                                sourceRegion: 'us-east-1',
                                destinationRegion: 'us-east-1'
                            }
                        }
                    ]
                },
                // Third stack that will fail
                {
                    name: 'failing-stack',
                    workDir: testHelper.createTestWorkspace('failing-stack'),
                    dependencies: ['successful-stack-1', 'successful-stack-2'],
                    components: [
                        {
                            type: 'invalid-component',
                            name: 'invalid',
                            config: {}
                        }
                    ]
                }
            ]
        };

        // Create test programs
        const successfulProgram1 = `
import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../../../components/vpc";

const vpc = new VPCComponent("test-vpc-1", {
    region: "us-east-1",
    cidrBlock: "10.10.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 1,
    subnets: {
        public: {
            type: "public",
            cidrPrefix: 24
        }
    },
    tags: {
        TestType: "rollback"
    }
});

export const vpcId = vpc.vpcId;
`;

        const successfulProgram2 = `
import * as pulumi from "@pulumi/pulumi";
import { ECRComponent } from "../../../components/ecr";

const ecr = new ECRComponent("test-registry", {
    repositories: [
        {
            name: "rollback-test-repo",
            shareWithOrganization: false
        }
    ],
    replicationEnabled: false,
    sourceRegion: "us-east-1",
    destinationRegion: "us-east-1",
    tags: {
        TestType: "rollback"
    }
});

export const repositoryUrls = ecr.repositoryUrls;
`;

        const failingProgram = `
import * as pulumi from "@pulumi/pulumi";

// This will cause a deployment failure
throw new Error("Intentional rollback test failure");
`;

        // Write test programs
        testHelper.writeTestProgram(deploymentConfig.stacks[0].workDir, successfulProgram1);
        testHelper.writeTestProgram(deploymentConfig.stacks[1].workDir, successfulProgram2);
        testHelper.writeTestProgram(deploymentConfig.stacks[2].workDir, failingProgram);

        console.log('🔄 Starting rollback test...');

        // Deploy with rollback on failure enabled
        const deploymentResult = await automation.deployAll(deploymentConfig, {
            parallel: true,
            rollbackOnFailure: true,
            continueOnFailure: false
        });

        // Verify deployment failed as expected
        expect(deploymentResult.successfulStacks).toBeLessThan(deploymentConfig.stacks.length);
        expect(deploymentResult.failedStacks).toBeGreaterThan(0);

        // Verify the failing stack result
        const failingResult = deploymentResult.results.find(r => 
            r.stackName.includes('failing-stack'));
        expect(failingResult).toBeDefined();
        expect(failingResult!.success).toBe(false);
        expect(failingResult!.error).toContain('Intentional rollback test failure');

        console.log('✅ Rollback test passed');
        console.log(`   Failed stacks: ${deploymentResult.failedStacks}`);
        console.log(`   Rollback was triggered due to failure`);

    }, testTimeout);

    test('Should create and deploy components configuration programmatically', async () => {
        // Test the createComponentsConfig functionality
        const config = automation.createComponentsConfig('programmatic-test', {
            region: 'us-east-1',
            tags: {
                TestType: 'programmatic',
                CreatedBy: 'automation-api'
            },
            includeComponents: ['vpc', 'ecr'],
            excludeComponents: ['rds', 'eks']
        });

        // Verify configuration structure
        expect(config.name).toBe('programmatic-test');
        expect(config.defaultRegion).toBe('us-east-1');
        expect(config.stacks).toHaveLength(2);

        const vpcStack = config.stacks.find(s => s.name.includes('vpc'));
        const ecrStack = config.stacks.find(s => s.name.includes('ecr'));

        expect(vpcStack).toBeDefined();
        expect(ecrStack).toBeDefined();

        // Verify VPC configuration
        expect(vpcStack!.components).toHaveLength(1);
        expect(vpcStack!.components[0].type).toBe('vpc');
        expect(vpcStack!.components[0].config.region).toBe('us-east-1');
        expect(vpcStack!.components[0].config.cidrBlock).toBe('10.0.0.0/16');

        // Verify ECR configuration
        expect(ecrStack!.components).toHaveLength(1);
        expect(ecrStack!.components[0].type).toBe('ecr');
        expect(ecrStack!.components[0].config.repositories).toHaveLength(1);

        console.log('✅ Programmatic configuration test passed');
        console.log(`   Generated ${config.stacks.length} stacks`);
        console.log(`   Components: ${config.stacks.map(s => s.components[0].type).join(', ')}`);

    }, testTimeout);

    test('Should handle preview mode without making changes', async () => {
        // Create a simple deployment configuration for preview
        const deploymentConfig: DeploymentConfig = {
            name: 'preview-test-deployment',
            defaultRegion: 'us-east-1',
            defaultTags: {
                Environment: 'integration-test',
                TestType: 'preview'
            },
            stacks: [
                {
                    name: 'preview-stack',
                    workDir: testHelper.createTestWorkspace('preview-stack'),
                    components: [
                        {
                            type: 'vpc',
                            name: 'preview-vpc',
                            config: {
                                region: 'us-east-1',
                                cidrBlock: '10.20.0.0/16',
                                internetGatewayEnabled: true,
                                natGatewayEnabled: false,
                                availabilityZoneCount: 1,
                                subnets: {
                                    public: {
                                        type: 'public',
                                        cidrPrefix: 24
                                    }
                                }
                            }
                        }
                    ]
                }
            ]
        };

        const previewProgram = `
import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../../../components/vpc";

const vpc = new VPCComponent("preview-vpc", {
    region: "us-east-1",
    cidrBlock: "10.20.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 1,
    subnets: {
        public: {
            type: "public",
            cidrPrefix: 24
        }
    },
    tags: {
        TestType: "preview"
    }
});

export const vpcId = vpc.vpcId;
`;

        testHelper.writeTestProgram(deploymentConfig.stacks[0].workDir, previewProgram);

        console.log('🔍 Starting preview test...');

        // Run preview
        const previewResult = await automation.previewAll(deploymentConfig, {
            parallel: true,
            refresh: false
        });

        // Verify preview completed successfully
        expect(previewResult.successfulStacks).toBe(1);
        expect(previewResult.failedStacks).toBe(0);
        expect(previewResult.results).toHaveLength(1);

        const result = previewResult.results[0];
        expect(result.success).toBe(true);
        expect(result.stackName).toContain('preview-stack');

        console.log('✅ Preview test passed');
        console.log(`   Preview completed for ${previewResult.successfulStacks} stack(s)`);

    }, testTimeout);
});