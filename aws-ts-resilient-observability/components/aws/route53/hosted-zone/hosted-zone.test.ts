import * as pulumi from "@pulumi/pulumi";
import { Route53HostedZoneComponent, Route53HostedZoneArgs } from "./index";

// Mock Pulumi runtime
pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs): { id: string; state: any } => {
        return {
            id: `${args.name}-id`,
            state: {
                ...args.inputs,
                zoneId: "Z1234567890ABC",
                nameServers: ["ns-1.awsdns-01.com", "ns-2.awsdns-02.net"]
            }
        };
    },
    call: (args: pulumi.runtime.MockCallArgs) => {
        return args.inputs;
    }
});

describe("Route53HostedZoneComponent", () => {
    describe("Constructor", () => {
        it("should create public hosted zone", async () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "example.com",
                        comment: "Test public zone"
                    }
                ]
            };

            const component = new Route53HostedZoneComponent("test-hz", args);
            expect(component).toBeDefined();

            const zoneNames = component.getHostedZoneNames();
            expect(zoneNames).toContain("example.com");
        });

        it("should create private hosted zone with VPC", async () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "internal.example.com",
                        private: true,
                        vpcIds: ["vpc-12345678"],
                        comment: "Test private zone"
                    }
                ]
            };

            const component = new Route53HostedZoneComponent("test-hz-private", args);
            expect(component).toBeDefined();
        });

        it("should create multiple hosted zones", async () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "example.com"
                    },
                    {
                        name: "example.org"
                    }
                ]
            };

            const component = new Route53HostedZoneComponent("test-hz-multi", args);
            const zoneNames = component.getHostedZoneNames();
            expect(zoneNames).toHaveLength(2);
        });

        it("should throw error for empty hosted zones array", () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: []
            };

            expect(() => new Route53HostedZoneComponent("test-hz-empty", args)).toThrow();
        });

        it("should throw error for private zone without VPC", () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "internal.example.com",
                        private: true
                    }
                ]
            };

            expect(() => new Route53HostedZoneComponent("test-hz-no-vpc", args)).toThrow();
        });

        it("should throw error for invalid domain name", () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "invalid domain!"
                    }
                ]
            };

            expect(() => new Route53HostedZoneComponent("test-hz-invalid", args)).toThrow();
        });

        it("should throw error for invalid VPC ID format", () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "internal.example.com",
                        private: true,
                        vpcIds: ["invalid-vpc-id"]
                    }
                ]
            };

            expect(() => new Route53HostedZoneComponent("test-hz-invalid-vpc", args)).toThrow();
        });
    });

    describe("Methods", () => {
        it("should get hosted zone ID", async () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "example.com"
                    }
                ]
            };

            const component = new Route53HostedZoneComponent("test-hz-methods", args);
            const zoneId = component.getHostedZoneId("example.com");
            expect(zoneId).toBeDefined();
        });

        it("should get name servers", async () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "example.com"
                    }
                ]
            };

            const component = new Route53HostedZoneComponent("test-hz-ns", args);
            const nameServers = component.getNameServers("example.com");
            expect(nameServers).toBeDefined();
        });

        it("should throw error for non-existent zone", () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "example.com"
                    }
                ]
            };

            const component = new Route53HostedZoneComponent("test-hz-notfound", args);
            expect(() => component.getHostedZoneId("notfound.com")).toThrow();
        });

        it("should get hosted zone resource", () => {
            const args: Route53HostedZoneArgs = {
                hostedZones: [
                    {
                        name: "example.com"
                    }
                ]
            };

            const component = new Route53HostedZoneComponent("test-hz-resource", args);
            const zone = component.getHostedZone("example.com");
            expect(zone).toBeDefined();
        });
    });
});
