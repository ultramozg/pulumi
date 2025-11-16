# Route 53 Hosted Zone Component

Manages AWS Route 53 hosted zones (both public and private).

## Features

- Create public and private hosted zones
- Support for multiple hosted zones
- VPC association for private zones
- Delegation set support
- Automatic tagging

## Usage

### Public Hosted Zone

```typescript
import { Route53HostedZoneComponent } from "./components/aws/route53-hosted-zone";

const hostedZones = new Route53HostedZoneComponent("my-zones", {
    hostedZones: [
        {
            name: "example.com",
            comment: "Public zone for example.com",
            forceDestroy: false
        }
    ]
});

// Get zone ID
const zoneId = hostedZones.getHostedZoneId("example.com");

// Get name servers
const nameServers = hostedZones.getNameServers("example.com");
```

### Private Hosted Zone

```typescript
const privateZones = new Route53HostedZoneComponent("private-zones", {
    region: "us-east-1",
    hostedZones: [
        {
            name: "internal.example.com",
            private: true,
            vpcIds: ["vpc-12345678"],
            comment: "Private zone for internal services"
        }
    ]
});
```

### Multiple Hosted Zones

```typescript
const multiZones = new Route53HostedZoneComponent("multi-zones", {
    hostedZones: [
        {
            name: "example.com",
            comment: "Main domain"
        },
        {
            name: "example.org",
            comment: "Alternative domain"
        },
        {
            name: "internal.example.com",
            private: true,
            vpcIds: ["vpc-12345678"],
            comment: "Internal services"
        }
    ]
});

// Get all zone names
const zoneNames = multiZones.getHostedZoneNames();
```

### With Delegation Set

```typescript
const delegatedZones = new Route53HostedZoneComponent("delegated-zones", {
    hostedZones: [
        {
            name: "example.com",
            delegationSetId: "N1PA6795SAMPLE",
            comment: "Zone with reusable delegation set"
        }
    ]
});
```

## Configuration Options

### Route53HostedZoneArgs

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| hostedZones | HostedZoneSpec[] | Yes | Array of hosted zone specifications |
| region | string | No | AWS region (default: us-east-1) |
| tags | object | No | Additional tags for all zones |

### HostedZoneSpec

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| name | string | Yes | Domain name for the hosted zone |
| private | boolean | No | Whether this is a private zone (default: false) |
| vpcIds | string[] | Conditional | VPC IDs (required for private zones) |
| comment | string | No | Description of the hosted zone |
| delegationSetId | string | No | Reusable delegation set ID |
| forceDestroy | boolean | No | Allow deletion with records (default: false) |

## Outputs

### hostedZoneIds

Map of zone names to zone IDs:

```typescript
const zoneIds = await hostedZones.hostedZoneIds;
// { "example.com": "Z1234567890ABC" }
```

### nameServers

Map of zone names to name server arrays:

```typescript
const nameServers = await hostedZones.nameServers;
// { "example.com": ["ns-1.awsdns-01.com", "ns-2.awsdns-02.net", ...] }
```

## Methods

### getHostedZoneId(zoneName: string)

Get the zone ID for a specific hosted zone:

```typescript
const zoneId = hostedZones.getHostedZoneId("example.com");
```

### getNameServers(zoneName: string)

Get the name servers for a specific hosted zone:

```typescript
const ns = hostedZones.getNameServers("example.com");
```

### getHostedZone(zoneName: string)

Get the underlying Route 53 Zone resource:

```typescript
const zone = hostedZones.getHostedZone("example.com");
```

### getHostedZoneNames()

Get all hosted zone names:

```typescript
const names = hostedZones.getHostedZoneNames();
// ["example.com", "example.org"]
```

## Integration with Route53RecordsComponent

Use this component with the Route53RecordsComponent to manage DNS records:

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

// Create records in the zone
const records = new Route53RecordsComponent("records", {
    records: [
        {
            zoneId: zones.getHostedZoneId("example.com"),
            name: "www.example.com",
            type: "A",
            values: ["192.0.2.1"],
            ttl: 300
        }
    ]
});
```

## Notes

- Private hosted zones require at least one VPC ID
- VPC IDs must be in the same region as the hosted zone
- Use `forceDestroy: true` carefully - it allows deletion even with records
- Name servers are automatically assigned by AWS
- Delegation sets allow consistent name servers across multiple zones
