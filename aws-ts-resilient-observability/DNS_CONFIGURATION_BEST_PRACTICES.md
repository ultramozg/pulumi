# DNS Configuration Best Practices

## ✅ Configuration Management

### Required Configuration (deployment-config.json)

All DNS configuration **must** be defined in `deployment-config.json`:

```json
{
  "type": "dns",
  "config": {
    "region": "us-east-1",
    "baseDomain": "internal.srelog.dev",        // ✅ Required
    "parentDomain": "srelog.dev",               // ✅ Required
    "enableCertificates": true,                 // Optional (default: true)
    "certificateValidationMethod": "namecheap"  // Optional (default: "namecheap")
  }
}
```

### Why No Hardcoded Defaults?

**❌ Bad Practice:**
```typescript
const baseDomain = config.get("baseDomain") || "internal.srelog.dev";  // Hardcoded!
const parentDomain = config.get("parentDomain") || "srelog.dev";       // Hardcoded!
```

**✅ Good Practice:**
```typescript
const baseDomain = config.require("baseDomain");    // Must be in config
const parentDomain = config.require("parentDomain"); // Must be in config
```

**Reasons:**
1. **Explicit Configuration**: Forces explicit declaration in deployment-config.json
2. **Environment Awareness**: Different environments may use different domains
3. **No Hidden Defaults**: All configuration is visible in one place
4. **Fail Fast**: Deployment fails immediately if required config is missing
5. **Documentation**: deployment-config.json serves as documentation

## Configuration Hierarchy

### 1. Required Values (Must be in deployment-config.json)

```json
{
  "baseDomain": "internal.srelog.dev",
  "parentDomain": "srelog.dev"
}
```

**Validation:** Deployment fails if missing

### 2. All Other Required Values

```json
{
  "enableCertificates": true,
  "certificateValidationMethod": "namecheap"
}
```

**Validation:** Deployment fails if missing

### 3. Secrets (Pulumi ESC)

```yaml
# Pulumi ESC: namecheap-credentials
namecheapApiUser: "secret-value"
namecheapApiKey: "secret-value"
namecheapUsername: "secret-value"
```

**Validation:** Required only if using Namecheap validation

## Configuration Examples

### Example 1: Production (Current Setup)

```json
{
  "stacks": [
    {
      "name": "shared-services-primary",
      "components": [
        {
          "type": "dns",
          "config": {
            "region": "us-east-1",
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

### Example 2: Development Environment

```json
{
  "stacks": [
    {
      "name": "shared-services-dev",
      "components": [
        {
          "type": "dns",
          "config": {
            "region": "us-east-1",
            "baseDomain": "internal.dev.srelog.dev",
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

### Example 3: Different Organization

```json
{
  "stacks": [
    {
      "name": "shared-services-primary",
      "components": [
        {
          "type": "dns",
          "config": {
            "region": "us-east-1",
            "baseDomain": "internal.mycompany.com",
            "parentDomain": "mycompany.com",
            "enableCertificates": true,
            "certificateValidationMethod": "route53"
          }
        }
      ]
    }
  ]
}
```

## Validation Strategy

### At Deployment Time

```typescript
// shared-services/index.ts
const baseDomain = config.require("baseDomain");    // Throws if missing
const parentDomain = config.require("parentDomain"); // Throws if missing
```

**Error Message:**
```
error: Missing required configuration variable 'shared-services:baseDomain'
    please set a value using the command `pulumi config set shared-services:baseDomain <value>`
```

### Automation API Validation

The automation API should validate configuration before deployment:

```typescript
// automation/config-manager.ts
function validateDnsConfig(config: any) {
    if (!config.baseDomain) {
        throw new Error("DNS component requires 'baseDomain' in config");
    }
    if (!config.parentDomain) {
        throw new Error("DNS component requires 'parentDomain' in config");
    }
}
```

## Migration Guide

### If You Have Hardcoded Values

**Before:**
```typescript
const baseDomain = config.get("baseDomain") || "internal.srelog.dev";
```

**After:**
1. Add to deployment-config.json:
```json
{
  "config": {
    "baseDomain": "internal.srelog.dev"
  }
}
```

2. Update code:
```typescript
const baseDomain = config.require("baseDomain");
```

## Environment-Specific Configuration

### Using Multiple Config Files

```bash
deployment-config.prod.json
deployment-config.dev.json
deployment-config.staging.json
```

Each with appropriate domain values:

**Production:**
```json
{
  "baseDomain": "internal.srelog.dev",
  "parentDomain": "srelog.dev"
}
```

**Development:**
```json
{
  "baseDomain": "internal.dev.srelog.dev",
  "parentDomain": "srelog.dev"
}
```

**Staging:**
```json
{
  "baseDomain": "internal.staging.srelog.dev",
  "parentDomain": "srelog.dev"
}
```

## Security Best Practices

### ✅ Do's

1. **Store domains in deployment-config.json**
2. **Store secrets in Pulumi ESC**
3. **Use `config.require()` for critical values**
4. **Document required configuration**
5. **Validate configuration early**

### ❌ Don'ts

1. **Don't hardcode domain names in code**
2. **Don't store secrets in deployment-config.json**
3. **Don't use defaults for environment-specific values**
4. **Don't commit secrets to version control**
5. **Don't skip validation**

## Summary

✅ **All configuration in deployment-config.json**
✅ **No hardcoded defaults for domains**
✅ **Explicit validation with `config.require()`**
✅ **Secrets in Pulumi ESC**
✅ **Environment-specific configuration files**

This approach ensures:
- **Transparency**: All configuration visible in one place
- **Flexibility**: Easy to change per environment
- **Safety**: Fails fast if configuration is missing
- **Documentation**: Config file serves as documentation
