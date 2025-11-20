# DNS Quick Start Guide

## Overview

Set up private DNS zones and ACM certificates for internal services across multiple regions using existing Route53 components.

## Quick Setup (5 minutes)

### 1. Configure Pulumi ESC

```bash
# Get your org
ORG=$(pulumi whoami -v | grep "URL" | awk '{print $2}' | cut -d'/' -f4)

# Create environment
pulumi env init $ORG/namecheap-credentials

# Add credentials
pulumi env set $ORG/namecheap-credentials --secret namecheapApiUser "your-api-user"
pulumi env set $ORG/namecheap-credentials --secret namecheapApiKey "your-api-key"
pulumi env set $ORG/namecheap-credentials --secret namecheapUsername "your-username"
```

### 2. Update Pulumi.yaml

Add to `shared-services/Pulumi.yaml`:

```yaml
environment:
  - namecheap-credentials
```

### 3. Add DNS to shared-services/index.ts

```typescript
import * as namecheap from "pulumi-namecheap";
import { Route53HostedZoneComponent } from "../components/aws/route53";
import { AcmCertificateComponent } from "../components/aws/acm";

// Get Namecheap credentials from ESC
const namecheapApiUser = config.requireSecret("namecheapApiUser");
const namecheapApiKey = config.requireSecret("namecheapApiKey");
const namecheapUsername = config.requireSecret("namecheapUsername");

// Configure Namecheap provider
const namecheapProvider = new namecheap.Provider("namecheap", {
    apiUser: namecheapApiUser,
    apiKey: namecheapApiKey,
    userName: namecheapUsername,
    useSandbox: false,
});

// Create private zone
const privateZone = new Route53HostedZoneComponent(`${currentRegion}-internal-zone`, {
    region: currentRegion,
    hostedZones: [{
        name: `${currentRegion}.internal.srelog.dev`,
        private: true,
        vpcIds: [hubVpc.vpcId],
        comment: `Private zone for ${currentRegion} internal services`,
    }],
    tags: {
        Environment: "production",
        Purpose: "internal-services",
    },
});

// Create ACM certificate
const certificate = new AcmCertificateComponent(`${currentRegion}-wildcard-cert`, {
    region: currentRegion,
    domainName: `*.${currentRegion}.internal.srelog.dev`,
    namecheapProvider: namecheapProvider,
    parentDomain: "srelog.dev",
    tags: {
        Environment: "production",
        Purpose: "internal-services",
    },
});

// Export DNS resources
const zoneName = `${currentRegion}.internal.srelog.dev`;
export const privateZoneId = privateZone.getHostedZoneId(zoneName);
export const privateZoneName = zoneName;
export const certificateArn = certificate.certificateArn;
```

### 4. Deploy

```bash
cd shared-services
pulumi up --stack shared-services-primary
pulumi up --stack shared-services-secondary
```

## What You Get

- **Private zones**: `us-east-1.internal.srelog.dev`, `us-west-2.internal.srelog.dev`
- **Wildcard certs**: `*.us-east-1.internal.srelog.dev`, `*.us-west-2.internal.srelog.dev`
- **Automated validation**: CNAMEs added to Namecheap automatically
- **Cost**: ~$1/month total

## Using the DNS

### Add Service Records

```typescript
// Example: Loki service
const lokiRecord = new aws.route53.Record("loki-record", {
    zoneId: privateZone.getHostedZoneId(`${currentRegion}.internal.srelog.dev`),
    name: `loki.${currentRegion}.internal.srelog.dev`,
    type: "A",
    aliases: [{
        name: lokiAlb.dnsName,
        zoneId: lokiAlb.zoneId,
        evaluateTargetHealth: true,
    }],
});
```

### Use Certificate with ALB

```typescript
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

## Architecture

```
srelog.dev (Namecheap)
  └── Validation CNAMEs (auto-managed)

Route53 Private Zones:
  ├── us-east-1.internal.srelog.dev (VPC-only)
  └── us-west-2.internal.srelog.dev (VPC-only)

Services:
  - loki.us-east-1.internal.srelog.dev
  - grafana.us-east-1.internal.srelog.dev
```

## Components Used

- **Route53HostedZoneComponent**: Existing component from `components/aws/route53`
- **AcmCertificateComponent**: New component from `components/aws/acm` for ACM + Namecheap integration

## Troubleshooting

**Certificate stuck in "Pending Validation"**
- Wait 5-30 minutes for DNS propagation
- Check Namecheap DNS records were created
- Verify `dig _abc123.us-east-1.internal.srelog.dev CNAME`

**"Environment not found"**
```bash
pulumi env ls  # List environments
pulumi env get $ORG/namecheap-credentials  # Verify exists
```

**Private zone not resolving**
- Verify VPC DNS settings: `enableDnsHostnames: true`, `enableDnsSupport: true`
- Test from EC2 in VPC: `dig loki.us-east-1.internal.srelog.dev`

## Full Documentation

- **DNS_SETUP_GUIDE.md**: Complete step-by-step guide
- **PULUMI_ESC_SETUP.md**: ESC configuration details
- **DNS_IMPLEMENTATION_SUMMARY.md**: Architecture and components
- **examples/dns-setup-example.ts**: Working code example
