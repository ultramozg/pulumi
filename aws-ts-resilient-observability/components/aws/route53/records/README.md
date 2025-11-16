# Route 53 Records Component

Manages DNS records in AWS Route 53 hosted zones with support for advanced routing policies.

## Features

- Support for all common DNS record types (A, AAAA, CNAME, MX, TXT, etc.)
- Alias records for AWS resources
- Advanced routing policies:
  - Weighted routing
  - Failover routing
  - Geolocation routing
  - Latency-based routing
- Health check integration
- Comprehensive validation

## Usage

### Basic A Record

```typescript
import { Route53RecordsComponent } from "./components/aws/route53-records";

const records = new Route53RecordsComponent("my-records", {
    records: [
        {
            zoneId: "Z1234567890ABC",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300
        }
    ]
});
```

### CNAME Record

```typescript
const cnameRecords = new Route53RecordsComponent("cname-records", {
    records: [
        {
            zoneId: "Z1234567890ABC",
            name: "blog.example.com",
            type: "CNAME",
            values: ["example.com"],
            ttl: 300
        }
    ]
});
```

### MX Records

```typescript
const mxRecords = new Route53RecordsComponent("mx-records", {
    records: [
        {
            zoneId: "Z1234567890ABC",
            name: "example.com",
            type: "MX",
            values: [
                "10 mail.example.com",
                "20 mail2.example.com"
            ],
            ttl: 300
        }
    ]
});
```

### TXT Records

```typescript
const txtRecords = new Route53RecordsComponent("txt-records", {
    records: [
        {
            zoneId: "Z1234567890ABC",
            name: "example.com",
            type: "TXT",
            values: ["v=spf1 include:_spf.example.com ~all"],
            ttl: 300
        }
    ]
});
```

### Alias Record (CloudFront)

```typescript
const aliasRecords = new Route53RecordsComponent("alias-records", {
    records: [
        {
            zoneId: "Z1234567890ABC",
            name: "example.com",
            type: "A",
            aliasTarget: {
                name: "d123456789.cloudfront.net",
                zoneId: "Z2FDTNDATAQYW2",  // CloudFront hosted zone ID
                evaluateTargetHealth: false
            }
        }
    ]
});
```

### Weighted Routing

```typescript
const weightedRecords = new Route53RecordsComponent("weighted-records", {
    records: [
        {
            zoneId: "Z1234567890ABC",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300,
            setIdentifier: "weight-70",
            weightedRoutingPolicy: {
                weight: 70
            }
        },
        {
            zoneId: "Z1234567890ABC",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.2"],
            ttl: 300,
            setIdentifier: "weight-30",
            weightedRoutingPolicy: {
                weight: 30
            }
        }
    ]
});
```

### Failover Routing

```typescript
const failoverRecords = new Route53RecordsComponent("failover-records", {
    records: [
        {
            zoneId: "Z1234567890ABC",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 60,
            setIdentifier: "primary",
            failoverRoutingPolicy: {
                type: "PRIMARY"
            },
            healthCheckId: "abc123"
        },
        {
            zoneId: "Z1234567890ABC",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.2"],
            ttl: 60,
            setIdentifier: "secondary",
            failoverRoutingPolicy: {
                type: "SECONDARY"
            }
        }
    ]
});
```

### Latency-Based Routing

```typescript
const latencyRecords = new Route53RecordsComponent("latency-records", {
    records: [
        {
            zoneId: "Z1234567890ABC",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300,
            setIdentifier: "us-east-1",
            latencyRoutingPolicy: {
                region: "us-east-1"
            }
        },
        {
            zoneId: "Z1234567890ABC",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.2"],
            ttl: 300,
            setIdentifier: "eu-west-1",
            latencyRoutingPolicy: {
                region: "eu-west-1"
            }
        }
    ]
});
```

### Geolocation Routing

```typescript
const geoRecords = new Route53RecordsComponent("geo-records", {
    records: [
        {
            zoneId: "Z1234567890ABC",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300,
            setIdentifier: "us-users",
            geolocationRoutingPolicy: {
                country: "US"
            }
        },
        {
            zoneId: "Z1234567890ABC",
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.2"],
            ttl: 300,
            setIdentifier: "eu-users",
            geolocationRoutingPolicy: {
                continent: "EU"
            }
        }
    ]
});
```

## Configuration Options

### Route53RecordsArgs

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| records | DNSRecordSpec[] | Yes | Array of DNS record specifications |
| region | string | No | AWS region (default: us-east-1) |
| tags | object | No | Additional tags |

### DNSRecordSpec

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| zoneId | string | Yes | Hosted zone ID |
| name | string | Yes | Record name (FQDN) |
| type | string | Yes | Record type (A, AAAA, CNAME, etc.) |
| values | string[] | Conditional | Record values (required if no aliasTarget) |
| ttl | number | No | Time to live in seconds (default: 300) |
| setIdentifier | string | Conditional | Required for routing policies |
| aliasTarget | object | No | Alias target configuration |
| weightedRoutingPolicy | object | No | Weighted routing configuration |
| failoverRoutingPolicy | object | No | Failover routing configuration |
| geolocationRoutingPolicy | object | No | Geolocation routing configuration |
| latencyRoutingPolicy | object | No | Latency routing configuration |
| healthCheckId | string | No | Health check ID |

## Supported Record Types

- **A**: IPv4 address
- **AAAA**: IPv6 address
- **CNAME**: Canonical name
- **MX**: Mail exchange (format: "priority hostname")
- **NS**: Name server
- **PTR**: Pointer record
- **SOA**: Start of authority
- **SPF**: Sender Policy Framework
- **SRV**: Service record (format: "priority weight port target")
- **TXT**: Text record
- **CAA**: Certification Authority Authorization

## Outputs

```typescript
// Get all record FQDNs
const fqdns = await records.recordFqdns;

// Get all record names
const names = await records.recordNames;

// Get specific record FQDN
const fqdn = records.getRecordFqdn("www-A-0");
```

## Methods

### getRecord(recordName: string)

Get the underlying Route 53 Record resource:

```typescript
const record = records.getRecord("www-A-0");
```

### getAllRecordNames()

Get all record names:

```typescript
const names = records.getAllRecordNames();
```

### getRecordFqdn(recordName: string)

Get the FQDN for a specific record:

```typescript
const fqdn = records.getRecordFqdn("www-A-0");
```

## Validation Rules

- CNAME records can only have one value
- MX records must be in format "priority hostname"
- SRV records must be in format "priority weight port target"
- Records with routing policies must have a `setIdentifier`
- Only one routing policy can be specified per record
- Records cannot have both `values` and `aliasTarget`
- TTL is not allowed for alias records

## Integration Example

Complete example with hosted zone and records:

```typescript
import { Route53HostedZoneComponent } from "./components/aws/route53-hosted-zone";
import { Route53RecordsComponent } from "./components/aws/route53-records";

// Create hosted zone
const zones = new Route53HostedZoneComponent("zones", {
    hostedZones: [
        {
            name: "example.com"
        }
    ]
});

// Create records
const records = new Route53RecordsComponent("records", {
    records: [
        {
            zoneId: zones.getHostedZoneId("example.com"),
            name: "example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300
        },
        {
            zoneId: zones.getHostedZoneId("example.com"),
            name: "www.example.com",
            type: "CNAME",
            values: ["example.com"],
            ttl: 300
        }
    ]
});
```

## Notes

- Record names are automatically generated based on the record specification
- Use alias records for AWS resources (CloudFront, ELB, S3, etc.)
- Routing policies require unique `setIdentifier` values
- Health checks can be associated with records for failover
- TTL values range from 0 to 2147483647 seconds
