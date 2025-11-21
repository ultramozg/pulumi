# DNS Setup with Automation API

## Overview

DNS and ACM certificate configuration is managed through `deployment-config.json` and deployed via the automation API.

## Configuration in deployment-config.json

### DNS Component Configuration

```json
{
  "type": "dns",
  "name": "primary-dns",
  "config": {
    "region": "us-east-1",                      // ✅ Required
    "baseDomain": "internal.srelog.dev",        // ✅ Required
    "parentDomain": "srelog.dev",               // ✅ Required
    "enableCertificates": true,                 // ✅ Required
    "certificateValidationMethod": "namecheap"  // ✅ Required
  },
  "notes": "Creates private Route53 zone and ACM certificate. Requires Namecheap credentials in Pulumi ESC environment 'namecheap-credentials'"
}
```

**⚠️ Important:** All DNS configuration values are **required**. The deployment will fail if any are missing from `deployment-config.json`.

### Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `region` | string | ✅ Yes | AWS region (us-east-1, us-west-2) |
| `baseDomain` | string | ✅ Yes | Base domain for internal services |
| `parentDomain` | string | ✅ Yes | Parent domain in DNS provider |
| `enableCertificates` | boolean | ✅ Yes | Enable ACM certificate creation |
| `certificateValidationMethod` | string | ✅ Yes | Validation method: "namecheap", "route53", or "manual" |

## Prerequisites

### 1. Pulumi ESC Environment

Create environment for Namecheap credentials:

```bash
# Get your organization
ORG=$(pulumi whoami -v | grep "URL" | awk '{print $2}' | cut -d'/' -f4)

# Create environment
pulumi env init $ORG/namecheap-credentials

# Add credentials (only 2 values needed)
pulumi env set $ORG/namecheap-credentials --secret username "your-namecheap-username"
pulumi env set $ORG/namecheap-credentials --secret apiKey "your-namecheap-api-key"
```

**What you need:**
- `username`: Your Namecheap account username (not email)
- `apiKey`: Your Namecheap API key from Profile → Tools → API Access

See `NAMECHEAP_CREDENTIALS_GUIDE.md` for detailed instructions.

### 2. Update Pulumi.yaml

Add ESC environment reference:

```yaml
# shared-services/Pulumi.yaml
name: shared-services
runtime:
  name: nodejs

environment:
  - namecheap-credentials
```

## Deployment

### Using Automation API (Recommended)

```bash
# Deploy all stacks (reads deployment-config.json)
npm run deploy

# Deploy specific stack
npm run automation deploy -- --stack shared-services-primary

# Preview changes
npm run automation preview -- --stack shared-services-primary

# Check status
npm run automation status
```

### Manual Deployment (Alternative)

```bash
cd shared-services

# Deploy primary region
pulumi up --stack shared-services-primary

# Deploy secondary region
pulumi up --stack shared-services-secondary
```

## What Gets Deployed

### Per Region

**us-east-1:**
- Private Zone: `us-east-1.internal.srelog.dev`
- Certificate: `*.us-east-1.internal.srelog.dev`
- Validation: Automatic via Namecheap API

**us-west-2:**
- Private Zone: `us-west-2.internal.srelog.dev`
- Certificate: `*.us-west-2.internal.srelog.dev`
- Validation: Automatic via Namecheap API

## Configuration Examples

### Example 1: Default Configuration (Namecheap)

```json
{
  "type": "dns",
  "name": "primary-dns",
  "config": {
    "region": "us-east-1",
    "baseDomain": "internal.srelog.dev",
    "parentDomain": "srelog.dev",
    "enableCertificates": true,
    "certificateValidationMethod": "namecheap"
  }
}
```

### Example 2: Route53 Validation

If you have a public Route53 zone:

```json
{
  "type": "dns",
  "name": "primary-dns",
  "config": {
    "region": "us-east-1",
    "baseDomain": "internal.example.com",
    "parentDomain": "example.com",
    "enableCertificates": true,
    "certificateValidationMethod": "route53"
  }
}
```

**Note:** Route53 validation requires a public hosted zone for the parent domain.

### Example 3: Manual Validation

For other DNS providers:

```json
{
  "type": "dns",
  "name": "primary-dns",
  "config": {
    "region": "us-east-1",
    "baseDomain": "internal.example.com",
    "parentDomain": "example.com",
    "enableCertificates": true,
    "certificateValidationMethod": "manual"
  }
}
```

Validation records will be exported in stack outputs for manual creation.

### Example 4: DNS Only (No Certificates)

```json
{
  "type": "dns",
  "name": "primary-dns",
  "config": {
    "region": "us-east-1",
    "baseDomain": "internal.srelog.dev",
    "parentDomain": "srelog.dev",
    "enableCertificates": false
  }
}
```

## Verification

### Check Deployment Status

```bash
# Check all stacks
npm run automation status

# Check specific stack
pulumi stack output --stack shared-services-primary
```

### Verify Resources

```bash
# List private zones
aws route53 list-hosted-zones \
  --query "HostedZones[?Config.PrivateZone==\`true\`]"

# Check certificate status
aws acm describe-certificate \
  --certificate-arn $(pulumi stack output certificateArn --stack shared-services-primary) \
  --region us-east-1
```

## Stack Outputs

The shared-services stack exports:

```typescript
export const privateZoneId: pulumi.Output<string>;
export const privateZoneName: string;
export const certificateArn: pulumi.Output<string> | undefined;
export const internalDomain: string;
export const lokiEndpoint: string;
export const grafanaEndpoint: string;
export const prometheusEndpoint: string;
export const certificateValidationRecords: pulumi.Output<Array<{
    name: string;
    type: string;
    value: string;
}>> | undefined;
```

## Troubleshooting

### Certificate Stuck in "Pending Validation"

**Check Namecheap records:**
```bash
dig _abc123.us-east-1.internal.srelog.dev CNAME
```

**Verify in Namecheap dashboard:**
- Domain List → Manage → Advanced DNS
- Look for validation CNAME records

**Wait:** DNS propagation can take 5-30 minutes

### ESC Environment Not Found

```bash
# List environments
pulumi env ls

# Verify environment exists
pulumi env get $ORG/namecheap-credentials
```

### Configuration Not Applied

The automation API reads configuration from `deployment-config.json`. Ensure:
1. DNS component is added to the stack's components array
2. Configuration values are correct
3. Stack is redeployed after config changes

```bash
# Redeploy with updated config
npm run automation deploy -- --stack shared-services-primary
```

## Modifying Configuration

### Change Domain Names

Edit `deployment-config.json`:

```json
{
  "config": {
    "baseDomain": "internal.mycompany.com",
    "parentDomain": "mycompany.com"
  }
}
```

Then redeploy:

```bash
npm run deploy
```

### Switch Validation Method

Edit `deployment-config.json`:

```json
{
  "config": {
    "certificateValidationMethod": "route53"
  }
}
```

**Note:** Changing validation method will recreate the certificate.

### Disable Certificates

Edit `deployment-config.json`:

```json
{
  "config": {
    "enableCertificates": false
  }
}
```

## Cost

- Route53 private zones: $0.50/month × 2 = **$1.00/month**
- Route53 queries (VPC): **Free**
- ACM certificates: **Free**
- **Total: $1.00/month**

## Integration with Services

### Using DNS in Service Deployments

Reference the shared-services stack outputs:

```typescript
import * as pulumi from "@pulumi/pulumi";

// Get shared-services outputs
const sharedServices = new pulumi.StackReference("shared-services-primary");
const privateZoneId = sharedServices.getOutput("privateZoneId");
const certificateArn = sharedServices.getOutput("certificateArn");

// Create service DNS record
const lokiRecord = new aws.route53.Record("loki", {
    zoneId: privateZoneId,
    name: "loki.us-east-1.internal.srelog.dev",
    type: "A",
    aliases: [{
        name: lokiAlb.dnsName,
        zoneId: lokiAlb.zoneId,
        evaluateTargetHealth: true,
    }],
});

// Use certificate with ALB
const listener = new aws.lb.Listener("https", {
    loadBalancerArn: alb.arn,
    port: 443,
    protocol: "HTTPS",
    certificateArn: certificateArn,
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn,
    }],
});
```

## Summary

✅ Configuration managed in `deployment-config.json`
✅ Deployed via automation API
✅ Supports multiple validation methods
✅ Flexible and configurable per region
✅ Integrated with Pulumi ESC for secrets

For detailed deployment steps, see `SHARED_SERVICES_DNS_DEPLOYMENT.md`.
