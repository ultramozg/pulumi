# DNS Components Quick Reference

## Installation

```bash
# Already installed in this project
npm install pulumi-namecheap
```

## Import Statements

```typescript
// New components (recommended)
import { 
    Route53HostedZoneComponent,
    Route53RecordsComponent
} from "./components/aws/route53";
import { NamecheapDNSComponent } from "./components/namecheap";

// Or import individually
import { NamecheapDNSComponent } from "./components/namecheap/dns";
import { Route53HostedZoneComponent } from "./components/aws/route53/hosted-zone";
import { Route53RecordsComponent } from "./components/aws/route53/records";
```

## Namecheap - Basic Usage

```typescript
const dns = new NamecheapDNSComponent("dns", {
    domain: "example.com",
    records: [
        { hostname: "@", type: "A", address: "192.0.2.1" },
        { hostname: "www", type: "CNAME", address: "example.com" },
        { hostname: "@", type: "MX", address: "mail.example.com", mxPref: 10 }
    ]
});
```

## Route 53 - Basic Usage

```typescript
// 1. Create hosted zone
const zones = new Route53HostedZoneComponent("zones", {
    hostedZones: [{ name: "example.com" }]
});

// 2. Create records
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

## Common Record Types

### A Record
```typescript
{ zoneId: zoneId, name: "www.example.com", type: "A", values: ["192.0.2.1"], ttl: 300 }
```

### CNAME Record
```typescript
{ zoneId: zoneId, name: "blog.example.com", type: "CNAME", values: ["example.com"], ttl: 300 }
```

### MX Record
```typescript
{ zoneId: zoneId, name: "example.com", type: "MX", values: ["10 mail.example.com"], ttl: 300 }
```

### TXT Record
```typescript
{ zoneId: zoneId, name: "example.com", type: "TXT", values: ["v=spf1 include:_spf.example.com ~all"], ttl: 300 }
```

### Alias Record (Route 53 only)
```typescript
{
    zoneId: zoneId,
    name: "example.com",
    type: "A",
    aliasTarget: {
        name: "d123.cloudfront.net",
        zoneId: "Z2FDTNDATAQYW2"
    }
}
```

## Advanced Routing (Route 53 only)

### Weighted Routing
```typescript
{
    zoneId: zoneId,
    name: "api.example.com",
    type: "A",
    values: ["192.0.2.1"],
    setIdentifier: "70-percent",
    weightedRoutingPolicy: { weight: 70 }
}
```

### Failover Routing
```typescript
{
    zoneId: zoneId,
    name: "app.example.com",
    type: "A",
    values: ["192.0.2.1"],
    setIdentifier: "primary",
    failoverRoutingPolicy: { type: "PRIMARY" }
}
```

### Latency Routing
```typescript
{
    zoneId: zoneId,
    name: "global.example.com",
    type: "A",
    values: ["192.0.2.1"],
    setIdentifier: "us-east-1",
    latencyRoutingPolicy: { region: "us-east-1" }
}
```

### Geolocation Routing
```typescript
{
    zoneId: zoneId,
    name: "www.example.com",
    type: "A",
    values: ["192.0.2.1"],
    setIdentifier: "us-users",
    geolocationRoutingPolicy: { country: "US" }
}
```

## Private Hosted Zone

```typescript
const privateZones = new Route53HostedZoneComponent("private", {
    hostedZones: [
        {
            name: "internal.example.com",
            private: true,
            vpcIds: ["vpc-12345678"]
        }
    ]
});
```

## Environment Variables

### Namecheap
```bash
export NAMECHEAP_USER_NAME="your-username"
export NAMECHEAP_API_USER="your-api-user"
export NAMECHEAP_API_KEY="your-api-key"
export NAMECHEAP_USE_SANDBOX="false"
```

### AWS
```bash
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_REGION="us-east-1"
```

## Common Methods

### Route53HostedZoneComponent
```typescript
zones.getHostedZoneId("example.com")      // Get zone ID
zones.getNameServers("example.com")       // Get name servers
zones.getHostedZone("example.com")        // Get zone resource
zones.getHostedZoneNames()                // Get all zone names
```

### Route53RecordsComponent
```typescript
records.getRecord("www-A-0")              // Get record resource
records.getAllRecordNames()               // Get all record names
records.getRecordFqdn("www-A-0")          // Get record FQDN
```

### NamecheapDNSComponent
```typescript
dns.getDomain()                           // Get domain name
dns.getRecords()                          // Get all record specs
```

## Testing

```bash
# Test all DNS components
npm test -- --testPathPattern="(namecheap|route53-hosted-zone|route53-records)"

# Test individual components
npm test -- --testPathPattern="namecheap"
npm test -- --testPathPattern="route53-hosted-zone"
npm test -- --testPathPattern="route53-records"
```

## Documentation

- `components/namecheap/dns/README.md` - Namecheap component docs
- `components/aws/route53/hosted-zone/README.md` - Hosted zone docs
- `components/aws/route53/records/README.md` - Records component docs
- `DNS_COMPONENTS_GUIDE.md` - Complete guide
- `examples/dns-management-example.ts` - Full examples

## Supported Record Types

### Route 53
A, AAAA, CNAME, MX, NS, PTR, SOA, SPF, SRV, TXT, CAA

### Namecheap
A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, URL, URL301, FRAME

## Common Patterns

### Multi-Region Setup
```typescript
const primaryZone = new Route53HostedZoneComponent("primary", {
    region: "us-east-1",
    hostedZones: [{ name: "example.com" }]
});

const primaryRecords = new Route53RecordsComponent("primary-records", {
    region: "us-east-1",
    records: [{
        zoneId: primaryZone.getHostedZoneId("example.com"),
        name: "app.example.com",
        type: "A",
        values: ["192.0.2.1"],
        setIdentifier: "primary",
        failoverRoutingPolicy: { type: "PRIMARY" }
    }]
});
```

### Domain Validation for ACM
```typescript
const zones = new Route53HostedZoneComponent("zones", {
    hostedZones: [{ name: "example.com" }]
});

// Create ACM certificate (not shown)
// Then create validation records
const validation = new Route53RecordsComponent("validation", {
    records: [{
        zoneId: zones.getHostedZoneId("example.com"),
        name: "_abc123.example.com",
        type: "CNAME",
        values: ["_xyz789.acm-validations.aws."]
    }]
});
```

## Tips

1. **Use separate components** for zones and records for better modularity
2. **Set appropriate TTLs**: Lower (60s) for dynamic, higher (3600s) for static
3. **Use alias records** for AWS resources (no charge, better performance)
4. **Always use health checks** with failover routing
5. **Test in sandbox** mode for Namecheap before production
6. **Tag everything** for better resource management

## Troubleshooting

### Namecheap Issues
- Verify API credentials
- Check API access is enabled in account
- Ensure domain is registered with Namecheap
- Verify sandbox mode setting

### Route 53 Issues
- Check AWS credentials and permissions
- Verify VPC IDs for private zones
- Ensure zone exists before creating records
- Validate record formats (MX: "priority hostname", SRV: "priority weight port target")

## Next Steps

1. Review full documentation in `DNS_COMPONENTS_GUIDE.md`
2. Check examples in `examples/dns-management-example.ts`
3. Run tests to see usage patterns
4. Start with simple records, then add advanced routing
