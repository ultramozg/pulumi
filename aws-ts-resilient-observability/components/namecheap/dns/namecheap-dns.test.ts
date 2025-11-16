import * as pulumi from "@pulumi/pulumi";
import { NamecheapDNSComponent, NamecheapDNSComponentArgs } from "./index";

// Mock Pulumi runtime
pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs): { id: string; state: any } => {
        return {
            id: `${args.name}-id`,
            state: args.inputs
        };
    },
    call: (args: pulumi.runtime.MockCallArgs) => {
        return args.inputs;
    }
});

describe("NamecheapDNSComponent", () => {
    describe("Constructor", () => {
        it("should create component with valid configuration", async () => {
            const args: NamecheapDNSComponentArgs = {
                domain: "example.com",
                records: [
                    {
                        hostname: "@",
                        type: "A",
                        address: "192.0.2.1",
                        ttl: 1800
                    },
                    {
                        hostname: "www",
                        type: "CNAME",
                        address: "example.com",
                        ttl: 3600
                    }
                ]
            };

            const component = new NamecheapDNSComponent("test-namecheap", args);

            expect(component).toBeDefined();
            
            // Test output using apply
            const domainPromise = new Promise<string>((resolve) => {
                component.getDomain().apply(d => {
                    resolve(d);
                    return d;
                });
            });
            
            const domain = await domainPromise;
            expect(domain).toBe("example.com");
        });

        it("should create MX record with mxPref", async () => {
            const args: NamecheapDNSComponentArgs = {
                domain: "example.com",
                records: [
                    {
                        hostname: "@",
                        type: "MX",
                        address: "mail.example.com",
                        mxPref: 10,
                        ttl: 1800
                    }
                ]
            };

            const component = new NamecheapDNSComponent("test-namecheap-mx", args);
            expect(component).toBeDefined();
        });

        it("should throw error for missing domain", () => {
            const args: any = {
                records: [
                    {
                        hostname: "@",
                        type: "A",
                        address: "192.0.2.1"
                    }
                ]
            };

            expect(() => new NamecheapDNSComponent("test-namecheap-invalid", args)).toThrow();
        });

        it("should throw error for empty records array", () => {
            const args: NamecheapDNSComponentArgs = {
                domain: "example.com",
                records: []
            };

            expect(() => new NamecheapDNSComponent("test-namecheap-empty", args)).toThrow();
        });

        it("should throw error for invalid record type", () => {
            const args: any = {
                domain: "example.com",
                records: [
                    {
                        hostname: "@",
                        type: "INVALID",
                        address: "192.0.2.1"
                    }
                ]
            };

            expect(() => new NamecheapDNSComponent("test-namecheap-invalid-type", args)).toThrow();
        });
    });

    describe("Record Validation", () => {
        it("should accept wildcard hostname", async () => {
            const args: NamecheapDNSComponentArgs = {
                domain: "example.com",
                records: [
                    {
                        hostname: "*",
                        type: "A",
                        address: "192.0.2.1"
                    }
                ]
            };

            const component = new NamecheapDNSComponent("test-namecheap-wildcard", args);
            expect(component).toBeDefined();
        });

        it("should accept @ hostname", async () => {
            const args: NamecheapDNSComponentArgs = {
                domain: "example.com",
                records: [
                    {
                        hostname: "@",
                        type: "A",
                        address: "192.0.2.1"
                    }
                ]
            };

            const component = new NamecheapDNSComponent("test-namecheap-root", args);
            expect(component).toBeDefined();
        });

        it("should create TXT record", async () => {
            const args: NamecheapDNSComponentArgs = {
                domain: "example.com",
                records: [
                    {
                        hostname: "@",
                        type: "TXT",
                        address: "v=spf1 include:_spf.example.com ~all"
                    }
                ]
            };

            const component = new NamecheapDNSComponent("test-namecheap-txt", args);
            expect(component).toBeDefined();
        });
    });

    describe("Methods", () => {
        it("should return all records", async () => {
            const args: NamecheapDNSComponentArgs = {
                domain: "example.com",
                records: [
                    {
                        hostname: "@",
                        type: "A",
                        address: "192.0.2.1"
                    },
                    {
                        hostname: "www",
                        type: "A",
                        address: "192.0.2.2"
                    }
                ]
            };

            const component = new NamecheapDNSComponent("test-namecheap-methods", args);
            const records = component.getRecords();
            expect(records).toHaveLength(2);
        });
    });
});
