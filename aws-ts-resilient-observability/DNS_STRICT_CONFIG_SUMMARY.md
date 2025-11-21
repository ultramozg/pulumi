# DNS Strict Configuration Summary

## ✅ Zero Defaults - All Configuration Required

All DNS configuration values **must** be explicitly defined in `deployment-config.json`. No defaults, no fallbacks.

## Configuration Requirements

### All Values Required

```typescript
// shared-services/index.ts
const baseDomain = config.require("baseDomain");                    // ✅ Required
const parentDomain = config.require("parentDomain");                // ✅ Required
const enableCertificates = config.requireBoolean("enableCertificates"); // ✅ Required
const certificateValidationMethod = config.require("certificateValidationMethod"); // ✅ Required
```

### deployment-config.json

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
  }
}
```

## Why Strict Configuration?

### 1. Explicit Over Implicit
```typescript
// ❌ Bad: Hidden defaults
const domain = config.get("domain") || "default.com";

// ✅ Good: Explicit requirement
const domain = config.require("domain");
```

### 2. Fail Fast
```bash
# Missing config fails immediately at deployment start
error: Missing required configuration variable 'shared-services:baseDomain'
```

### 3. Environment Awareness
```json
// production
{ "baseDomain": "internal.srelog.dev" }

// development
{ "baseDomain": "internal.dev.srelog.dev" }

// staging
{ "baseDomain": "internal.staging.srelog.dev" }
```

### 4. Self-Documenting
All configuration is visible in `deployment-config.json` - no need to read code to understand what values are used.

### 5. No Surprises
Developers can't accidentally deploy with wrong defaults because there are no defaults.

## Configuration Validation

### At Deployment Time

```typescript
// Pulumi validates automatically
config.require("baseDomain");           // Throws if missing
config.requireBoolean("enableCertificates"); // Throws if missing or not boolean
```

### Error Messages

**Missing baseDomain:**
```
error: Missing required configuration variable 'shared-services:baseDomain'
    please set a value using the command `pulumi config set shared-services:baseDomain <value>`
```

**Missing enableCertificates:**
```
error: Missing required configuration variable 'shared-services:enableCertificates'
    please set a value using the command `pulumi config set shared-services:enableCertificates <value>`
```

**Invalid certificateValidationMethod:**
```
error: Missing required configuration variable 'shared-services:certificateValidationMethod'
    please set a value using the command `pulumi config set shared-services:certificateValidationMethod <value>`
```

## Complete Configuration Example

### deployment-config.json

```json
{
  "name": "multi-region-resilient-observability",
  "stacks": [
    {
      "name": "shared-services-primary",
      "workDir": "./shared-services",
      "components": [
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
      ]
    },
    {
      "name": "shared-services-secondary",
      "workDir": "./shared-services",
      "components": [
        {
          "type": "dns",
          "name": "secondary-dns",
          "config": {
            "region": "us-west-2",
            "baseDomain": "internal.srelog.dev",
            "parentDomain": "srelog.dev",
            "enableCertificates": true,
            "certificateValidationMethod": "namecheap"
          }
        }
      ]
    }
  ]
}
```

## Configuration Options

### baseDomain (Required)

**Type:** `string`
**Description:** Base domain for internal services
**Example:** `"internal.srelog.dev"`

Creates zones like:
- `us-east-1.internal.srelog.dev`
- `us-west-2.internal.srelog.dev`

### parentDomain (Required)

**Type:** `string`
**Description:** Parent domain in DNS provider (for certificate validation)
**Example:** `"srelog.dev"`

Used for:
- ACM certificate validation records
- Must be managed in your DNS provider (Namecheap, Route53, etc.)

### enableCertificates (Required)

**Type:** `boolean`
**Description:** Enable ACM certificate creation
**Values:** `true` or `false`

**When to use `false`:**
- DNS-only deployment
- Using external certificate management
- Testing DNS setup without certificates

### certificateValidationMethod (Required)

**Type:** `string`
**Description:** Method for ACM certificate validation
**Values:** `"namecheap"`, `"route53"`, or `"manual"`

**namecheap:**
- Automatic validation via Namecheap API
- Requires Pulumi ESC credentials
- Best for Namecheap-managed domains

**route53:**
- Automatic validation via Route53
- Requires public Route53 zone
- Best for AWS-native setups

**manual:**
- Outputs validation records
- Manual creation in any DNS provider
- Best for other DNS providers

## Deployment Checklist

### Before Deployment

- [ ] All DNS config values set in `deployment-config.json`
- [ ] Pulumi ESC configured (if using Namecheap)
- [ ] ESC environment added to `Pulumi.yaml`
- [ ] Configuration validated

### Validation Commands

```bash
# Check deployment-config.json syntax
cat deployment-config.json | jq .

# Verify all required fields present
cat deployment-config.json | jq '.stacks[].components[] | select(.type=="dns") | .config'

# Preview deployment (validates config)
npm run automation preview -- --stack shared-services-primary
```

## Migration from Defaults

### Old Code (With Defaults)

```typescript
const baseDomain = config.get("baseDomain") || "internal.srelog.dev";
const parentDomain = config.get("parentDomain") || "srelog.dev";
const enableCertificates = config.getBoolean("enableCertificates") ?? true;
const certificateValidationMethod = config.get("certificateValidationMethod") || "namecheap";
```

### New Code (Strict)

```typescript
const baseDomain = config.require("baseDomain");
const parentDomain = config.require("parentDomain");
const enableCertificates = config.requireBoolean("enableCertificates");
const certificateValidationMethod = config.require("certificateValidationMethod");
```

### Migration Steps

1. **Add all values to deployment-config.json**
2. **Update code to use `config.require()`**
3. **Test deployment**
4. **Document configuration requirements**

## Benefits Summary

✅ **Explicit Configuration**: All values visible in deployment-config.json
✅ **Fail Fast**: Missing config fails immediately
✅ **Environment-Specific**: Easy to customize per environment
✅ **No Hidden Defaults**: No surprises from hardcoded values
✅ **Self-Documenting**: Config file is the documentation
✅ **Type Safety**: Boolean values validated as booleans
✅ **Automation-Friendly**: Perfect for CI/CD pipelines

## Anti-Patterns to Avoid

### ❌ Don't Use Defaults

```typescript
// ❌ Bad
const domain = config.get("domain") || "default.com";
```

### ❌ Don't Use Optional for Critical Values

```typescript
// ❌ Bad
const domain = config.get("domain");  // Could be undefined
```

### ❌ Don't Hardcode in Code

```typescript
// ❌ Bad
const domain = "internal.srelog.dev";
```

### ✅ Do Use Required Config

```typescript
// ✅ Good
const domain = config.require("domain");
```

## Summary

**Zero defaults. All configuration explicit. Fail fast. No surprises.**

This approach ensures:
- Complete visibility of configuration
- Environment-specific deployments
- Early detection of configuration errors
- Self-documenting infrastructure
- Production-ready configuration management
