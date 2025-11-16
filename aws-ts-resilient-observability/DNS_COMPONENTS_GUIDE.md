# DNS Management Components Guide

This guide covers the three DNS management components added to the project:

1. **Route53HostedZoneComponent** - Manage AWS Route 53 hosted zones
2. **Route53RecordsComponent** - Manage DNS records in Route 53
3. **NamecheapComponent** - Manage DNS records for Namecheap domains

## Overview

The DNS components have been split into separate, focused components following best practices:

- **Separation of Concerns**: Hosted zones and records are managed separately
- **Reusability**: Each component can be used independently
- **Type Safety**: Full TypeScript support with comprehensive interfaces
- **Validation**: Built-in validation for all DNS record types and configurations
- **Testing**: Complete test coverage for all components

## Component Structure

```
components/
├── namecheap/
│   ├── dns/
│   │   ├── index.ts                    # Namecheap DNS component
│   │   ├── namecheap-dns.test.ts      # Unit tests
│   │   └── README.md                   # Documentation
│   └── index.ts                        # Namecheap namespace export
├── aws/
│   ├── route53/
│   │   ├── hosted-zone/
│   ├── index.ts                    # Route 53 hosted zone component
│   ├── route53-hosted-zone.test.ts # Unit tests
│   └── README.md                   # Documentation
└── route53-records/
    ├── index.ts                    # Route 53 records component
    ├── route53-records.test.ts     # Unit tests
    └── README.md                   # Documentation
```

## Quick Start

### 1. Route 53 Hosted Zones

Create public and private hosted zones:

```typescript
import { Route53HostedZoneComponent } from "./components/aws/route53";

const zones = new Route53HostedZoneComponent("my-zones", {
    hostedZones: [
        {
            name: "example.com",
            comment: "Public zone"
        },
        {
            name: "internal.example.com",
            private: true,
            vpcIds: ["vpc-12345678"]
        }
    ]
});

// Get zone ID for use in records
const zoneId = zones.getHostedZoneId("example.com");
```

### 2. Route 53 DNS Records

Create DNS records with advanced routing:

```typescript
import { Route53RecordsComponent } from "./components/aws/route53";

const records = new Route53RecordsComponent("my-records", {
    records: [
        {
            zoneId: zoneId,
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300
        },
        {
            zoneId: zoneId,
            name: "api.example.com",
            type: "A",
            values: ["192.0.2.10"],
            ttl: 60,
            setIdentifier: "primary",
            failoverRoutingPolicy: {
                type: "PRIMARY"
            }
        }
    ]
});
```

### 3. Namecheap DNS

Manage Namecheap domain DNS records:

```typescript
import { NamecheapDNSComponent } from "./components/namecheap";

const dns = new NamecheapDNSComponent("namecheap-dns", {
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
            address: "example.com"
        }
    ]
});
```

## Features

### Route53HostedZoneComponent

- ✅ Public and private hosted zones
- ✅ VPC association for private zones
- ✅ Delegation set support
- ✅ Multiple zones in one component
- ✅ Automatic tagging
- ✅ Domain name validation

### Route53RecordsComponent

- ✅ All standard DNS record types (A, AAAA, CNAME, MX, TXT, etc.)
- ✅ Alias records for AWS resources
- ✅ Weighted routing
- ✅ Failover routing
- ✅ Geolocation routing
- ✅ Latency-based routing
- ✅ Health check integration
- ✅ Comprehensive validation

### NamecheapComponent

- ✅ All Namecheap record types
- ✅ URL redirects (301, 302, FRAME)
- ✅ MX records with priority
- ✅ Custom TTL values
- ✅ MERGE or OVERWRITE mode
- ✅ Hostname validation

## Supported Record Types

### Route 53
- A, AAAA, CNAME, MX, NS, PTR, SOA, SPF, SRV, TXT, CAA

### Namecheap
- A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, URL, URL301, FRAME

## Advanced Routing Examples

### Weighted Routing (Traffic Distribution)

```typescript
const weightedRecords = new Route53RecordsComponent("weighted", {
    records: [
        {
            zoneId: zoneId,
            name: "api.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 60,
            setIdentifier: "70-percent",
            weightedRoutingPolicy: { weight: 70 }
        },
        {
            zoneId: zoneId,
            name: "api.example.com",
            type: "A",
            values: ["192.0.2.2"],
            ttl: 60,
            setIdentifier: "30-percent",
            weightedRoutingPolicy: { weight: 30 }
        }
    ]
});
```

### Failover Routing (High Availability)

```typescript
const failoverRecords = new Route53RecordsComponent("failover", {
    records: [
        {
            zoneId: zoneId,
            name: "app.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 60,
            setIdentifier: "primary",
            failoverRoutingPolicy: { type: "PRIMARY" },
            healthCheckId: "health-check-id"
        },
        {
            zoneId: zoneId,
            name: "app.example.com",
            type: "A",
            values: ["192.0.2.2"],
            ttl: 60,
            setIdentifier: "secondary",
            failoverRoutingPolicy: { type: "SECONDARY" }
        }
    ]
});
```

### Latency-Based Routing (Global Performance)

```typescript
const latencyRecords = new Route53RecordsComponent("latency", {
    records: [
        {
            zoneId: zoneId,
            name: "global.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 60,
            setIdentifier: "us-east-1",
            latencyRoutingPolicy: { region: "us-east-1" }
        },
        {
            zoneId: zoneId,
            name: "global.example.com",
            type: "A",
            values: ["192.0.2.2"],
            ttl: 60,
            setIdentifier: "eu-west-1",
            latencyRoutingPolicy: { region: "eu-west-1" }
        }
    ]
});
```

### Geolocation Routing (Regional Content)

```typescript
const geoRecords = new Route53RecordsComponent("geo", {
    records: [
        {
            zoneId: zoneId,
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300,
            setIdentifier: "us-users",
            geolocationRoutingPolicy: { country: "US" }
        },
        {
            zoneId: zoneId,
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.2"],
            ttl: 300,
            setIdentifier: "eu-users",
            geolocationRoutingPolicy: { continent: "EU" }
        }
    ]
});
```

## Configuration

### Namecheap API Setup

Set environment variables:

```bash
export NAMECHEAP_USER_NAME="your-username"
export NAMECHEAP_API_USER="your-api-user"
export NAMECHEAP_API_KEY="your-api-key"
export NAMECHEAP_USE_SANDBOX="false"
```

### AWS Credentials

Ensure AWS credentials are configured:

```bash
aws configure
# or
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_REGION="us-east-1"
```

## Testing

Run tests for the DNS components:

```bash
# All DNS component tests
npm test -- --testPathPattern="(namecheap|route53-hosted-zone|route53-records)"

# Individual component tests
npm test -- --testPathPattern="namecheap"
npm test -- --testPathPattern="route53-hosted-zone"
npm test -- --testPathPattern="route53-records"
```

## Examples

Complete examples are available in:
- `examples/dns-management-example.ts` - Comprehensive usage examples

## Migration from Old Route53Component

If you're using the old combined `Route53Component`, here's how to migrate:

### Before (Old Component)

```typescript
const route53 = new Route53Component("dns", {
    hostedZones: [{ name: "example.com" }],
    records: [
        {
            zoneName: "example.com",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"]
        }
    ]
});
```

### After (New Components)

```typescript
// Step 1: Create hosted zone
const zones = new Route53HostedZoneComponent("zones", {
    hostedZones: [{ name: "example.com" }]
});

// Step 2: Create records
const records = new Route53RecordsComponent("records", {
    records: [
        {
            zoneId: zones.getHostedZoneId("example.com"),
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"]
        }
    ]
});
```

## Best Practices

1. **Separate Zones and Records**: Use separate components for better modularity
2. **Use Alias Records**: For AWS resources (CloudFront, ELB, S3)
3. **Set Appropriate TTLs**: Lower for dynamic content, higher for static
4. **Health Checks**: Always use with failover routing
5. **Validation**: Components validate all inputs automatically
6. **Tagging**: Use consistent tagging for all resources

## Troubleshooting

### Namecheap API Issues

- Verify API credentials are correct
- Check if API access is enabled in Namecheap account
- Ensure domain is registered with Namecheap
- Check sandbox mode setting

### Route 53 Issues

- Verify AWS credentials and permissions
- Check VPC IDs for private zones
- Ensure zone exists before creating records
- Validate record formats (MX, SRV)

## Documentation

Each component has detailed documentation:
- `components/namecheap/dns/README.md`
- `components/aws/route53/hosted-zone/README.md`
- `components/aws/route53/records/README.md`

## Support

For issues or questions:
1. Check component README files
2. Review test files for usage examples
3. See `examples/dns-management-example.ts`
