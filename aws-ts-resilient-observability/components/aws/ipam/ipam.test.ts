import * as pulumi from "@pulumi/pulumi";
import { IPAMComponent, IPAMComponentArgs } from "./index";

// Mock Pulumi runtime
pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs): pulumi.runtime.MockResourceResult => {
        const outputs: { [key: string]: any } = { ...args.inputs };
        
        // Mock specific resource outputs
        switch (args.type) {
            case "aws:ec2/vpcIpam:VpcIpam":
                outputs.id = `ipam-${args.name}`;
                outputs.arn = `arn:aws:ec2::123456789012:ipam/ipam-${args.name}`;
                outputs.scopeCount = 1;
                break;
            case "aws:ec2/vpcIpamScope:VpcIpamScope":
                outputs.id = `ipam-scope-${args.name}`;
                outputs.arn = `arn:aws:ec2::123456789012:ipam-scope/ipam-scope-${args.name}`;
                outputs.ipamId = args.inputs.ipamId;
                break;
            case "aws:ec2/vpcIpamPool:VpcIpamPool":
                outputs.id = `ipam-pool-${args.name}`;
                outputs.arn = `arn:aws:ec2::123456789012:ipam-pool/ipam-pool-${args.name}`;
                outputs.ipamScopeId = args.inputs.ipamScopeId;
                break;
            case "aws:ec2/vpcIpamPoolCidr:VpcIpamPoolCidr":
                outputs.id = `ipam-pool-cidr-${args.name}`;
                outputs.ipamPoolId = args.inputs.ipamPoolId;
                outputs.cidr = args.inputs.cidr;
                break;
            case "aws:ram/resourceShare:ResourceShare":
                outputs.id = `resource-share-${args.name}`;
                outputs.arn = `arn:aws:ram:us-east-1:123456789012:resource-share/${args.name}`;
                break;
            case "aws:ram/resourceAssociation:ResourceAssociation":
                outputs.id = `resource-association-${args.name}`;
                break;
            case "aws:ram/principalAssociation:PrincipalAssociation":
                outputs.id = `principal-association-${args.name}`;
                break;
            case "pulumi:providers:aws":
                outputs.region = args.inputs.region || "us-east-1";
                break;
        }
        
        return {
            id: `${args.name}-id`,
            state: outputs
        };
    },
    call: (args: pulumi.runtime.MockCallArgs): pulumi.runtime.MockCallResult => {
        switch (args.token) {
            case "aws:index/getCallerIdentity:getCallerIdentity":
                return {
                    outputs: {
                        accountId: "123456789012",
                        arn: "arn:aws:iam::123456789012:root",
                        userId: "123456789012"
                    }
                };
            case "aws:organizations/getOrganization:getOrganization":
                return {
                    outputs: {
                        id: "o-example123456",
                        arn: "arn:aws:organizations::123456789012:organization/o-example123456",
                        masterAccountArn: "arn:aws:organizations::123456789012:account/o-example123456/123456789012",
                        masterAccountEmail: "test@example.com",
                        masterAccountId: "123456789012"
                    }
                };
            default:
                return { outputs: {} };
        }
    }
});

describe("IPAMComponent", () => {
    let component: IPAMComponent;
    
    const basicArgs: IPAMComponentArgs = {
        cidrBlocks: ["10.0.0.0/16", "10.1.0.0/16"],
        shareWithOrganization: false,
        operatingRegions: ["us-east-1", "us-west-2"],
        tags: {
            Environment: "test"
        }
    };

    afterEach(() => {
        // Clean up any resources
        component = undefined as any;
    });

    describe("Constructor validation", () => {
        test("should throw error when cidrBlocks array is empty", () => {
            const invalidArgs = {
                ...basicArgs,
                cidrBlocks: []
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: At least one CIDR block must be specified");
        });

        test("should throw error when cidrBlocks is undefined", () => {
            const invalidArgs = {
                ...basicArgs,
                cidrBlocks: undefined as any
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: cidrBlocks is required");
        });

        test("should throw error when operatingRegions array is empty", () => {
            const invalidArgs = {
                ...basicArgs,
                operatingRegions: []
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: At least one operating region must be specified");
        });

        test("should throw error when operatingRegions is undefined", () => {
            const invalidArgs = {
                ...basicArgs,
                operatingRegions: undefined as any
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: operatingRegions is required");
        });

        test("should throw error when region format is invalid", () => {
            const invalidArgs = {
                ...basicArgs,
                operatingRegions: ["invalid-region", "us-east-1"]
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: Invalid region format: invalid-region");
        });
    });

    describe("CIDR block validation", () => {
        test("should throw error for invalid CIDR format", () => {
            const invalidArgs = {
                ...basicArgs,
                cidrBlocks: ["10.0.0.0", "invalid-cidr"]
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: Invalid CIDR block format: 10.0.0.0");
        });

        test("should throw error for invalid CIDR prefix", () => {
            const invalidArgs = {
                ...basicArgs,
                cidrBlocks: ["10.0.0.0/7", "10.1.0.0/16"]
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: CIDR prefix must be between 8 and 28: 10.0.0.0/7");
        });

        test("should throw error for invalid CIDR prefix too large", () => {
            const invalidArgs = {
                ...basicArgs,
                cidrBlocks: ["10.0.0.0/29", "10.1.0.0/16"]
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: CIDR prefix must be between 8 and 28: 10.0.0.0/29");
        });

        test("should throw error for invalid IP address", () => {
            const invalidArgs = {
                ...basicArgs,
                cidrBlocks: ["256.0.0.0/16", "10.1.0.0/16"]
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: Invalid IP address in CIDR block: 256.0.0.0/16");
        });

        test("should throw error for duplicate CIDR blocks", () => {
            const invalidArgs = {
                ...basicArgs,
                cidrBlocks: ["10.0.0.0/16", "10.0.0.0/16"]
            };

            expect(() => {
                new IPAMComponent("test-ipam", invalidArgs);
            }).toThrow("IPAMComponent: Duplicate CIDR blocks found: 10.0.0.0/16");
        });

        test("should accept valid CIDR blocks", () => {
            const validArgs = {
                ...basicArgs,
                cidrBlocks: ["10.0.0.0/16", "172.16.0.0/12", "192.168.0.0/24"]
            };

            expect(() => {
                component = new IPAMComponent("test-ipam", validArgs);
            }).not.toThrow();
        });
    });

    describe("Basic IPAM creation", () => {
        test("should create IPAM component with basic configuration", () => {
            component = new IPAMComponent("test-ipam", basicArgs);

            expect(component).toBeDefined();
            expect(component.ipamId).toBeDefined();
            expect(component.ipamArn).toBeDefined();
            expect(component.poolIds).toBeDefined();
            expect(component.poolArns).toBeDefined();
            expect(component.scopeId).toBeDefined();
        });

        test("should create IPAM component with single region", () => {
            const singleRegionArgs: IPAMComponentArgs = {
                ...basicArgs,
                operatingRegions: ["us-east-1"]
            };

            component = new IPAMComponent("test-ipam", singleRegionArgs);

            expect(component).toBeDefined();
            expect(component.getAvailableRegions()).toEqual(["us-east-1"]);
        });

        test("should create IPAM component with multiple regions", () => {
            const multiRegionArgs: IPAMComponentArgs = {
                ...basicArgs,
                operatingRegions: ["us-east-1", "us-west-2", "eu-west-1"]
            };

            component = new IPAMComponent("test-ipam", multiRegionArgs);

            expect(component).toBeDefined();
            expect(component.getAvailableRegions()).toEqual(["us-east-1", "us-west-2", "eu-west-1"]);
        });

        test("should apply custom tags to IPAM resources", () => {
            const customTags = {
                Environment: "production",
                Team: "platform",
                Project: "infrastructure"
            };

            const taggedArgs: IPAMComponentArgs = {
                ...basicArgs,
                tags: customTags
            };

            component = new IPAMComponent("test-ipam", taggedArgs);
            expect(component).toBeDefined();
        });
    });

    describe("Organization sharing", () => {
        test("should create organization sharing resources when enabled", () => {
            const orgSharingArgs: IPAMComponentArgs = {
                ...basicArgs,
                shareWithOrganization: true
            };

            component = new IPAMComponent("test-ipam", orgSharingArgs);
            expect(component).toBeDefined();
        });

        test("should not create organization sharing resources when disabled", () => {
            const noSharingArgs: IPAMComponentArgs = {
                ...basicArgs,
                shareWithOrganization: false
            };

            component = new IPAMComponent("test-ipam", noSharingArgs);
            expect(component).toBeDefined();
        });
    });

    describe("Multi-region pool configuration", () => {
        beforeEach(() => {
            const multiRegionArgs: IPAMComponentArgs = {
                ...basicArgs,
                operatingRegions: ["us-east-1", "us-west-2", "eu-west-1"]
            };
            component = new IPAMComponent("test-ipam", multiRegionArgs);
        });

        test("should create pools for all specified regions", () => {
            expect(component.getAvailableRegions()).toContain("us-east-1");
            expect(component.getAvailableRegions()).toContain("us-west-2");
            expect(component.getAvailableRegions()).toContain("eu-west-1");
        });

        test("should support checking if region is available", () => {
            expect(component.supportsRegion("us-east-1")).toBe(true);
            expect(component.supportsRegion("us-west-2")).toBe(true);
            expect(component.supportsRegion("eu-west-1")).toBe(true);
            expect(component.supportsRegion("ap-south-1")).toBe(false);
        });
    });

    describe("Helper methods", () => {
        beforeEach(() => {
            const multiRegionArgs: IPAMComponentArgs = {
                ...basicArgs,
                operatingRegions: ["us-east-1", "us-west-2"]
            };
            component = new IPAMComponent("test-ipam", multiRegionArgs);
        });

        test("should get pool ID by region", () => {
            const poolId = component.getPoolId("us-east-1");
            expect(poolId).toBeDefined();
        });

        test("should get pool ARN by region", () => {
            const poolArn = component.getPoolArn("us-east-1");
            expect(poolArn).toBeDefined();
        });

        test("should throw error for non-existent region pool ID", () => {
            expect(() => {
                component.getPoolId("ap-south-1");
            }).toThrow("IPAMComponent: No pool found for region ap-south-1");
        });

        test("should throw error for non-existent region pool ARN", () => {
            expect(() => {
                component.getPoolArn("ap-south-1");
            }).toThrow("IPAMComponent: No pool found for region ap-south-1");
        });

        test("should return correct available regions", () => {
            const regions = component.getAvailableRegions();
            expect(regions).toEqual(["us-east-1", "us-west-2"]);
        });
    });

    describe("CIDR block allocation scenarios", () => {
        test("should handle single CIDR block", () => {
            const singleCidrArgs: IPAMComponentArgs = {
                ...basicArgs,
                cidrBlocks: ["10.0.0.0/8"]
            };

            component = new IPAMComponent("test-ipam", singleCidrArgs);
            expect(component).toBeDefined();
        });

        test("should handle multiple non-overlapping CIDR blocks", () => {
            const multipleCidrArgs: IPAMComponentArgs = {
                ...basicArgs,
                cidrBlocks: ["10.0.0.0/16", "172.16.0.0/16", "192.168.0.0/16"]
            };

            component = new IPAMComponent("test-ipam", multipleCidrArgs);
            expect(component).toBeDefined();
        });

        test("should handle various CIDR prefix sizes", () => {
            const variousPrefixArgs: IPAMComponentArgs = {
                ...basicArgs,
                cidrBlocks: ["10.0.0.0/8", "172.16.0.0/12", "192.168.1.0/24", "203.0.113.0/28"]
            };

            component = new IPAMComponent("test-ipam", variousPrefixArgs);
            expect(component).toBeDefined();
        });
    });

    describe("Integration scenarios", () => {
        test("should create complete IPAM setup with organization sharing", () => {
            const completeArgs: IPAMComponentArgs = {
                cidrBlocks: [
                    "10.0.0.0/8",
                    "172.16.0.0/12",
                    "192.168.0.0/16"
                ],
                shareWithOrganization: true,
                operatingRegions: ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"],
                tags: {
                    Environment: "production",
                    Team: "platform",
                    Project: "global-infrastructure",
                    ManagedBy: "pulumi"
                }
            };

            component = new IPAMComponent("complete-ipam", completeArgs);

            expect(component).toBeDefined();
            expect(component.ipamId).toBeDefined();
            expect(component.ipamArn).toBeDefined();
            expect(component.poolIds).toBeDefined();
            expect(component.poolArns).toBeDefined();
            expect(component.scopeId).toBeDefined();
            expect(component.getAvailableRegions()).toEqual([
                "us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"
            ]);
        });

        test("should create minimal IPAM setup without organization sharing", () => {
            const minimalArgs: IPAMComponentArgs = {
                cidrBlocks: ["10.0.0.0/16"],
                shareWithOrganization: false,
                operatingRegions: ["us-east-1"]
            };

            component = new IPAMComponent("minimal-ipam", minimalArgs);

            expect(component).toBeDefined();
            expect(component.getAvailableRegions()).toEqual(["us-east-1"]);
            expect(component.supportsRegion("us-east-1")).toBe(true);
            expect(component.supportsRegion("us-west-2")).toBe(false);
        });
    });
});