/**
 * DNS Management Example
 * 
 * This example demonstrates how to use the DNS management components:
 * 1. Route53HostedZoneComponent - Manage Route 53 hosted zones
 * 2. Route53RecordsComponent - Manage DNS records in Route 53
 * 3. NamecheapComponent - Manage DNS records for Namecheap domains
 */

import * as pulumi from "@pulumi/pulumi";
import { 
    Route53HostedZoneComponent,
    Route53RecordsComponent
} from "../components/aws/route53";
import { NamecheapDNSComponent } from "../components/namecheap";

// Example 1: Create Route 53 Hosted Zones
const hostedZones = new Route53HostedZoneComponent("example-zones", {
    region: "us-east-1",
    hostedZones: [
        {
            name: "example.com",
            comment: "Public zone for example.com",
            forceDestroy: false
        },
        {
            name: "staging.example.com",
            comment: "Staging environment zone"
        }
    ],
    tags: {
        Environment: "production",
        ManagedBy: "Pulumi"
    }
});

// Export hosted zone information
export const hostedZoneIds = hostedZones.hostedZoneIds;
export const nameServers = hostedZones.nameServers;

// Example 2: Create DNS Records in Route 53
const dnsRecords = new Route53RecordsComponent("example-records", {
    region: "us-east-1",
    records: [
        // Root domain A record
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300
        },
        // WWW CNAME
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "www.example.com",
            type: "CNAME",
            values: ["example.com"],
            ttl: 300
        },
        // Mail servers
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "example.com",
            type: "MX",
            values: [
                "10 mail1.example.com",
                "20 mail2.example.com"
            ],
            ttl: 300
        },
        // SPF record
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "example.com",
            type: "TXT",
            values: ["v=spf1 include:_spf.example.com ~all"],
            ttl: 300
        },
        // API subdomain with weighted routing
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "api.example.com",
            type: "A",
            values: ["192.0.2.10"],
            ttl: 60,
            setIdentifier: "api-primary",
            weightedRoutingPolicy: {
                weight: 70
            }
        },
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "api.example.com",
            type: "A",
            values: ["192.0.2.11"],
            ttl: 60,
            setIdentifier: "api-secondary",
            weightedRoutingPolicy: {
                weight: 30
            }
        }
    ]
});

// Export record information
export const recordFqdns = dnsRecords.recordFqdns;

// Example 3: Failover Configuration with Health Checks
const failoverRecords = new Route53RecordsComponent("failover-records", {
    region: "us-east-1",
    records: [
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "app.example.com",
            type: "A",
            values: ["192.0.2.20"],
            ttl: 60,
            setIdentifier: "primary-us-east-1",
            failoverRoutingPolicy: {
                type: "PRIMARY"
            },
            healthCheckId: "abc123"  // Replace with actual health check ID
        },
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "app.example.com",
            type: "A",
            values: ["192.0.2.21"],
            ttl: 60,
            setIdentifier: "secondary-us-west-2",
            failoverRoutingPolicy: {
                type: "SECONDARY"
            }
        }
    ]
});

// Example 4: Latency-Based Routing for Global Applications
const latencyRecords = new Route53RecordsComponent("latency-records", {
    records: [
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "global.example.com",
            type: "A",
            values: ["192.0.2.30"],
            ttl: 60,
            setIdentifier: "us-east-1",
            latencyRoutingPolicy: {
                region: "us-east-1"
            }
        },
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "global.example.com",
            type: "A",
            values: ["192.0.2.31"],
            ttl: 60,
            setIdentifier: "eu-west-1",
            latencyRoutingPolicy: {
                region: "eu-west-1"
            }
        },
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "global.example.com",
            type: "A",
            values: ["192.0.2.32"],
            ttl: 60,
            setIdentifier: "ap-southeast-1",
            latencyRoutingPolicy: {
                region: "ap-southeast-1"
            }
        }
    ]
});

// Example 5: CloudFront Alias Record
const aliasRecords = new Route53RecordsComponent("alias-records", {
    records: [
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "cdn.example.com",
            type: "A",
            aliasTarget: {
                name: "d123456789.cloudfront.net",  // Replace with actual CloudFront domain
                zoneId: "Z2FDTNDATAQYW2",  // CloudFront hosted zone ID
                evaluateTargetHealth: false
            }
        }
    ]
});

// Example 6: Namecheap DNS Management
// Note: Requires Namecheap API credentials in environment variables
const namecheapDns = new NamecheapDNSComponent("namecheap-dns", {
    domain: "example.net",  // Domain registered with Namecheap
    mode: "MERGE",  // MERGE or OVERWRITE
    records: [
        {
            hostname: "@",
            type: "A",
            address: "192.0.2.100",
            ttl: 1800
        },
        {
            hostname: "www",
            type: "CNAME",
            address: "example.net",
            ttl: 3600
        },
        {
            hostname: "@",
            type: "MX",
            address: "mail.example.net",
            mxPref: 10,
            ttl: 1800
        },
        {
            hostname: "@",
            type: "TXT",
            address: "v=spf1 include:_spf.example.net ~all",
            ttl: 1800
        },
        {
            hostname: "_dmarc",
            type: "TXT",
            address: "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.net",
            ttl: 1800
        }
    ]
});

// Export Namecheap information
export const namecheapDomain = namecheapDns.getDomain();
export const namecheapRecords = namecheapDns.getRecords();

// Example 7: Private Hosted Zone for Internal Services
const privateZones = new Route53HostedZoneComponent("private-zones", {
    region: "us-east-1",
    hostedZones: [
        {
            name: "internal.example.com",
            private: true,
            vpcIds: ["vpc-12345678"],  // Replace with actual VPC ID
            comment: "Private zone for internal services"
        }
    ]
});

const privateRecords = new Route53RecordsComponent("private-records", {
    region: "us-east-1",
    records: [
        {
            zoneId: privateZones.getHostedZoneId("internal.example.com"),
            name: "db.internal.example.com",
            type: "CNAME",
            values: ["rds-instance.abc123.us-east-1.rds.amazonaws.com"],
            ttl: 300
        },
        {
            zoneId: privateZones.getHostedZoneId("internal.example.com"),
            name: "cache.internal.example.com",
            type: "CNAME",
            values: ["redis-cluster.abc123.cache.amazonaws.com"],
            ttl: 300
        }
    ]
});

// Example 8: Geolocation Routing
const geoRecords = new Route53RecordsComponent("geo-records", {
    records: [
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "geo.example.com",
            type: "A",
            values: ["192.0.2.40"],
            ttl: 300,
            setIdentifier: "us-users",
            geolocationRoutingPolicy: {
                country: "US"
            }
        },
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "geo.example.com",
            type: "A",
            values: ["192.0.2.41"],
            ttl: 300,
            setIdentifier: "eu-users",
            geolocationRoutingPolicy: {
                continent: "EU"
            }
        },
        {
            zoneId: hostedZones.getHostedZoneId("example.com"),
            name: "geo.example.com",
            type: "A",
            values: ["192.0.2.42"],
            ttl: 300,
            setIdentifier: "default",
            geolocationRoutingPolicy: {
                // Default location for all other users
            }
        }
    ]
});

/**
 * Usage Instructions:
 * 
 * 1. For Route 53:
 *    - Ensure AWS credentials are configured
 *    - Update VPC IDs for private zones
 *    - Replace placeholder IP addresses and domains
 * 
 * 2. For Namecheap:
 *    - Set environment variables:
 *      export NAMECHEAP_USER_NAME="your-username"
 *      export NAMECHEAP_API_USER="your-api-user"
 *      export NAMECHEAP_API_KEY="your-api-key"
 *      export NAMECHEAP_USE_SANDBOX="false"
 * 
 * 3. Deploy:
 *    pulumi up
 * 
 * 4. View outputs:
 *    pulumi stack output hostedZoneIds
 *    pulumi stack output nameServers
 *    pulumi stack output recordFqdns
 */
