import * as pulumi from "@pulumi/pulumi";
import { VPCComponent, VPCComponentArgs } from "./index";

// Mock Pulumi for testing
pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs): {id: string, state: any} => {
        return {
            id: args.inputs.name + "_id",
            state: args.inputs,
        };
    },
    call: (args: pulumi.runtime.MockCallArgs) => {
        if (args.token === "aws:index/getAvailabilityZones:getAvailabilityZones") {
            return {
                names: ["us-west-2a", "us-west-2b", "us-west-2c"]
            };
        }
        return {};
    },
});

describe("VPCComponent", () => {
    let testArgs: VPCComponentArgs;

    beforeEach(() => {
        testArgs = {
            region: "us-west-2",
            cidrBlock: "10.0.0.0/16",
            internetGatewayEnabled: true,
            natGatewayEnabled: false,
            availabilityZoneCount: 2,
            subnets: {
                public: {
                    type: "public",
                    subnetPrefix: 24,
                    availabilityZones: 2
                },
                private: {
                    type: "private",
                    subnetPrefix: 24,
                    availabilityZones: 2
                }
            },
            tags: {
                Environment: "test"
            }
        };
    });

    test("should create VPC component with valid configuration", async () => {
        const vpc = new VPCComponent("test-vpc", testArgs);
        
        expect(vpc).toBeDefined();
        expect(vpc.vpcId).toBeDefined();
        expect(vpc.vpcArn).toBeDefined();
        expect(vpc.cidrBlock).toBeDefined();
    });

    test("should validate required region parameter", () => {
        const invalidArgs = { ...testArgs, region: "" };
        
        expect(() => {
            new VPCComponent("test-vpc", invalidArgs);
        }).toThrow("region");
    });

    test("should validate availability zone count", () => {
        const invalidArgs = { ...testArgs, availabilityZoneCount: 0 };
        
        expect(() => {
            new VPCComponent("test-vpc", invalidArgs);
        }).toThrow("availabilityZoneCount must be between 1 and 6");
    });

    test("should require either IPAM, CIDR block, or base subnet", () => {
        const invalidArgs = { ...testArgs };
        delete invalidArgs.cidrBlock;

        expect(() => {
            new VPCComponent("test-vpc", invalidArgs);
        }).toThrow("Either ipamPoolId, cidrBlock, or baseSubnet must be provided");
    });

    test("should validate subnet specifications", () => {
        const invalidArgs = { ...testArgs, subnets: {} };
        
        expect(() => {
            new VPCComponent("test-vpc", invalidArgs);
        }).toThrow("At least one subnet specification must be provided");
    });

    test("should validate subnet types", () => {
        const invalidArgs = {
            ...testArgs,
            subnets: {
                invalid: {
                    type: "invalid" as any,
                    subnetPrefix: 24,
                    availabilityZones: 1
                }
            }
        };

        expect(() => {
            new VPCComponent("test-vpc", invalidArgs);
        }).toThrow("Invalid subnet type");
    });

    test("should create Internet Gateway when enabled", async () => {
        const vpc = new VPCComponent("test-vpc", testArgs);
        
        expect(vpc.internetGatewayId).toBeDefined();
    });

    test("should not create Internet Gateway when disabled", async () => {
        const argsWithoutIGW = { ...testArgs, internetGatewayEnabled: false };
        const vpc = new VPCComponent("test-vpc", argsWithoutIGW);
        
        expect(vpc.internetGatewayId).toBeUndefined();
    });

    test("should provide subnet access methods", async () => {
        const vpc = new VPCComponent("test-vpc", testArgs);
        
        expect(typeof vpc.getSubnetIdsByType).toBe("function");
        expect(typeof vpc.getSubnetId).toBe("function");
        expect(typeof vpc.getSubnetIdsByName).toBe("function");
    });

    test("should handle IPAM configuration", async () => {
        const ipamArgs = {
            ...testArgs,
            ipamPoolId: pulumi.output("ipam-pool-12345"),
        };
        delete ipamArgs.cidrBlock;

        const vpc = new VPCComponent("test-vpc", ipamArgs);
        expect(vpc).toBeDefined();
    });

    test("should handle base subnet configuration", async () => {
        const baseSubnetArgs = {
            ...testArgs,
            baseSubnet: "10.1.0.0/16",
        };
        delete baseSubnetArgs.cidrBlock;

        const vpc = new VPCComponent("test-vpc", baseSubnetArgs);
        expect(vpc).toBeDefined();
    });

    test("should create NAT Gateways with zonal strategy", async () => {
        const natArgs = {
            ...testArgs,
            natGatewayEnabled: true,
            natGatewayStrategy: "zonal" as const,
        };

        const vpc = new VPCComponent("test-vpc", natArgs);
        expect(vpc.natGatewayIds).toBeDefined();
    });

    test("should create NAT Gateway with regional strategy", async () => {
        const natArgs = {
            ...testArgs,
            natGatewayEnabled: true,
            natGatewayStrategy: "regional" as const,
        };

        const vpc = new VPCComponent("test-vpc", natArgs);
        expect(vpc.natGatewayIds).toBeDefined();
    });

    test("should default to zonal strategy when not specified", async () => {
        const natArgs = {
            ...testArgs,
            natGatewayEnabled: true,
            // natGatewayStrategy not specified
        };

        const vpc = new VPCComponent("test-vpc", natArgs);
        expect(vpc.natGatewayIds).toBeDefined();
    });
});