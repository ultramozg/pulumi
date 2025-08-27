import * as pulumi from "@pulumi/pulumi";
import { Route53Component, Route53ComponentArgs, HostedZoneSpec, DNSRecordSpec } from "./index";

// Mock Pulumi runtime
pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs): pulumi.runtime.MockResourceResult => {
        const outputs: { [key: string]: any } = { ...args.inputs };
        
        switch (args.type) {
            case "aws:route53/zone:Zone":
                outputs.zoneId = `Z${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
                outputs.nameServers = [
                    "ns-1.awsdns-01.com",
                    "ns-2.awsdns-02.net",
                    "ns-3.awsdns-03.org",
                    "ns-4.awsdns-04.co.uk"
                ];
                break;
            case "aws:route53/record:Record":
                outputs.fqdn = `${args.inputs.name}.example.com`;
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
                        arn: "arn:aws:iam::123456789012:user/test",
                        userId: "AIDACKCEVSQ6C2EXAMPLE"
                    }
                };
            case "aws:index/getRegion:getRegion":
                return {
                    outputs: {
                        name: "us-east-1"
                    }
                };
            default:
                return { outputs: {} };
        }
    }
});

describe("Route53Component", () => {
    let component: Route53Component;

    afterEach(() => {
        // Clean up any resources
        component = undefined as any;
    });

    describe("Constructor and Basic Functionality", () => {
        test("creates component with single public hosted zone", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com",
                    comment: "Test domain"
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                region: "us-east-1",
                tags: { Environment: "test" }
            };

            component = new Route53Component("test-route53", args);

            expect(component).toBeDefined();
            expect(component.hostedZoneIds).toBeDefined();
            expect(component.nameServers).toBeDefined();
            expect(component.recordFqdns).toBeDefined();
        });

        test("creates component with private hosted zone", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "internal.example.com",
                    private: true,
                    vpcIds: ["vpc-12345678"],
                    comment: "Internal domain"
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                region: "us-east-1"
            };

            component = new Route53Component("test-private-route53", args);

            expect(component).toBeDefined();
        });

        test("creates component with multiple hosted zones", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com",
                    comment: "Primary domain"
                },
                {
                    name: "api.example.com",
                    comment: "API subdomain"
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                region: "us-east-1"
            };

            component = new Route53Component("test-multi-route53", args);

            expect(component).toBeDefined();
        });
    });

    describe("DNS Records", () => {
        test("creates component with A records", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "example.com",
                    name: "www",
                    type: "A",
                    values: ["192.0.2.1"],
                    ttl: 300
                },
                {
                    zoneName: "example.com",
                    name: "api",
                    type: "A",
                    values: ["192.0.2.2", "192.0.2.3"],
                    ttl: 600
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            component = new Route53Component("test-records-route53", args);

            expect(component).toBeDefined();
        });

        test("creates component with CNAME record", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "example.com",
                    name: "blog",
                    type: "CNAME",
                    values: ["www.example.com"],
                    ttl: 300
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            component = new Route53Component("test-cname-route53", args);

            expect(component).toBeDefined();
        });

        test("creates component with MX record", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "example.com",
                    name: "",
                    type: "MX",
                    values: ["10 mail.example.com", "20 mail2.example.com"],
                    ttl: 3600
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            component = new Route53Component("test-mx-route53", args);

            expect(component).toBeDefined();
        });

        test("creates component with alias record", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "example.com",
                    name: "cdn",
                    type: "A",
                    values: [],
                    aliasTarget: {
                        name: "d123456789.cloudfront.net",
                        zoneId: "Z2FDTNDATAQYW2",
                        evaluateTargetHealth: false
                    }
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            component = new Route53Component("test-alias-route53", args);

            expect(component).toBeDefined();
        });
    });

    describe("Validation", () => {
        test("throws error when no hosted zones provided", () => {
            const args: Route53ComponentArgs = {
                hostedZones: [],
                region: "us-east-1"
            };

            expect(() => {
                new Route53Component("test-empty-route53", args);
            }).toThrow("Route53Component: At least one hosted zone must be specified");
        });

        test("throws error when private zone has no VPC IDs", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "internal.example.com",
                    private: true
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                region: "us-east-1"
            };

            expect(() => {
                new Route53Component("test-invalid-private-route53", args);
            }).toThrow("Route53Component: Private hosted zone internal.example.com requires at least one VPC ID");
        });

        test("throws error for invalid record type", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "example.com",
                    name: "test",
                    type: "INVALID",
                    values: ["192.0.2.1"]
                } as any
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            expect(() => {
                new Route53Component("test-invalid-record-route53", args);
            }).toThrow("Route53Component: Invalid record type INVALID");
        });

        test("throws error for CNAME with multiple values", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "example.com",
                    name: "test",
                    type: "CNAME",
                    values: ["target1.example.com", "target2.example.com"]
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            expect(() => {
                new Route53Component("test-invalid-cname-route53", args);
            }).toThrow("Route53Component: CNAME record test can only have one value");
        });

        test("throws error for invalid MX record format", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "example.com",
                    name: "",
                    type: "MX",
                    values: ["invalid-mx-format"]
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            expect(() => {
                new Route53Component("test-invalid-mx-route53", args);
            }).toThrow('Route53Component: MX record  value "invalid-mx-format" must be in format "priority hostname"');
        });

        test("throws error for record with both values and alias target", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "example.com",
                    name: "test",
                    type: "A",
                    values: ["192.0.2.1"],
                    aliasTarget: {
                        name: "target.example.com",
                        zoneId: "Z123456789"
                    }
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            expect(() => {
                new Route53Component("test-invalid-alias-route53", args);
            }).toThrow("Route53Component: Record test cannot have both values and aliasTarget");
        });

        test("throws error for record with no values or alias target", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "example.com",
                    name: "test",
                    type: "A",
                    values: []
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            expect(() => {
                new Route53Component("test-empty-values-route53", args);
            }).toThrow("Route53Component: Record test must have either values or aliasTarget");
        });

        test("throws error for record referencing non-existent zone", () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                }
            ];

            const records: DNSRecordSpec[] = [
                {
                    zoneName: "nonexistent.com",
                    name: "test",
                    type: "A",
                    values: ["192.0.2.1"]
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                records,
                region: "us-east-1"
            };

            expect(() => {
                new Route53Component("test-missing-zone-route53", args);
            }).toThrow("Route53Component: Hosted zone nonexistent.com not found for record test");
        });
    });

    describe("Helper Methods", () => {
        beforeEach(() => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com"
                },
                {
                    name: "test.com"
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                region: "us-east-1"
            };

            component = new Route53Component("test-helpers-route53", args);
        });

        test("getHostedZoneId returns zone ID output", () => {
            const zoneId = component.getHostedZoneId("example.com");
            expect(zoneId).toBeDefined();
        });

        test("getHostedZoneId throws error for non-existent zone", () => {
            expect(() => {
                component.getHostedZoneId("nonexistent.com");
            }).toThrow("Hosted zone nonexistent.com not found in Route53 component");
        });

        test("getNameServers returns name servers output", () => {
            const nameServers = component.getNameServers("example.com");
            expect(nameServers).toBeDefined();
        });

        test("getNameServers throws error for non-existent zone", () => {
            expect(() => {
                component.getNameServers("nonexistent.com");
            }).toThrow("Hosted zone nonexistent.com not found in Route53 component");
        });

        test("createRecord creates new DNS record", () => {
            const record = component.createRecord("new-record", {
                zoneName: "example.com",
                name: "new",
                type: "A",
                values: ["192.0.2.100"],
                ttl: 300
            });

            expect(record).toBeDefined();
        });

        test("createRecord throws error for non-existent zone", () => {
            expect(() => {
                component.createRecord("invalid-record", {
                    zoneName: "nonexistent.com",
                    name: "test",
                    type: "A",
                    values: ["192.0.2.1"]
                });
            }).toThrow("Hosted zone nonexistent.com not found in Route53 component");
        });
    });

    describe("Tag Management", () => {
        test("applies default and custom tags to hosted zones", async () => {
            const hostedZones: HostedZoneSpec[] = [
                {
                    name: "example.com",
                    comment: "Test domain"
                }
            ];

            const args: Route53ComponentArgs = {
                hostedZones,
                region: "us-east-1",
                tags: {
                    Environment: "test",
                    Project: "route53-test"
                }
            };

            component = new Route53Component("test-tags-route53", args);

            // Tags are applied during resource creation
            // In a real scenario, we would verify the tags through AWS API calls
            expect(component).toBeDefined();
        });
    });
});