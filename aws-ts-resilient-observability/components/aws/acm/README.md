# ACM Certificate Component

## Overview

Flexible ACM certificate component that supports multiple DNS validation methods:
- **Route53**: Automatic validation using AWS Route53 (public zones)
- **Namecheap**: Automatic validation using Namecheap DNS API
- **Manual**: Outputs validation records for manual creation in any DNS provider

## Features

- Extends `BaseAWSComponent` for consistent error handling and logging
- Supports wildcard and multi-domain certificates
- Automatic DNS validation record creation (Route53 & Namecheap)
- Manual validation option for other DNS providers
- Proper resource tagging and lifecycle management

## Usage

### Option 1: Route53 Validation (Recommended if you have public zone in AWS)

```typescript
import { AcmCertificateComponent } from "./components/aws/acm";

const certificate = new AcmCertificateComponent("my-cert", {
    domainName: "*.example.com",
    validationMethod: "route53",
    route53Validation: {
        hostedZoneId: publicZone.id, // Your public Route53 zone
    },
    region: "us-east-1",
    tags: {
        Environment: "production",
    },
});

// Use the certificate
export const certArn = certificate.certificateArn;
```

**Pros:**
- Fully automated
- Fast validation (usually < 5 minutes)
- No external dependencies
- Supports automatic renewal

**Cons:**
- Requires public Route53 hosted zone ($0.50/month)

### Option 2: Namecheap Validation

```typescript
import * as namecheap from "pulumi-namecheap";
import { AcmCertificateComponent } from "./components/aws/acm";

// Configure Namecheap provider
const namecheapProvider = new namecheap.Provider("namecheap", {
    apiUser: config.requireSecret("namecheapApiUser"),
    apiKey: config.requireSecret("namecheapApiKey"),
    userName: config.requireSecret("namecheapUsername"),
});

const certificate = new AcmCertificateComponent("my-cert", {
    domainName: "*.example.com",
    validationMethod: "namecheap",
    namecheapValidation: {
        provider: namecheapProvider,
        parentDomain: "example.com",
    },
    region: "us-east-1",
    tags: {
        Environment: "production",
    },
});
```

**Pros:**
- Automated validation
- No AWS Route53 costs
- Works with existing Namecheap domains

**Cons:**
- Requires Namecheap API access ($50+ account balance or purchases)
- Uses MERGE mode (see warning below)

**⚠️ Important Namecheap Limitation:**

The `pulumi-namecheap` provider's `DomainRecords` resource manages ALL DNS records for a domain. This component uses `mode: "MERGE"` to preserve existing records, but:
- First deployment may take longer as it reads all existing records
- Large numbers of existing records may cause issues
- Consider using `validationMethod: "manual"` if you have complex DNS setups

### Option 3: Manual Validation

```typescript
import { AcmCertificateComponent } from "./components/aws/acm";

const certificate = new AcmCertificateComponent("my-cert", {
    domainName: "*.example.com",
    validationMethod: "manual", // or omit (manual is default)
    region: "us-east-1",
    tags: {
        Environment: "production",
    },
});

// Export validation records for manual creation
export const validationRecords = certificate.validationRecords;
```

**Output:**
```json
[
    {
        "name": "_abc123.example.com",
        "type": "CNAME",
        "value": "_xyz789.acm-validations.aws."
    }
]
```

**Pros:**
- Works with any DNS provider
- No API requirements
- Full control over DNS records

**Cons:**
- Manual step required
- Slower (you must create records manually)
- Must repeat for certificate renewals

## Multi-Domain Certificates

```typescript
const certificate = new AcmCertificateComponent("multi-domain-cert", {
    domainName: "example.com",
    subjectAlternativeNames: [
        "*.example.com",
        "www.example.com",
        "api.example.com",
    ],
    validationMethod: "route53",
    route53Validation: {
        hostedZoneId: publicZone.id,
    },
    region: "us-east-1",
});
```

## Regional Certificates

ACM certificates are regional resources. For multi-region deployments:

```typescript
const regions = ["us-east-1", "us-west-2"];

regions.forEach(region => {
    const provider = new aws.Provider(`${region}-provider`, { region });
    
    new AcmCertificateComponent(`cert-${region}`, {
        domainName: `*.${region}.internal.example.com`,
        validationMethod: "route53",
        route53Validation: {
            hostedZoneId: publicZone.id,
        },
        region: region,
    });
});
```

## Integration with ALB

```typescript
const certificate = new AcmCertificateComponent("alb-cert", {
    domainName: "*.example.com",
    validationMethod: "route53",
    route53Validation: {
        hostedZoneId: publicZone.id,
    },
    region: "us-east-1",
});

const listener = new aws.lb.Listener("https-listener", {
    loadBalancerArn: alb.arn,
    port: 443,
    protocol: "HTTPS",
    certificateArn: certificate.certificateArn,
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn,
    }],
});
```

## Interface Reference

### AcmCertificateArgs

```typescript
interface AcmCertificateArgs extends BaseComponentArgs {
    // Required
    domainName: string;
    
    // Optional
    subjectAlternativeNames?: string[];
    validationMethod?: "route53" | "namecheap" | "manual"; // default: "manual"
    
    // Conditional (based on validationMethod)
    route53Validation?: {
        hostedZoneId: pulumi.Input<string>;
    };
    namecheapValidation?: {
        provider: namecheap.Provider;
        parentDomain: string;
    };
    
    // From BaseComponentArgs
    region?: string;
    tags?: { [key: string]: string };
}
```

### AcmCertificateOutputs

```typescript
interface AcmCertificateOutputs {
    certificateArn: pulumi.Output<string>;
    certificate: aws.acm.Certificate;
    validationRecords?: pulumi.Output<Array<{
        name: string;
        type: string;
        value: string;
    }>>;
}
```

## Validation Method Decision Tree

```
Do you have a public Route53 zone?
├─ Yes → Use validationMethod: "route53" (recommended)
└─ No
   ├─ Do you use Namecheap and have API access?
   │  ├─ Yes → Use validationMethod: "namecheap"
   │  └─ No → Use validationMethod: "manual"
   └─ Other DNS provider → Use validationMethod: "manual"
```

## Troubleshooting

### Certificate Stuck in "Pending Validation"

**Route53:**
- Verify hosted zone ID is correct
- Check Route53 records were created
- Wait 5-10 minutes for DNS propagation

**Namecheap:**
- Verify API credentials are correct
- Check Namecheap dashboard for validation records
- Wait 5-30 minutes for DNS propagation
- Verify mode: "MERGE" didn't conflict with existing records

**Manual:**
- Verify you created the CNAME records exactly as specified
- Check DNS propagation: `dig _abc123.example.com CNAME`
- Wait up to 30 minutes for validation

### Namecheap "Mode MERGE" Issues

If you encounter issues with MERGE mode:
1. Switch to `validationMethod: "manual"`
2. Create validation records manually in Namecheap dashboard
3. Or migrate to Route53 for automated management

## Cost Comparison

| Method | AWS Cost | External Cost | Total/Month |
|--------|----------|---------------|-------------|
| Route53 | $0.50 (zone) | $0 | $0.50 |
| Namecheap | $0 | Domain cost only | ~$0 |
| Manual | $0 | Domain cost only | ~$0 |

ACM certificates are always free.

## Best Practices

1. **Use Route53 for production**: Most reliable and automated
2. **Tag certificates**: Include environment, purpose, and validation method
3. **Regional deployment**: Create certificates in each region where needed
4. **Wildcard certificates**: Use for multiple subdomains
5. **Monitor expiration**: ACM auto-renews, but validation must succeed
6. **Test validation**: Verify DNS records before deploying

## Examples

See `examples/dns-setup-example.ts` for complete working examples of all three validation methods.
