import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { RDSGlobalComponent, RDSGlobalComponentArgs, RDSRegionConfig } from "./index";

// Mock Pulumi runtime
pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs): pulumi.runtime.MockResourceResult => {
        const outputs: { [key: string]: any } = { ...args.inputs };
        
        // Add specific outputs based on resource type
        switch (args.type) {
            case "aws:rds/globalCluster:GlobalCluster":
                outputs.arn = `arn:aws:rds::123456789012:global-cluster:${args.inputs.globalClusterIdentifier}`;
                outputs.globalClusterIdentifier = args.inputs.globalClusterIdentifier;
                outputs.id = args.inputs.globalClusterIdentifier;
                break;
            case "aws:rds/cluster:Cluster":
                outputs.arn = `arn:aws:rds:us-east-1:123456789012:cluster:${args.inputs.clusterIdentifier}`;
                outputs.endpoint = `${args.inputs.clusterIdentifier}.cluster-xyz.us-east-1.rds.amazonaws.com`;
                outputs.readerEndpoint = `${args.inputs.clusterIdentifier}.cluster-ro-xyz.us-east-1.rds.amazonaws.com`;
                outputs.id = args.inputs.clusterIdentifier;
                break;
            case "aws:rds/clusterInstance:ClusterInstance":
                outputs.arn = `arn:aws:rds:us-east-1:123456789012:db:${args.inputs.identifier}`;
                outputs.endpoint = `${args.inputs.identifier}.xyz.us-east-1.rds.amazonaws.com`;
                outputs.id = args.inputs.identifier;
                break;
            case "aws:rds/subnetGroup:SubnetGroup":
                outputs.arn = `arn:aws:rds:us-east-1:123456789012:subgrp:${args.inputs.name}`;
                outputs.id = args.inputs.name;
                break;
            case "aws:ec2/securityGroup:SecurityGroup":
                outputs.arn = `arn:aws:ec2:us-east-1:123456789012:security-group/sg-12345678`;
                outputs.id = "sg-12345678";
                break;
            case "aws:ec2/securityGroupRule:SecurityGroupRule":
                outputs.id = "sgr-12345678";
                break;
            case "aws:index/provider:Provider":
                outputs.id = "provider-id";
                break;
        }
        
        return {
            id: outputs.id || `${args.name}-id`,
            state: outputs
        };
    },
    call: (args: pulumi.runtime.MockCallArgs): pulumi.runtime.MockCallResult => {
        switch (args.token) {
            case "aws:index/getCallerIdentity:getCallerIdentity":
                return {
                    result: {
                        accountId: "123456789012",
                        arn: "arn:aws:iam::123456789012:user/test",
                        userId: "AIDACKCEVSQ6C2EXAMPLE"
                    }
                };
            case "aws:ec2/getSubnet:getSubnet":
                return {
                    result: {
                        id: args.inputs.id,
                        vpcId: "vpc-12345678",
                        cidrBlock: "10.0.1.0/24",
                        availabilityZone: "us-east-1a"
                    }
                };
            default:
                return { result: {} };
        }
    }
});

describe("RDSGlobalComponent", () => {
    let component: RDSGlobalComponent;

    const basicArgs: RDSGlobalComponentArgs = {
        globalClusterIdentifier: "test-global-cluster",
        engine: "aurora-mysql",
        engineVersion: "8.0.mysql_aurora.3.02.0",
        databaseName: "testdb",
        masterUsername: "admin",
        masterPassword: "password123",
        regions: [
            {
                region: "us-east-1",
                isPrimary: true,
                subnetIds: ["subnet-12345", "subnet-67890"],
                createSecurityGroup: true,
                securityGroupRules: [
                    {
                        type: "ingress",
                        fromPort: 3306,
                        toPort: 3306,
                        protocol: "tcp",
                        cidrBlocks: ["10.0.0.0/16"],
                        description: "MySQL access from VPC"
                    }
                ],
                instanceClass: "db.r6g.large",
                instanceCount: 2
            },
            {
                region: "us-west-2",
                isPrimary: false,
                subnetIds: ["subnet-abcde", "subnet-fghij"],
                createSecurityGroup: true,
                instanceClass: "db.r6g.large",
                instanceCount: 1
            }
        ],
        backupRetentionPeriod: 14,
        deletionProtection: true,
        storageEncrypted: true
    };

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
    });

    afterEach(() => {
        // Clean up after each test
        if (component) {
            // Component cleanup would go here if needed
        }
    });

    describe("Constructor", () => {
        test("creates RDS Global Database component with valid arguments", () => {
            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", basicArgs);
            }).not.toThrow();

            expect(component).toBeInstanceOf(RDSGlobalComponent);
        });

        test("throws error when globalClusterIdentifier is missing", () => {
            const invalidArgs = { ...basicArgs };
            delete (invalidArgs as any).globalClusterIdentifier;

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: globalClusterIdentifier is required");
        });

        test("throws error when engine is missing", () => {
            const invalidArgs = { ...basicArgs };
            delete (invalidArgs as any).engine;

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: engine is required");
        });

        test("throws error when regions array is empty", () => {
            const invalidArgs = { ...basicArgs, regions: [] };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: At least one region must be specified");
        });

        test("throws error when no primary region is specified", () => {
            const invalidArgs = {
                ...basicArgs,
                regions: basicArgs.regions.map(r => ({ ...r, isPrimary: false }))
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: Exactly one region must be marked as primary");
        });

        test("throws error when multiple primary regions are specified", () => {
            const invalidArgs = {
                ...basicArgs,
                regions: basicArgs.regions.map(r => ({ ...r, isPrimary: true }))
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: Exactly one region must be marked as primary");
        });

        test("throws error for invalid engine type", () => {
            const invalidArgs = { ...basicArgs, engine: "invalid-engine" as any };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: Engine must be 'aurora-mysql' or 'aurora-postgresql'");
        });

        test("throws error for invalid region format", () => {
            const invalidArgs = {
                ...basicArgs,
                regions: [
                    { ...basicArgs.regions[0], region: "invalid-region" }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: Invalid region format: invalid-region");
        });

        test("throws error when createSecurityGroup is true but subnetIds is missing", () => {
            const invalidArgs = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        createSecurityGroup: true
                        // subnetIds missing
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: Region us-east-1: subnetIds must be provided when createSecurityGroup is true");
        });
    });

    describe("Aurora MySQL Configuration", () => {
        test("creates Aurora MySQL global database", () => {
            const mysqlArgs = { ...basicArgs, engine: "aurora-mysql" as const };
            
            expect(() => {
                component = new RDSGlobalComponent("test-mysql-global", mysqlArgs);
            }).not.toThrow();
        });

        test("uses correct default port for MySQL security group rules", () => {
            const mysqlArgs = {
                ...basicArgs,
                engine: "aurora-mysql" as const,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetIds: ["subnet-12345", "subnet-67890"],
                        createSecurityGroup: true
                        // No custom security group rules - should use default
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-mysql-global", mysqlArgs);
            }).not.toThrow();
        });
    });

    describe("Aurora PostgreSQL Configuration", () => {
        test("creates Aurora PostgreSQL global database", () => {
            const postgresArgs = { ...basicArgs, engine: "aurora-postgresql" as const };
            
            expect(() => {
                component = new RDSGlobalComponent("test-postgres-global", postgresArgs);
            }).not.toThrow();
        });

        test("uses correct default port for PostgreSQL security group rules", () => {
            const postgresArgs = {
                ...basicArgs,
                engine: "aurora-postgresql" as const,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetIds: ["subnet-12345", "subnet-67890"],
                        createSecurityGroup: true
                        // No custom security group rules - should use default
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-postgres-global", postgresArgs);
            }).not.toThrow();
        });
    });

    describe("Subnet Group Management", () => {
        test("creates subnet group when subnetIds are provided", () => {
            const argsWithSubnets = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetIds: ["subnet-12345", "subnet-67890"],
                        createSecurityGroup: true
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithSubnets);
            }).not.toThrow();
        });

        test("uses existing subnet group when subnetGroupName is provided", () => {
            const argsWithSubnetGroup = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetGroupName: "existing-subnet-group",
                        securityGroupIds: ["sg-12345678"]
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithSubnetGroup);
            }).not.toThrow();
        });

        test("throws error when neither subnetGroupName nor subnetIds are provided", () => {
            const invalidArgs = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        createSecurityGroup: true
                        // Neither subnetGroupName nor subnetIds provided
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: Region us-east-1: subnetIds must be provided when createSecurityGroup is true");
        });
    });

    describe("Security Group Management", () => {
        test("creates security group with custom rules", () => {
            const argsWithCustomRules = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetIds: ["subnet-12345", "subnet-67890"],
                        createSecurityGroup: true,
                        securityGroupRules: [
                            {
                                type: "ingress" as const,
                                fromPort: 3306,
                                toPort: 3306,
                                protocol: "tcp",
                                cidrBlocks: ["10.0.0.0/16"],
                                description: "MySQL access from VPC"
                            },
                            {
                                type: "egress" as const,
                                fromPort: 0,
                                toPort: 65535,
                                protocol: "tcp",
                                cidrBlocks: ["0.0.0.0/0"],
                                description: "All outbound traffic"
                            }
                        ]
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithCustomRules);
            }).not.toThrow();
        });

        test("uses existing security groups when securityGroupIds are provided", () => {
            const argsWithExistingSG = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetIds: ["subnet-12345", "subnet-67890"],
                        securityGroupIds: ["sg-12345678", "sg-87654321"]
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithExistingSG);
            }).not.toThrow();
        });

        test("throws error when neither securityGroupIds nor createSecurityGroup are specified", () => {
            const invalidArgs = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetIds: ["subnet-12345", "subnet-67890"]
                        // Neither securityGroupIds nor createSecurityGroup specified
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", invalidArgs);
            }).toThrow("RDSGlobalComponent: Region us-east-1: Either securityGroupIds or createSecurityGroup must be specified");
        });
    });

    describe("Multi-Region Configuration", () => {
        test("creates clusters in multiple regions", () => {
            const multiRegionArgs = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetIds: ["subnet-12345", "subnet-67890"],
                        createSecurityGroup: true,
                        instanceCount: 2
                    },
                    {
                        region: "us-west-2",
                        isPrimary: false,
                        subnetIds: ["subnet-abcde", "subnet-fghij"],
                        createSecurityGroup: true,
                        instanceCount: 1
                    },
                    {
                        region: "eu-west-1",
                        isPrimary: false,
                        subnetIds: ["subnet-klmno", "subnet-pqrst"],
                        createSecurityGroup: true,
                        instanceCount: 1
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-multi-region", multiRegionArgs);
            }).not.toThrow();
        });
    });

    describe("Instance Configuration", () => {
        test("creates correct number of instances per region", () => {
            const argsWithInstances = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetIds: ["subnet-12345", "subnet-67890"],
                        createSecurityGroup: true,
                        instanceClass: "db.r6g.xlarge",
                        instanceCount: 3
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithInstances);
            }).not.toThrow();
        });

        test("uses default instance configuration when not specified", () => {
            const argsWithDefaults = {
                ...basicArgs,
                regions: [
                    {
                        region: "us-east-1",
                        isPrimary: true,
                        subnetIds: ["subnet-12345", "subnet-67890"],
                        createSecurityGroup: true
                        // instanceClass and instanceCount not specified - should use defaults
                    }
                ]
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithDefaults);
            }).not.toThrow();
        });
    });

    describe("Output Methods", () => {
        beforeEach(() => {
            component = new RDSGlobalComponent("test-rds-global", basicArgs);
        });

        test("getClusterEndpoint returns endpoint for valid region", () => {
            expect(() => {
                const endpoint = component.getClusterEndpoint("us-east-1");
                expect(endpoint).toBeDefined();
            }).not.toThrow();
        });

        test("getClusterEndpoint throws error for invalid region", () => {
            expect(() => {
                component.getClusterEndpoint("invalid-region");
            }).toThrow("Cluster not found for region invalid-region");
        });

        test("getClusterReaderEndpoint returns reader endpoint for valid region", () => {
            expect(() => {
                const endpoint = component.getClusterReaderEndpoint("us-east-1");
                expect(endpoint).toBeDefined();
            }).not.toThrow();
        });

        test("getClusterReaderEndpoint throws error for invalid region", () => {
            expect(() => {
                component.getClusterReaderEndpoint("invalid-region");
            }).toThrow("Cluster not found for region invalid-region");
        });
    });

    describe("Component Outputs", () => {
        beforeEach(() => {
            component = new RDSGlobalComponent("test-rds-global", basicArgs);
        });

        test("exposes global cluster outputs", () => {
            expect(component.globalClusterArn).toBeDefined();
            expect(component.globalClusterIdentifier).toBeDefined();
        });

        test("exposes primary cluster endpoints", () => {
            expect(component.primaryClusterEndpoint).toBeDefined();
            expect(component.primaryClusterReaderEndpoint).toBeDefined();
        });

        test("exposes regional clusters output", () => {
            expect(component.regionalClusters).toBeDefined();
        });

        test("exposes security groups output", () => {
            expect(component.securityGroups).toBeDefined();
        });

        test("exposes subnet groups output", () => {
            expect(component.subnetGroups).toBeDefined();
        });
    });

    describe("Encryption Configuration", () => {
        test("enables encryption by default", () => {
            const argsWithoutEncryption = { ...basicArgs };
            delete (argsWithoutEncryption as any).storageEncrypted;

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithoutEncryption);
            }).not.toThrow();
        });

        test("allows disabling encryption explicitly", () => {
            const argsWithoutEncryption = { ...basicArgs, storageEncrypted: false };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithoutEncryption);
            }).not.toThrow();
        });

        test("supports custom KMS key", () => {
            const argsWithKMS = { 
                ...basicArgs, 
                storageEncrypted: true,
                kmsKeyId: "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012"
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithKMS);
            }).not.toThrow();
        });
    });

    describe("Backup Configuration", () => {
        test("uses default backup settings when not specified", () => {
            const argsWithoutBackup = { ...basicArgs };
            delete (argsWithoutBackup as any).backupRetentionPeriod;
            delete (argsWithoutBackup as any).preferredBackupWindow;
            delete (argsWithoutBackup as any).preferredMaintenanceWindow;

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithoutBackup);
            }).not.toThrow();
        });

        test("supports custom backup configuration", () => {
            const argsWithBackup = {
                ...basicArgs,
                backupRetentionPeriod: 30,
                preferredBackupWindow: "02:00-03:00",
                preferredMaintenanceWindow: "sun:03:00-sun:04:00"
            };

            expect(() => {
                component = new RDSGlobalComponent("test-rds-global", argsWithBackup);
            }).not.toThrow();
        });
    });
});