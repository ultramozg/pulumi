# ACM Component - Enhanced Summary

## What Was Enhanced

The ACM component is now **generic and flexible**, supporting multiple DNS validation scenarios instead of being locked to Namecheap.

## Validation Methods Supported

### 1. Route53 (Recommended for AWS-native setups)

```typescript
const cert = new AcmCertificateComponent("my-cert", {
    domainName: "*.example.com",
    validationMethod: "route53",
    route53Validation: {
        hostedZoneId: publicZone.id,
    },
    region: "us-east-1",
});
```

**When to use:**
- You have a public Route53 hosted zone
- Want fully automated validation
- Need fast, reliable certificate provisioning

**Cost:** $0.50/month for Route53 zone

### 2. Namecheap (For Namecheap-managed domains)

```typescript
const cert = new AcmCertificateComponent("my-cert", {
    domainName: "*.example.com",
    validationMethod: "namecheap",
    namecheapValidation: {
        provider: namecheapProvider,
        parentDomain: "example.com",
    },
    region: "us-east-1",
});
```

**When to use:**
- Domain is managed in Namecheap
- Have Namecheap API access
- Want to avoid Route53 costs

**Cost:** Free (domain cost only)

**Note:** Uses MERGE mode to preserve existing DNS records

### 3. Manual (For any DNS provider)

```typescript
const cert = new AcmCertificateComponent("my-cert", {
    domainName: "*.example.com",
    validationMethod: "manual", // or omit (default)
    region: "us-east-1",
});

// Outputs validation records for manual creation
export const validationRecords = cert.validationRecords;
```

**When to use:**
- Using Cloudflare, GoDaddy, or other DNS providers
- Don't have API access
- Want full control over DNS records

**Cost:** Free

## Key Improvements

### Before (Namecheap-only)
```typescript
interface AcmCertificateArgs {
    domainName: string;
    namecheapProvider: namecheap.Provider;  // Required!
    parentDomain: string;                    // Required!
}
```

### After (Generic)
```typescript
interface AcmCertificateArgs {
    domainName: string;
    validationMethod?: "route53" | "namecheap" | "manual";
    
    // Only required if using specific method
    route53Validation?: { hostedZoneId: string };
    namecheapValidation?: { provider: Provider; parentDomain: string };
}
```

## Architecture Patterns

### Pattern 1: Hybrid (Public Route53 + Private Zones)

```
Route53 Public Zone (example.com)
  └── ACM validation records (automatic)

Route53 Private Zones (VPC-only)
  ├── us-east-1.internal.example.com
  └── us-west-2.internal.example.com

Services use:
  - Private DNS for resolution
  - Public ACM certs for TLS
```

**Setup:**
```typescript
// Public zone for validation
const publicZone = new aws.route53.Zone("public", {
    name: "example.com",
});

// Private zones for services
const privateZone = new Route53HostedZoneComponent("private", {
    region: "us-east-1",
    hostedZones: [{
        name: "us-east-1.internal.example.com",
        private: true,
        vpcIds: [vpc.id],
    }],
});

// Certificate with Route53 validation
const cert = new AcmCertificateComponent("cert", {
    domainName: "*.us-east-1.internal.example.com",
    validationMethod: "route53",
    route53Validation: {
        hostedZoneId: publicZone.id,
    },
    region: "us-east-1",
});
```

**Cost:** $1.00/month (public + private zones)

### Pattern 2: Namecheap Domain + Private Zones

```
Namecheap (example.com)
  └── ACM validation records (automatic via API)

Route53 Private Zones (VPC-only)
  ├── us-east-1.internal.example.com
  └── us-west-2.internal.example.com
```

**Setup:**
```typescript
// Private zones
const privateZone = new Route53HostedZoneComponent("private", {
    region: "us-east-1",
    hostedZones: [{
        name: "us-east-1.internal.example.com",
        private: true,
        vpcIds: [vpc.id],
    }],
});

// Certificate with Namecheap validation
const cert = new AcmCertificateComponent("cert", {
    domainName: "*.us-east-1.internal.example.com",
    validationMethod: "namecheap",
    namecheapValidation: {
        provider: namecheapProvider,
        parentDomain: "example.com",
    },
    region: "us-east-1",
});
```

**Cost:** $0.50/month (private zones only)

### Pattern 3: Manual Validation

```
Any DNS Provider (example.com)
  └── ACM validation records (manual creation)

Route53 Private Zones (VPC-only)
  ├── us-east-1.internal.example.com
  └── us-west-2.internal.example.com
```

**Setup:**
```typescript
const cert = new AcmCertificateComponent("cert", {
    domainName: "*.us-east-1.internal.example.com",
    validationMethod: "manual",
    region: "us-east-1",
});

// Export for manual creation
export const validationRecords = cert.validationRecords;
```

**Cost:** $0.50/month (private zones only)

## Migration Guide

### From Old (Namecheap-only) to New (Generic)

**Before:**
```typescript
const cert = new AcmCertificateComponent("cert", {
    domainName: "*.example.com",
    namecheapProvider: provider,
    parentDomain: "example.com",
    region: "us-east-1",
});
```

**After:**
```typescript
const cert = new AcmCertificateComponent("cert", {
    domainName: "*.example.com",
    validationMethod: "namecheap",
    namecheapValidation: {
        provider: provider,
        parentDomain: "example.com",
    },
    region: "us-east-1",
});
```

## Decision Matrix

| Scenario | Recommended Method | Why |
|----------|-------------------|-----|
| AWS-native infrastructure | Route53 | Fully automated, reliable |
| Namecheap domain with API | Namecheap | No Route53 costs |
| Namecheap without API | Manual | No API required |
| Cloudflare/GoDaddy/Other | Manual | Universal compatibility |
| Multi-cloud setup | Manual | Provider-agnostic |
| Production workloads | Route53 | Best reliability |
| Cost-sensitive | Namecheap or Manual | Avoid Route53 costs |

## Component Features

✅ **Flexible**: Supports 3 validation methods
✅ **Consistent**: Extends BaseAWSComponent
✅ **Validated**: Input validation for each method
✅ **Logged**: Structured logging throughout
✅ **Tagged**: Automatic resource tagging
✅ **Typed**: Full TypeScript type safety
✅ **Documented**: Comprehensive README

## Files

- **Component**: `components/aws/acm/index.ts`
- **Documentation**: `components/aws/acm/README.md`
- **Examples**: `examples/dns-setup-example.ts`
- **Integration**: Exported via `components/aws/index.ts`

## Next Steps

1. Choose validation method based on your DNS provider
2. Update your shared-services stack with appropriate method
3. Deploy and verify certificate validation
4. Use certificate ARN with ALB/CloudFront/API Gateway

See `components/aws/acm/README.md` for detailed usage examples and troubleshooting.
