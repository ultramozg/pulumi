# Namecheap Credentials Setup Guide

## What You Need from Namecheap

You only need **2 values** from Namecheap:

1. **Username** (Account Name) - Your Namecheap account username
2. **API Key** - Your Namecheap API key

## Where to Find These Values

### 1. Username (Account Name)

This is your Namecheap account username. You can find it:
- In the top-right corner when logged into Namecheap
- In your account settings
- It's the username you use to log in

**Example:** `myusername` or `john.doe`

### 2. API Key

To get your API key:

1. Log into Namecheap
2. Go to **Profile** → **Tools** → **API Access**
3. Enable API access (requires $50+ account balance or purchases)
4. Copy your **API Key**

**Example:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

## Pulumi ESC Configuration

### Simple Approach (Recommended)

Since the ESC environment is already named `namecheap-credentials`, we just need to store the two values:

```bash
# Get your organization
ORG=$(pulumi whoami -v | grep "URL" | awk '{print $2}' | cut -d'/' -f4)

# Create ESC environment
pulumi env init $ORG/namecheap-credentials

# Set username (your Namecheap account name)
pulumi env set $ORG/namecheap-credentials --secret username "your-account-name"

# Set API key
pulumi env set $ORG/namecheap-credentials --secret apiKey "your-api-key-here"
```

### Why This Naming?

**Environment name:** `namecheap-credentials`
- Clearly indicates this is for Namecheap
- Groups related credentials together

**Secret names:** `username` and `apiKey`
- Simple and clear
- No redundant prefixes (environment name already says "namecheap")
- Follows common naming conventions

### Alternative: Explicit Naming

If you prefer more explicit names:

```bash
pulumi env set $ORG/namecheap-credentials --secret namecheapUsername "your-account-name"
pulumi env set $ORG/namecheap-credentials --secret namecheapApiKey "your-api-key-here"
```

Then update `shared-services/index.ts`:
```typescript
const username = config.requireSecret("namecheapUsername");
const apiKey = config.requireSecret("namecheapApiKey");
```

## Complete Setup Example

### Step 1: Get Your Credentials

From Namecheap:
- **Username:** `johndoe`
- **API Key:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### Step 2: Create ESC Environment

```bash
# Get organization
ORG=$(pulumi whoami -v | grep "URL" | awk '{print $2}' | cut -d'/' -f4)

# Create environment
pulumi env init $ORG/namecheap-credentials

# Set credentials
pulumi env set $ORG/namecheap-credentials --secret username "johndoe"
pulumi env set $ORG/namecheap-credentials --secret apiKey "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
```

### Step 3: Verify

```bash
# View environment (secrets will be masked)
pulumi env get $ORG/namecheap-credentials
```

**Output:**
```yaml
values:
  username:
    fn::secret: "***"
  apiKey:
    fn::secret: "***"
```

### Step 4: Add to Pulumi.yaml

```yaml
# shared-services/Pulumi.yaml
name: shared-services
runtime:
  name: nodejs

environment:
  - namecheap-credentials
```

### Step 5: Deploy

```bash
npm run deploy
```

## How It Works

### In Code (shared-services/index.ts)

```typescript
// Read from ESC environment "namecheap-credentials"
const username = config.requireSecret("username");
const apiKey = config.requireSecret("apiKey");

// Configure Namecheap provider
const namecheapProvider = new namecheap.Provider("namecheap", {
    apiUser: username,      // Your account username
    apiKey: apiKey,         // Your API key
    userName: username,     // Same as apiUser (for domain ownership)
    useSandbox: false,
});
```

### Namecheap Provider Parameters

The Namecheap provider requires 3 parameters, but only 2 unique values:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `apiUser` | username | Your Namecheap account username |
| `apiKey` | apiKey | Your Namecheap API key |
| `userName` | username | Same as apiUser (account that owns the domain) |

**Why is `userName` the same as `apiUser`?**
- Namecheap API requires both for historical reasons
- In most cases, they're the same (your account username)
- Only different if managing domains for another account

## Troubleshooting

### "API key is invalid"

**Check:**
1. API key is correct (copy-paste from Namecheap)
2. API access is enabled in Namecheap dashboard
3. No extra spaces in the key

**Fix:**
```bash
# Re-set the API key
pulumi env set $ORG/namecheap-credentials --secret apiKey "correct-key-here"
```

### "IP not whitelisted"

**Check:**
1. Your IP is whitelisted in Namecheap dashboard
2. Go to Profile → Tools → API Access → Whitelisted IPs

**Fix:**
- Add your current IP address
- Or use `0.0.0.0/0` for any IP (less secure)

### "Username not found"

**Check:**
1. Username is your Namecheap account username
2. Not your email address
3. Case-sensitive

**Fix:**
```bash
# Re-set with correct username
pulumi env set $ORG/namecheap-credentials --secret username "correct-username"
```

### "Environment not found"

**Check:**
```bash
# List environments
pulumi env ls

# Should see: namecheap-credentials
```

**Fix:**
```bash
# Create environment
pulumi env init $ORG/namecheap-credentials
```

## Security Best Practices

### ✅ Do's

1. **Store in Pulumi ESC** - Encrypted at rest
2. **Use `--secret` flag** - Marks as sensitive
3. **Rotate keys regularly** - Generate new API keys periodically
4. **Limit IP whitelist** - Only allow necessary IPs
5. **Use separate keys per environment** - Different keys for dev/prod

### ❌ Don'ts

1. **Don't commit to git** - Never commit credentials
2. **Don't share keys** - Each developer should have their own
3. **Don't use in logs** - Secrets are automatically masked
4. **Don't hardcode** - Always use ESC or environment variables
5. **Don't use production keys in dev** - Separate keys per environment

## Alternative: Environment Variables

If you prefer environment variables over ESC:

```bash
# Set environment variables
export NAMECHEAP_USERNAME="your-username"
export NAMECHEAP_API_KEY="your-api-key"

# Update code to read from env vars
const username = process.env.NAMECHEAP_USERNAME!;
const apiKey = process.env.NAMECHEAP_API_KEY!;
```

**Note:** ESC is recommended for better security and team collaboration.

## Summary

### What You Need
- ✅ Namecheap account username
- ✅ Namecheap API key

### What You Don't Need
- ❌ Separate "apiUser" (it's the same as username)
- ❌ Separate "userName" (it's the same as username)
- ❌ Email address (use username instead)

### ESC Configuration
```bash
pulumi env set $ORG/namecheap-credentials --secret username "your-username"
pulumi env set $ORG/namecheap-credentials --secret apiKey "your-api-key"
```

### Simple and Clean! 🎉
