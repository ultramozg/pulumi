# Pulumi ESC Setup - Quick Reference

## What is Pulumi ESC?

Pulumi ESC (Environments, Secrets, and Configuration) is a centralized secrets management service that:
- Encrypts secrets at rest
- Provides environment-based configuration
- Integrates seamlessly with Pulumi stacks
- Supports secret rotation and versioning

## Setup Commands

### 1. Create Environment

```bash
# Get your organization
ORG=$(pulumi whoami -v | grep "URL" | awk '{print $2}' | cut -d'/' -f4)

# Create new environment
pulumi env init $ORG/namecheap-credentials
```

### 2. Set Secrets

```bash
# Set individual secrets
pulumi env set $ORG/namecheap-credentials --secret namecheapApiUser "your-api-user"
pulumi env set $ORG/namecheap-credentials --secret namecheapApiKey "your-api-key-here"
pulumi env set $ORG/namecheap-credentials --secret namecheapUsername "your-username"
```

### 3. View Environment

```bash
# Open environment (secrets will be masked with ***)
pulumi env open $ORG/namecheap-credentials

# List all environments
pulumi env ls
```

### 4. Edit Environment (Advanced)

```bash
# Edit environment YAML directly
pulumi env edit $ORG/namecheap-credentials
```

Example ESC environment YAML:

```yaml
values:
  namecheapApiUser:
    fn::secret: "your-api-user"
  namecheapApiKey:
    fn::secret: "your-api-key-here"
  namecheapUsername:
    fn::secret: "your-username"
```

## Using ESC in Pulumi Stacks

### Method 1: Stack Configuration (Recommended)

Add to `Pulumi.yaml`:

```yaml
name: shared-services
runtime:
  name: nodejs

# Import environment
environment:
  - namecheap-credentials
```

Access in code:

```typescript
const config = new pulumi.Config();
const apiUser = config.requireSecret("namecheapApiUser");
const apiKey = config.requireSecret("namecheapApiKey");
const username = config.requireSecret("namecheapUsername");
```

### Method 2: Stack-Specific Import

Add to `Pulumi.<stack-name>.yaml`:

```yaml
environment:
  - namecheap-credentials

config:
  shared-services:isPrimary: "true"
```

### Method 3: CLI Override

```bash
# Use environment for single deployment
pulumi up --env namecheap-credentials
```

## Verification

### Test ESC Access

```bash
# Preview stack to verify ESC integration
pulumi preview --stack shared-services-primary

# Should show: "Importing environment: namecheap-credentials"
```

### Debug ESC Issues

```bash
# Check environment exists
pulumi env get $ORG/namecheap-credentials

# Verify stack configuration
pulumi config --stack shared-services-primary

# Check for ESC errors in logs
pulumi logs --stack shared-services-primary
```

## Security Best Practices

1. **Use separate environments per stage**:
   ```bash
   pulumi env init $ORG/namecheap-prod
   pulumi env init $ORG/namecheap-dev
   ```

2. **Rotate secrets regularly**:
   ```bash
   pulumi env set $ORG/namecheap-credentials --secret namecheapApiKey "new-key"
   ```

3. **Audit access**:
   ```bash
   pulumi env version history $ORG/namecheap-credentials
   ```

4. **Use RBAC** (Pulumi Cloud Teams):
   - Limit who can read/write environments
   - Separate dev/prod access

## Common Issues

### "Environment not found"

```bash
# List available environments
pulumi env ls

# Verify organization name
pulumi whoami -v
```

### "Secret not accessible"

```bash
# Check environment is imported in Pulumi.yaml
cat Pulumi.yaml | grep -A 2 "environment:"

# Verify secret exists
pulumi env get $ORG/namecheap-credentials
```

### "Permission denied"

- Ensure you're logged into correct Pulumi organization
- Check team permissions in Pulumi Cloud console

## Alternative: Local Config (Not Recommended)

If you can't use ESC, store secrets in stack config (less secure):

```bash
# Set as stack secret
pulumi config set --secret namecheapApiKey "your-key" --stack shared-services-primary

# Access in code
const config = new pulumi.Config();
const apiKey = config.requireSecret("namecheapApiKey");
```

**Warning**: Stack secrets are encrypted but stored in stack files. ESC is more secure and centralized.

## Migration from Stack Config to ESC

```bash
# 1. Get existing secrets
pulumi config get namecheapApiKey --stack shared-services-primary

# 2. Move to ESC
pulumi env set $ORG/namecheap-credentials --secret namecheapApiKey "value-from-step-1"

# 3. Remove from stack config
pulumi config rm namecheapApiKey --stack shared-services-primary

# 4. Add ESC environment to Pulumi.yaml
# (see "Using ESC in Pulumi Stacks" above)
```

## Resources

- [Pulumi ESC Documentation](https://www.pulumi.com/docs/pulumi-cloud/esc/)
- [ESC CLI Reference](https://www.pulumi.com/docs/cli/commands/pulumi_env/)
- [Secrets Management Best Practices](https://www.pulumi.com/docs/concepts/secrets/)
