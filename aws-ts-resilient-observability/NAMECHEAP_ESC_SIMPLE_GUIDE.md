# Namecheap + Pulumi ESC - Simple Guide

## TL;DR

You need **2 things** from Namecheap:
1. **Username** (your account name)
2. **API Key** (from API Access settings)

Store them in Pulumi ESC with **2 commands**:
```bash
pulumi env set <org>/namecheap-credentials --secret username "your-username"
pulumi env set <org>/namecheap-credentials --secret apiKey "your-api-key"
```

Done! ✅

## Visual Guide

### What You Have vs What You Need

```
┌─────────────────────────────────────┐
│  What You Have from Namecheap      │
├─────────────────────────────────────┤
│  ✅ Account Username: "johndoe"     │
│  ✅ API Key: "abc123..."            │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  What Goes in Pulumi ESC           │
├─────────────────────────────────────┤
│  Environment: namecheap-credentials │
│    ├─ username: "johndoe"           │
│    └─ apiKey: "abc123..."           │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  How Code Uses It                  │
├─────────────────────────────────────┤
│  apiUser: username                  │
│  apiKey: apiKey                     │
│  userName: username (same value)    │
└─────────────────────────────────────┘
```

## Why Only 2 Values?

The Namecheap provider needs 3 parameters:
- `apiUser`
- `apiKey`
- `userName`

But `apiUser` and `userName` are **the same value** (your username)!

So you only need to provide:
- ✅ `username` → used for both `apiUser` and `userName`
- ✅ `apiKey` → used for `apiKey`

## Step-by-Step Setup

### Step 1: Get Credentials from Namecheap

**Username:**
1. Log into Namecheap
2. Look at top-right corner → your username is displayed
3. Example: `johndoe`

**API Key:**
1. Go to Profile → Tools → API Access
2. Enable API access (requires $50+ balance)
3. Copy the API key
4. Example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### Step 2: Store in Pulumi ESC

```bash
# Get your Pulumi organization
ORG=$(pulumi whoami -v | grep "URL" | awk '{print $2}' | cut -d'/' -f4)

# Create ESC environment (one-time)
pulumi env init $ORG/namecheap-credentials

# Store username
pulumi env set $ORG/namecheap-credentials --secret username "johndoe"

# Store API key
pulumi env set $ORG/namecheap-credentials --secret apiKey "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
```

### Step 3: Verify

```bash
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

✅ Secrets are encrypted and masked!

### Step 4: Reference in Pulumi.yaml

```yaml
# shared-services/Pulumi.yaml
environment:
  - namecheap-credentials
```

### Step 5: Deploy

```bash
npm run deploy
```

## Why This Naming Convention?

### Environment Name: `namecheap-credentials`

✅ **Good:**
- Clear what it contains
- Groups related secrets
- Follows naming conventions

❌ **Not needed:**
- `namecheap-api-credentials` (redundant)
- `nc-creds` (unclear abbreviation)

### Secret Names: `username` and `apiKey`

✅ **Good:**
- Simple and clear
- No redundant prefixes (environment name already says "namecheap")
- Matches common conventions

❌ **Not needed:**
- `namecheapUsername` (redundant - environment already says "namecheap")
- `namecheapApiKey` (redundant)
- `nc_username` (unclear abbreviation)

**The environment name provides context, so secret names can be simple!**

## Comparison: Verbose vs Simple

### ❌ Verbose (Redundant)

```bash
# Environment: namecheap-credentials
pulumi env set $ORG/namecheap-credentials --secret namecheapApiUser "..."
pulumi env set $ORG/namecheap-credentials --secret namecheapApiKey "..."
pulumi env set $ORG/namecheap-credentials --secret namecheapUsername "..."
```

**Problems:**
- "namecheap" repeated 4 times
- 3 secrets when only 2 values exist
- Confusing (apiUser vs username)

### ✅ Simple (Clean)

```bash
# Environment: namecheap-credentials
pulumi env set $ORG/namecheap-credentials --secret username "..."
pulumi env set $ORG/namecheap-credentials --secret apiKey "..."
```

**Benefits:**
- Clear and concise
- Only 2 secrets (matches what you have)
- No redundancy

## How It Works in Code

```typescript
// Read from ESC environment "namecheap-credentials"
const username = config.requireSecret("username");
const apiKey = config.requireSecret("apiKey");

// Configure provider (username used twice)
const namecheapProvider = new namecheap.Provider("namecheap", {
    apiUser: username,      // Your account username
    apiKey: apiKey,         // Your API key
    userName: username,     // Same as apiUser
    useSandbox: false,
});
```

**Why is `username` used twice?**
- Namecheap API requires both `apiUser` and `userName`
- They're almost always the same value
- Historical reasons from the Terraform provider

## Common Questions

### Q: Do I need my email address?
**A:** No, use your account username (not email).

### Q: What if apiUser and userName are different?
**A:** In 99% of cases they're the same. Only different if managing domains for another account (advanced use case).

### Q: Can I use different names for the secrets?
**A:** Yes! Just update the code to match:
```typescript
const username = config.requireSecret("myCustomName");
```

### Q: Is this secure?
**A:** Yes! Pulumi ESC:
- Encrypts secrets at rest
- Masks secrets in logs
- Supports RBAC for team access
- Integrates with cloud secret managers

### Q: Can I use environment variables instead?
**A:** Yes, but ESC is recommended for better security and team collaboration.

## Troubleshooting

### "Missing required configuration variable"

**Error:**
```
error: Missing required configuration variable 'shared-services:username'
```

**Fix:**
```bash
# Make sure ESC environment is referenced in Pulumi.yaml
cat shared-services/Pulumi.yaml | grep -A 2 "environment:"

# Should show:
# environment:
#   - namecheap-credentials
```

### "API key is invalid"

**Fix:**
1. Verify API key in Namecheap dashboard
2. Re-copy and re-set:
```bash
pulumi env set $ORG/namecheap-credentials --secret apiKey "correct-key"
```

### "IP not whitelisted"

**Fix:**
1. Go to Namecheap → Profile → Tools → API Access
2. Add your IP to whitelist
3. Or use `0.0.0.0/0` for any IP (less secure)

## Summary

### What You Need
- ✅ Namecheap username
- ✅ Namecheap API key

### What You Store
```bash
pulumi env set <org>/namecheap-credentials --secret username "..."
pulumi env set <org>/namecheap-credentials --secret apiKey "..."
```

### Why It's Simple
- Environment name provides context (`namecheap-credentials`)
- Secret names are clean (`username`, `apiKey`)
- No redundancy or confusion
- Only 2 values (matches what you actually have)

**Clean, simple, and secure! 🎉**
