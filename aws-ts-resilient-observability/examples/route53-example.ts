import * as pulumi from "@pulumi/pulumi";
import { Route53Component, Route53ComponentArgs } from "../components/route53";

/**
 * Example demonstrating Route 53 component usage
 * This example shows how to create hosted zones and DNS records
 */

// Example 1: Simple public hosted zone with basic DNS records
const publicDnsArgs: Route53ComponentArgs = {
    hostedZones: [
        {
            name: "example.com",
            comment: "Primary domain for the application",
            forceDestroy: true // For testing purposes
        }
    ],
    records: [
        {
            zoneName: "example.com",
            name: "www",
            type: "A",
            values: ["192.0.2.1", "192.0.2.2"],
            ttl: 300
        },
        {
            zoneName: "example.com",
            name: "api",
            type: "A",
            values: ["192.0.2.10"],
            ttl: 300
        },
        {
            zoneName: "example.com",
            name: "blog",
            type: "CNAME",
            values: ["www.example.com"],
            ttl: 300
        },
        {
            zoneName: "example.com",
            name: "",
            type: "MX",
            values: ["10 mail.example.com", "20 mail2.example.com"],
            ttl: 3600
        },
        {
            zoneName: "example.com",
            name: "_dmarc",
            type: "TXT",
            values: ["v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"],
            ttl: 3600
        }
    ],
    region: "us-east-1",
    tags: {
        Environment: "production",
        Project: "web-application",
        ManagedBy: "platform-team"
    }
};

const publicDns = new Route53Component("public-dns", publicDnsArgs);

// Example 2: Private hosted zone for internal services
const privateDnsArgs: Route53ComponentArgs = {
    hostedZones: [
        {
            name: "internal.example.com",
            private: true,
            vpcIds: ["vpc-12345678", "vpc-87654321"], // Multiple VPCs
            comment: "Internal services domain",
            forceDestroy: true
        }
    ],
    records: [
        {
            zoneName: "internal.example.com",
            name: "database",
            type: "A",
            values: ["10.0.1.100"],
            ttl: 300
        },
        {
            zoneName: "internal.example.com",
            name: "cache",
            type: "A",
            values: ["10.0.1.200"],
            ttl: 300
        },
        {
            zoneName: "internal.example.com",
            name: "monitoring",
            type: "A",
            values: ["10.0.1.50"],
            ttl: 300
        }
    ],
    region: "us-east-1",
    tags: {
        Environment: "production",
        Type: "internal",
        Project: "infrastructure"
    }
};

const privateDns = new Route53Component("private-dns", privateDnsArgs);

// Example 3: Multiple hosted zones with different configurations
const multiZoneArgs: Route53ComponentArgs = {
    hostedZones: [
        {
            name: "app.example.com",
            comment: "Application subdomain"
        },
        {
            name: "api.example.com",
            comment: "API subdomain"
        },
        {
            name: "cdn.example.com",
            comment: "CDN subdomain"
        }
    ],
    records: [
        // App subdomain records
        {
            zoneName: "app.example.com",
            name: "",
            type: "A",
            values: ["192.0.2.100"],
            ttl: 300
        },
        {
            zoneName: "app.example.com",
            name: "staging",
            type: "A",
            values: ["192.0.2.101"],
            ttl: 300
        },
        // API subdomain records
        {
            zoneName: "api.example.com",
            name: "",
            type: "A",
            values: ["192.0.2.200"],
            ttl: 300
        },
        {
            zoneName: "api.example.com",
            name: "v2",
            type: "A",
            values: ["192.0.2.201"],
            ttl: 300
        },
        // CDN subdomain with alias record
        {
            zoneName: "cdn.example.com",
            name: "",
            type: "A",
            values: [],
            aliasTarget: {
                name: "d123456789.cloudfront.net",
                zoneId: "Z2FDTNDATAQYW2", // CloudFront hosted zone ID
                evaluateTargetHealth: false
            }
        }
    ],
    region: "us-east-1",
    tags: {
        Environment: "production",
        Project: "microservices"
    }
};

const multiZoneDns = new Route53Component("multi-zone-dns", multiZoneArgs);

// Example 4: Using component helper methods
const dynamicDns = new Route53Component("dynamic-dns", {
    hostedZones: [
        {
            name: "dynamic.example.com",
            comment: "Dynamic DNS zone"
        }
    ],
    region: "us-east-1"
});

// Add records dynamically using the createRecord method
const webRecord = dynamicDns.createRecord("web-record", {
    zoneName: "dynamic.example.com",
    name: "web",
    type: "A",
    values: ["192.0.2.50"],
    ttl: 300
});

const mailRecord = dynamicDns.createRecord("mail-record", {
    zoneName: "dynamic.example.com",
    name: "mail",
    type: "A",
    values: ["192.0.2.51"],
    ttl: 300
});

// Export outputs for use in other stacks
export const publicDnsOutputs = {
    hostedZoneIds: publicDns.hostedZoneIds,
    nameServers: publicDns.nameServers,
    recordFqdns: publicDns.recordFqdns
};

export const privateDnsOutputs = {
    hostedZoneIds: privateDns.hostedZoneIds,
    nameServers: privateDns.nameServers
};

export const multiZoneDnsOutputs = {
    hostedZoneIds: multiZoneDns.hostedZoneIds,
    nameServers: multiZoneDns.nameServers
};

export const dynamicDnsOutputs = {
    hostedZoneId: dynamicDns.getHostedZoneId("dynamic.example.com"),
    nameServers: dynamicDns.getNameServers("dynamic.example.com"),
    webRecordFqdn: webRecord.fqdn,
    mailRecordFqdn: mailRecord.fqdn
};

// Example usage patterns:

// 1. Get specific hosted zone ID for use in other components (like ACM)
export const exampleComZoneId = publicDns.getHostedZoneId("example.com");

// 2. Get name servers for domain registration
export const exampleComNameServers = publicDns.getNameServers("example.com");

// 3. Create additional records after component creation
// This would typically be done in response to other infrastructure being created
/*
const additionalRecord = publicDns.createRecord("additional-service", {
    zoneName: "example.com",
    name: "service",
    type: "A",
    values: ["192.0.2.99"],
    ttl: 300
});
*/