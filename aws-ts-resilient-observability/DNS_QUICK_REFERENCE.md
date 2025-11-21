# DNS Setup - Quick Reference

## 🚀 Quick Start (3 Steps)

### 1. Configure Pulumi ESC

**You only need 2 values from Namecheap:**
- Your account username (not email)
- Your API key (from Profile → Tools → API Access)

```bash
ORG=$(pulumi whoami -v | grep "URL" | awk '{print $2}' | cut -d'/' -f4)
pulumi env init $ORG/namecheap-credentials
pulumi env set $ORG/namecheap-credentials --secret username "your-namecheap-username"
pulumi env set $ORG/namecheap-credentials --secret apiKey "your-namecheap-api-key"
```

**📖 Detailed guide:** See `NAMECHEAP_CREDENTIALS_GUIDE.md`

### 2. Update Pulumi.yaml
```yaml
# shared-services/Pulumi.yaml
environment:
  - namecheap-credentials
```

### 3. Deploy
```bash
npm run deploy
```

## 📋 Configuration (deployment-config.json)

Already configured! Located in both stacks:

```json
{
  "type": "dns",
  "config": {
    "region": "us-east-1",                      // ✅ Required
    "baseDomain": "internal.srelog.dev",        // ✅ Required
    "parentDomain": "srelog.dev",               // ✅ Required
    "enableCertificates": true,                 // ✅ Required
    "certificateValidationMethod": "namecheap"  // ✅ Required
  }
}
```

**⚠️ All values required:** All DNS configuration must be set in `deployment-config.json`

## 📦 What Gets Deployed

**us-east-1:**
- Zone: `us-east-1.internal.srelog.dev` (private)
- Cert: `*.us-east-1.internal.srelog.dev`

**us-west-2:**
- Zone: `us-west-2.internal.srelog.dev` (private)
- Cert: `*.us-west-2.internal.srelog.dev`

## 🔍 Verification

```bash
# Check deployment
npm run automation status

# Check certificate
aws acm describe-certificate \
  --certificate-arn $(pulumi stack output certificateArn --stack shared-services-primary) \
  --region us-east-1

# List private zones
aws route53 list-hosted-zones --query "HostedZones[?Config.PrivateZone==\`true\`]"
```

## 💰 Cost

**$1.00/month** (2 private zones × $0.50)

## 📚 Documentation

- **DNS_AUTOMATION_API_GUIDE.md** - Full automation API guide
- **SHARED_SERVICES_DNS_DEPLOYMENT.md** - Detailed deployment steps
- **DNS_FINAL_INTEGRATION_SUMMARY.md** - Complete integration summary
- **components/aws/acm/README.md** - ACM component docs

## 🛠️ Common Commands

```bash
# Deploy all
npm run deploy

# Deploy specific stack
npm run automation deploy -- --stack shared-services-primary

# Preview changes
npm run automation preview -- --stack shared-services-primary

# Check status
npm run automation status

# Destroy
npm run automation destroy -- --stack shared-services-primary
```

## 🔧 Configuration Options

Edit `deployment-config.json` (all required):

```json
{
  "baseDomain": "internal.srelog.dev",           // ✅ Required
  "parentDomain": "srelog.dev",                  // ✅ Required
  "enableCertificates": true,                    // ✅ Required
  "certificateValidationMethod": "namecheap"     // ✅ Required (namecheap|route53|manual)
}
```

## 📤 Stack Outputs

```typescript
privateZoneId              // Route53 zone ID
privateZoneName            // us-east-1.internal.srelog.dev
certificateArn             // ACM certificate ARN
internalDomain             // us-east-1.internal.srelog.dev
lokiEndpoint               // loki.us-east-1.internal.srelog.dev
grafanaEndpoint            // grafana.us-east-1.internal.srelog.dev
prometheusEndpoint         // prometheus.us-east-1.internal.srelog.dev
```

## 🎯 Using in Services

```typescript
// Get shared-services outputs
const sharedServices = new pulumi.StackReference("shared-services-primary");
const zoneId = sharedServices.getOutput("privateZoneId");
const certArn = sharedServices.getOutput("certificateArn");

// Create DNS record
new aws.route53.Record("loki", {
    zoneId: zoneId,
    name: "loki.us-east-1.internal.srelog.dev",
    type: "A",
    aliases: [{ name: alb.dnsName, zoneId: alb.zoneId }],
});

// Use certificate
new aws.lb.Listener("https", {
    loadBalancerArn: alb.arn,
    port: 443,
    protocol: "HTTPS",
    certificateArn: certArn,
});
```

## ⚠️ Troubleshooting

**Certificate pending?**
- Wait 5-30 minutes for DNS propagation
- Check Namecheap dashboard for validation records

**ESC not found?**
```bash
pulumi env ls
pulumi env get $ORG/namecheap-credentials
```

**Config not applied?**
```bash
# Redeploy
npm run automation deploy -- --stack shared-services-primary
```

## ✅ Ready!

Everything is configured in `deployment-config.json`. Just run:

```bash
npm run deploy
```
