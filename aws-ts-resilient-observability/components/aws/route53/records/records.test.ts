import * as pulumi from "@pulumi/pulumi";
import { Route53RecordsComponent, Route53RecordsArgs } from "./index";

// Mock Pulumi runtime
pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs): { id: string; state: any } => {
        return {
            id: `${args.name}-id`,
            state: {
                ...args.inputs,
                fqdn: `${args.inputs.name}.example.com`
            }
        };
    },
    call: (args: pulumi.runtime.MockCallArgs) => {
        return args.inputs;
    }
});

describe("Route53RecordsComponent", () => {
    const mockZoneId = "Z1234567890ABC";

    describe("Constructor", () => {
        it("should create A record", async () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "www.example.com",
                        type: "A",
                        values: ["192.0.2.1"],
                        ttl: 300
                    }
                ]
            };

            const component = new Route53RecordsComponent("test-records", args);
            expect(component).toBeDefined();
        });

        it("should create CNAME record", async () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "blog.example.com",
                        type: "CNAME",
                        values: ["example.com"],
                        ttl: 300
                    }
                ]
            };

            const component = new Route53RecordsComponent("test-records-cname", args);
            expect(component).toBeDefined();
        });

        it("should create MX record", async () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "example.com",
                        type: "MX",
                        values: ["10 mail.example.com", "20 mail2.example.com"],
                        ttl: 300
                    }
                ]
            };

            const component = new Route53RecordsComponent("test-records-mx", args);
            expect(component).toBeDefined();
        });

        it("should create TXT record", async () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "example.com",
                        type: "TXT",
                        values: ["v=spf1 include:_spf.example.com ~all"],
                        ttl: 300
                    }
                ]
            };

            const component = new Route53RecordsComponent("test-records-txt", args);
            expect(component).toBeDefined();
        });

        it("should create alias record", async () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "example.com",
                        type: "A",
                        aliasTarget: {
                            name: "d123456789.cloudfront.net",
                            zoneId: "Z2FDTNDATAQYW2",
                            evaluateTargetHealth: false
                        }
                    }
                ]
            };

            const component = new Route53RecordsComponent("test-records-alias", args);
            expect(component).toBeDefined();
        });

        it("should create weighted routing record", async () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "www.example.com",
                        type: "A",
                        values: ["192.0.2.1"],
                        ttl: 300,
                        setIdentifier: "weight-1",
                        weightedRoutingPolicy: {
                            weight: 70
                        }
                    }
                ]
            };

            const component = new Route53RecordsComponent("test-records-weighted", args);
            expect(component).toBeDefined();
        });

        it("should create failover routing record", async () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "www.example.com",
                        type: "A",
                        values: ["192.0.2.1"],
                        ttl: 300,
                        setIdentifier: "primary",
                        failoverRoutingPolicy: {
                            type: "PRIMARY"
                        }
                    }
                ]
            };

            const component = new Route53RecordsComponent("test-records-failover", args);
            expect(component).toBeDefined();
        });

        it("should create latency routing record", async () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "www.example.com",
                        type: "A",
                        values: ["192.0.2.1"],
                        ttl: 300,
                        setIdentifier: "us-east-1",
                        latencyRoutingPolicy: {
                            region: "us-east-1"
                        }
                    }
                ]
            };

            const component = new Route53RecordsComponent("test-records-latency", args);
            expect(component).toBeDefined();
        });

        it("should throw error for empty records array", () => {
            const args: Route53RecordsArgs = {
                records: []
            };

            expect(() => new Route53RecordsComponent("test-records-empty", args)).toThrow();
        });

        it("should throw error for CNAME with multiple values", () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "blog.example.com",
                        type: "CNAME",
                        values: ["example.com", "example.org"]
                    }
                ]
            };

            expect(() => new Route53RecordsComponent("test-records-cname-multi", args)).toThrow();
        });

        it("should throw error for record with both values and alias", () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "example.com",
                        type: "A",
                        values: ["192.0.2.1"],
                        aliasTarget: {
                            name: "d123456789.cloudfront.net",
                            zoneId: "Z2FDTNDATAQYW2"
                        }
                    }
                ]
            };

            expect(() => new Route53RecordsComponent("test-records-both", args)).toThrow();
        });

        it("should throw error for invalid MX format", () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "example.com",
                        type: "MX",
                        values: ["mail.example.com"]
                    }
                ]
            };

            expect(() => new Route53RecordsComponent("test-records-mx-invalid", args)).toThrow();
        });

        it("should throw error for routing policy without setIdentifier", () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "www.example.com",
                        type: "A",
                        values: ["192.0.2.1"],
                        weightedRoutingPolicy: {
                            weight: 70
                        }
                    }
                ]
            };

            expect(() => new Route53RecordsComponent("test-records-no-id", args)).toThrow();
        });
    });

    describe("Methods", () => {
        it("should get all record names", () => {
            const args: Route53RecordsArgs = {
                records: [
                    {
                        zoneId: mockZoneId,
                        name: "www.example.com",
                        type: "A",
                        values: ["192.0.2.1"]
                    },
                    {
                        zoneId: mockZoneId,
                        name: "blog.example.com",
                        type: "A",
                        values: ["192.0.2.2"]
                    }
                ]
            };

            const component = new Route53RecordsComponent("test-records-methods", args);
            const names = component.getAllRecordNames();
            expect(names.length).toBeGreaterThan(0);
        });
    });
});
