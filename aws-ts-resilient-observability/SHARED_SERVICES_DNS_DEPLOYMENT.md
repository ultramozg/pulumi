# Shared Services DNS Deployment Guide

## Overview

This guide walks through deploying DNS and ACM certificates in the shared-services account across both regions (us-east-1 and us-west-2).

## What Gets Deployed

### Per Region (us-east-1 and us-west-2)

1. **Private Route53 Hosted Zone**
   - `us-east-1.internal.srelog.dev` (associated with us-east-1 VPC)
   - `us-west-2.internal.srelog.dev` (associated with us-west-2 VPC)

2. **ACM Wildcard Certificate**
   - `*.us-east-1.internal.srelog.dev`
   - `*.us-west-2.internal.srelog.dev`
   - Validated via Namecheap DNS API

3. **Service Endpoints** (ready for use)
   - `loki.us-east-1.internal.srelog.dev`
   - `grafana.us-east-1.internal.srelog.dev`
   - `prometheus.us-east-1.internal.srelog.dev`
   - (same for us-west-2)

## Prerequisites

### 1. Namecheap API Access

✅ You already have this configured!

- API User
- API Key  
- Username
- Account balance $50+ or $50+ purchases in last 2 years

### 2. Pulumi ESC Environment

Create the environment for Namecheap credentials:

```bash
# Get your organization
ORG=$(pulumi whoami -v | grep "URL" | awk '{print $2}' | cut -d'/' -f4)

# Create environment
pulumi env init $ORG/namecheap-credentials

# Add credentials (will be encrypted)
pulumi env set $ORG/namecheap-credentials --secret namecheapApiUser "your-api-user"
pulumi env set $ORG/namecheap-credentials --secret namecheapApiKey "your-api-key"
pulumi env set $ORG/namecheap-credentials --secret namecheapUsername "your-username"

# Verify
pulumi env get $ORG/namecheap-credentials
```

### 3. Update Pulumi.yaml (ESC Environment)

Add ESC environment to your shared-services Pulumi.yaml:

```yaml
# shared-services/Pulumi.yaml
name: shared-services
runtime:
  name: nodejs

# Import Namecheap credentials
environment:
  - namecheap-credentials
```

### 4. DNS Configuration (Already in deployment-config.json)

The DNS configuration is already set in `deployment-config.json`:

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

**Configuration Options:**
- `baseDomain`: Base domain for internal services (default: "internal.srelog.dev")
- `parentDomain`: Parent domain in Namecheap (default: "srelog.dev")
- `enableCertificates`: Enable ACM certificate creation (default: true)
- `certificateValidationMethod`: "namecheap", "route53", or "manual" (default: "namecheap")

## Deployment Steps

### Step 1: Deploy Using Automation API

The deployment uses the automation API which reads from `deployment-config.json`:

```bash
# Deploy all stacks (including DNS)
npm run deploy

# Or deploy specific stack
npm run automation deploy -- --stack shared-services-primary
```

**Alternative: Manual Deployment**

If you prefer manual deployment:

```bash
cd shared-services

# Preview changes
pulumi preview --stack shared-services-primary

# Deploy
pulumi up --stack shared-services-primary
```

**Expected Output:**
```
Updating (shared-services-primary)

     Type                                    Name                                  Status
 +   pulumi:pulumi:Stack                     shared-services-primary               created
 +   ├─ custom:aws:Route53HostedZone         us-east-1-internal-zone               created
 +   │  └─ aws:route53:Zone                  us-east-1.internal.srelog.dev-zone    created
 +   └─ custom:aws:AcmCertificate            us-east-1-wildcard-cert               created
 +      ├─ aws:acm:Certificate               us-east-1-wildcard-cert-cert          created
 +      └─ namecheap:index:DomainRecords     us-east-1-wildcard-cert-validation    created

Outputs:
    certificateArn       : "arn:aws:acm:us-east-1:123456789012:certificate/abc-123"
    privateZoneId        : "Z1234567890ABC"
    privateZoneName      : "us-east-1.internal.srelog.dev"
    lokiEndpoint         : "loki.us-east-1.internal.srelog.dev"
    grafanaEndpoint      : "grafana.us-east-1.internal.srelog.dev"
    prometheusEndpoint   : "prometheus.us-east-1.internal.srelog.dev"
```

### Step 2: Verify Namecheap Validation Records

1. Log into Namecheap dashboard
2. Navigate to Domain List → Manage → Advanced DNS
3. Verify CNAME records were created:
   - `_abc123.us-east-1.internal` → `_xyz789.acm-validations.aws.`

### Step 3: Wait for Certificate Validation

```bash
# Check certificate status
aws acm describe-certificate \
  --certificate-arn $(pulumi stack output certificateArn --stack shared-services-primary) \
  --region us-east-1 \
  --query 'Certificate.Status'
```

**Expected:** `"ISSUED"` (may take 5-30 minutes)

### Step 4: Deploy Secondary Region (us-west-2)

```bash
# Preview changes
pulumi preview --stack shared-services-secondary

# Deploy
pulumi up --stack shared-services-secondary
```

**Expected Output:**
```
Updating (shared-services-secondary)

     Type                                    Name                                  Status
 +   pulumi:pulumi:Stack                     shared-services-secondary             created
 +   ├─ custom:aws:Route53HostedZone         us-west-2-internal-zone               created
 +   │  └─ aws:route53:Zone                  us-west-2.internal.srelog.dev-zone    created
 +   └─ custom:aws:AcmCertificate            us-west-2-wildcard-cert               created
 +      ├─ aws:acm:Certificate               us-west-2-wildcard-cert-cert          created
 +      └─ namecheap:index:DomainRecords     us-west-2-wildcard-cert-validation    created

Outputs:
    certificateArn       : "arn:aws:acm:us-west-2:123456789012:certificate/def-456"
    privateZoneId        : "Z9876543210XYZ"
    privateZoneName      : "us-west-2.internal.srelog.dev"
    lokiEndpoint         : "loki.us-west-2.internal.srelog.dev"
    grafanaEndpoint      : "grafana.us-west-2.internal.srelog.dev"
    prometheusEndpoint   : "prometheus.us-west-2.internal.srelog.dev"
```

## Verification

### 1. Verify Private Zones

```bash
# List private zones
aws route53 list-hosted-zones \
  --query "HostedZones[?Config.PrivateZone==\`true\`]" \
  --output table

# Check zone details for us-east-1
aws route53 get-hosted-zone \
  --id $(pulumi stack output privateZoneId --stack shared-services-primary)
```

### 2. Verify Certificates

```bash
# Check us-east-1 certificate
aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='*.us-east-1.internal.srelog.dev']"

# Check us-west-2 certificate
aws acm list-certificates --region us-west-2 \
  --query "CertificateSummaryList[?DomainName=='*.us-west-2.internal.srelog.dev']"
```

### 3. Test DNS Resolution (from EC2 in VPC)

```bash
# SSH into an EC2 instance in the shared-services VPC
# Then test DNS resolution

# Should resolve (once you add the record)
dig loki.us-east-1.internal.srelog.dev

# Should NOT resolve from outside VPC (private zone)
```

## Architecture

```
Namecheap (srelog.dev)
  └── ACM validation CNAMEs (auto-managed)
      ├── _abc123.us-east-1.internal → _xyz789.acm-validations.aws.
      └── _def456.us-west-2.internal → _uvw012.acm-validations.aws.

AWS Shared Services Account
├── us-east-1
│   ├── VPC (Hub VPC)
│   ├── Route53 Private Zone: us-east-1.internal.srelog.dev
│   │   └── Associated with Hub VPC
│   └── ACM Certificate: *.us-east-1.internal.srelog.dev
│       └── Status: ISSUED
└── us-west-2
    ├── VPC (Hub VPC)
    ├── Route53 Private Zone: us-west-2.internal.srelog.dev
    │   └── Associated with Hub VPC
    └── ACM Certificate: *.us-west-2.internal.srelog.dev
        └── Status: ISSUED
```

## Next Steps

### 1. Add Service DNS Records

Once you deploy services (Loki, Grafana, etc.) with ALBs:

```typescript
// In your service deployment code
import * as aws from "@pulumi/aws";

const lokiRecord = new aws.route53.Record("loki-record", {
    zoneId: privateZoneId, // From shared-services stack output
    name: `loki.${privateZoneName}`,
    type: "A",
    aliases: [{
        name: lokiAlb.dnsName,
        zoneId: lokiAlb.zoneId,
        evaluateTargetHealth: true,
    }],
});
```

### 2. Configure ALB with Certificate

```typescript
const listener = new aws.lb.Listener("https-listener", {
    loadBalancerArn: alb.arn,
    port: 443,
    protocol: "HTTPS",
    certificateArn: certificateArn, // From shared-services stack output
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn,
    }],
});
```

### 3. Update Application Configs

Update your observability services to use internal DNS:

```yaml
# Grafana datasource config
datasources:
  - name: Loki
    type: loki
    url: https://loki.us-east-1.internal.srelog.dev
    
  - name: Prometheus
    type: prometheus
    url: https://prometheus.us-east-1.internal.srelog.dev
```

## Cost

| Resource | Cost per Region | Total (2 regions) |
|----------|----------------|-------------------|
| Route53 Private Zone | $0.50/month | $1.00/month |
| Route53 Queries (VPC) | Free | Free |
| ACM Certificate | Free | Free |
| **Total** | **$0.50/month** | **$1.00/month** |

## Troubleshooting

### Certificate Stuck in "Pending Validation"

**Check Namecheap records:**
```bash
dig _abc123.us-east-1.internal.srelog.dev CNAME
```

**Verify in Namecheap dashboard:**
- Domain List → Manage → Advanced DNS
- Look for validation CNAME records

**Wait for DNS propagation:** 5-30 minutes

### Private Zone Not Resolving

**Check VPC DNS settings:**
```bash
aws ec2 describe-vpc-attribute \
  --vpc-id $(pulumi stack output hubVpcId --stack shared-services-primary) \
  --attribute enableDnsHostnames

aws ec2 describe-vpc-attribute \
  --vpc-id $(pulumi stack output hubVpcId --stack shared-services-primary) \
  --attribute enableDnsSupport
```

Both should be `true`.

### Namecheap API Errors

**"Invalid API key":**
- Verify credentials in Pulumi ESC
- Check API is enabled in Namecheap dashboard

**"IP not whitelisted":**
- Add your IP in Namecheap dashboard → Profile → Tools → API Access

## Rollback

If you need to rollback:

```bash
# Destroy secondary region first
pulumi destroy --stack shared-services-secondary

# Then primary region
pulumi destroy --stack shared-services-primary
```

**Note:** Namecheap validation records will be removed automatically.

## Summary

You now have:
- ✅ Private DNS zones in both regions
- ✅ Wildcard certificates for internal services
- ✅ Automated Namecheap validation
- ✅ Ready for service deployment

Total setup time: ~15-30 minutes (including certificate validation)
