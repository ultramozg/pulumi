# DNS Setup Guide - Multi-Region Internal Services

## Overview

This guide walks through setting up private DNS zones and ACM certificates for internal services (Loki, Grafana, etc.) across multiple AWS regions using Namecheap for certificate validation.

## Architecture

```
srelog.dev (Namecheap)
  └── ACM validation CNAMEs (added via API)

Route53 Private Zones:
  ├── us-east-1.internal.srelog.dev (VPC-associated)
  └── us-west-2.internal.srelog.dev (VPC-associated)

Services:
  - loki.us-east-1.internal.srelog.dev
  - grafana.us-east-1.internal.srelog.dev
  - loki.us-west-2.internal.srelog.dev
  - grafana.us-west-2.internal.srelog.dev
```

## Prerequisites

1. **Namecheap Domain**: `srelog.dev` registered in Namecheap
2. **Namecheap API Access**: Account balance $50+ or $50+ purchases in last 2 years
3. **Namecheap API Credentials**:
   - API User
   - API Key
   - Username
4. **AWS Account**: With VPCs already created in target regions
5. **Pulumi CLI**: v3.113.0+

## Step 1: Enable Namecheap API

1. Log into Namecheap dashboard
2. Navigate to Profile → Tools → API Access
3. Enable API access
4. Whitelist your IP address (or use dynamic IP detection)
5. Copy your API credentials:
   - API User
   - API Key
   - Username

## Step 2: Configure Pulumi ESC

### Create ESC Environment

```bash
# Login to Pulumi
pulumi login

# Get your organization name
ORG=$(pulumi whoami -v | grep "URL" | awk '{print $2}' | cut -d'/' -f4)

# Create environment for Namecheap credentials
pulumi env init $ORG/namecheap-credentials

# Set credentials (will be encrypted)
pulumi env set $ORG/namecheap-credentials --secret namecheapApiUser "your-api-user"
pulumi env set $ORG/namecheap-credentials --secret namecheapApiKey "your-api-key"
pulumi env set $ORG/namecheap-credentials --secret namecheapUsername "your-username"
```

### Verify ESC Configuration

```bash
# View environment (secrets will be masked)
pulumi env open $ORG/namecheap-credentials
```

## Step 3: Update Pulumi Stack Configuration

### Option A: Update Pulumi.yaml (Recommended)

Add ESC environment reference to your stack configuration:

```yaml
# shared-services/Pulumi.yaml
name: shared-services
runtime:
  name: nodejs
  options:
    packagemanager: npm

# Import Namecheap credentials from ESC
environment:
  - namecheap-credentials

config:
  # ... existing config
```

### Option B: Update Stack-Specific Config

```yaml
# shared-services/Pulumi.shared-services-primary.yaml
environment:
  - namecheap-credentials

config:
  shared-services:isPrimary: "true"
  shared-services:vpcId: "vpc-xxxxx"  # From your hub VPC
  # ... other config
```

## Step 4: Verify Dependencies

The `pulumi-namecheap` provider is already installed in your project. Verify:

```bash
cd aws-ts-resilient-observability
npm list pulumi-namecheap
```

If not installed, add it:

```bash
npm install pulumi-namecheap
```

## Step 5: Integrate DNS into Shared Services

Add DNS setup to your `shared-services/index.ts`:

```typescript
import * as namecheap from "pulumi-namecheap";
import { Route53HostedZoneComponent } from "../components/aws/route53";
import { AcmCertificateComponent } from "../components/aws/acm";

// ... existing shared-services code ...

// ============================================================================
// DNS SETUP
// ============================================================================

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

// Create private zone for this region
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

// Create ACM certificate with Namecheap validation
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

## Step 6: Deploy

```bash
cd shared-services

# Preview changes
pulumi preview --stack shared-services-primary

# Deploy to primary region
pulumi up --stack shared-services-primary

# Deploy to secondary region
pulumi up --stack shared-services-secondary
```

## Step 7: Verify Setup

### Check Route53 Zones

```bash
# List private zones
aws route53 list-hosted-zones --query "HostedZones[?Config.PrivateZone==\`true\`]"

# Check zone details
aws route53 get-hosted-zone --id <zone-id>
```

### Check ACM Certificates

```bash
# List certificates in us-east-1
aws acm list-certificates --region us-east-1

# Check certificate status
aws acm describe-certificate --certificate-arn <cert-arn> --region us-east-1
```

### Verify Namecheap Records

1. Log into Namecheap dashboard
2. Navigate to Domain List → Manage → Advanced DNS
3. Verify CNAME records for ACM validation exist:
   - `_abc123.us-east-1.internal` → `_xyz789.acm-validations.aws.`

## Step 8: Create Service DNS Records

Once zones and certificates are ready, add service records:

```typescript
// Example: Loki service behind ALB
const lokiRecord = new aws.route53.Record("loki-record", {
    zoneId: privateZone.zone.id,
    name: `loki.${privateZone.zoneName}`,
    type: "A",
    aliases: [{
        name: lokiAlb.dnsName,
        zoneId: lokiAlb.zoneId,
        evaluateTargetHealth: true,
    }],
});
```

## Troubleshooting

### ACM Certificate Stuck in "Pending Validation"

1. Check Namecheap DNS records were created:
   ```bash
   dig _abc123.us-east-1.internal.srelog.dev CNAME
   ```

2. DNS propagation can take 5-30 minutes

3. Verify Namecheap API response:
   ```bash
   # Check Pulumi logs
   pulumi logs --stack shared-services-primary
   ```

### Namecheap API Errors

- **"API key is invalid"**: Verify credentials in ESC
- **"IP not whitelisted"**: Add your IP in Namecheap dashboard
- **"Invalid domain"**: Check domain format (SLD/TLD split)

### Private Zone Not Resolving

1. Verify VPC association:
   ```bash
   aws route53 get-hosted-zone --id <zone-id>
   ```

2. Check VPC DNS settings:
   - `enableDnsHostnames`: true
   - `enableDnsSupport`: true

3. Test from EC2 instance in VPC:
   ```bash
   dig loki.us-east-1.internal.srelog.dev
   ```

## Cost Estimate

- Route53 private zones: $0.50/month per zone
- Route53 queries (within VPC): Free
- ACM certificates: Free
- Namecheap domain: ~$10-15/year

**Total monthly cost**: ~$1.00 (2 private zones)

## Security Best Practices

1. **Never commit credentials**: Use Pulumi ESC only
2. **Rotate API keys**: Periodically regenerate Namecheap API keys
3. **Restrict VPC access**: Use security groups to limit service access
4. **Enable VPC Flow Logs**: Monitor DNS query patterns
5. **Use least-privilege IAM**: Limit Route53 permissions

## Next Steps

1. Add DNS records for all services (Grafana, Prometheus, etc.)
2. Configure ALB listeners to use ACM certificates
3. Update application configs to use internal DNS names
4. Set up Route53 health checks for failover
5. Implement DNS-based service discovery for EKS
