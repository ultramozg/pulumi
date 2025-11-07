# Policy Pack Integration with Automation API

## Overview

This policy pack is automatically integrated with the Pulumi Automation API in the deployment orchestrator.

## Implementation

Policies are applied at the operation level in `automation/deployment-orchestrator.ts`:

```typescript
// Preview with policies
const previewResult = await stack.preview({
    policyPacks: ["./policies"],
    onOutput: (out) => { ... }
});

// Deploy with policies
const result = await stack.up({
    policyPacks: ["./policies"],
    onOutput: (out) => { ... }
});
```

## Automatic Application

When you run:
- `npm run deploy`
- `npm run preview`
- `npm run automation deploy`
- Any automation CLI command

The policy pack from `./policies` is automatically applied to all stack operations.

## Advisory Mode

Policies run in **advisory mode** by default:
- Violations are reported as warnings
- Deployments proceed even with violations
- Helps teams adopt policies gradually

## Environment-Based Enforcement

The policy pack automatically adjusts enforcement based on environment:

```typescript
// Detected from:
// 1. PULUMI_STACK environment variable
// 2. NODE_ENV environment variable
// 3. Stack name (checks for "prod", "staging", etc.)

const config = getPolicyConfig(); // Returns dev/staging/prod config
```

## Policy Pack Location

The policy pack must be at `./policies` relative to the project root:

```
aws-ts-resilient-observability/
├── policies/
│   ├── index.ts              # Main policy pack
│   ├── custom-policies.ts    # Custom policies
│   ├── policy-config.ts      # Environment configs
│   └── package.json
└── automation/
    └── deployment-orchestrator.ts  # Applies policies
```

## Modifying Policy Behavior

### Change Enforcement Level

Edit `policies/policy-config.ts`:

```typescript
export const devConfig: PolicyConfig = {
    enforcementLevel: "advisory",  // Change to "mandatory"
    awsGuard: {
        all: "advisory",
        overrides: {
            myPolicy: "mandatory",
        }
    }
};
```

### Add New Policies

Edit `policies/custom-policies.ts` and add to the exported array.

### Disable Policies Temporarily

Comment out the `policyPacks` parameter in `deployment-orchestrator.ts`:

```typescript
const result = await stack.up({
    // policyPacks: ["./policies"],  // Disabled
    onOutput: (out) => { ... }
});
```

## Testing

Test policies without deploying:

```bash
npm run automation preview -- --config deployment-config.json
```

Policy violations will be shown in the output.

## Organization-Wide Enforcement

For organization-wide enforcement (requires Pulumi Team/Enterprise):

```bash
npm run policy:publish
pulumi policy enable <org>/aws-infrastructure-governance latest
```

This makes policies apply to ALL stacks in your organization, not just this project.

## Benefits of Automation API Integration

1. **Automatic**: No need to remember `--policy-pack` flag
2. **Consistent**: All deployments use the same policies
3. **Flexible**: Environment-based enforcement
4. **Gradual**: Advisory mode allows learning
5. **Integrated**: Works with all automation commands
