# Deployment Configuration Guide

## Overview

The `deployment-config.json` file is the single source of truth for your infrastructure deployment. All configuration is managed here - no manual Pulumi YAML files needed.

## Structure

```json
{
  "name": "project-name",
  "description": "Project description",
  "defaultRegion": "us-east-1",
  "defaultTags": { ... },
  "stacks": [ ... ],
  "deploymentOptions": { ... }
}
```

## Routing Groups Configuration

Routing groups are configured directly in the Transit Gateway component config within each stack:

```json
{
  "stacks": [
    {
      "name": "shared-services-primary",
      "components": [
        {
          "type": "transit-gateway",
          "config": {
            "enableRouteTableIsolation": true,
            "routingGroups": {
              "production": {
                "description": "Production workloads",
                "allowedGroups": [],
                "tags": { "Environment": "Production" }
              }
            }
          }
        }
      ]
    }
  ]
}
```

### Key Points

1. **Hub is automatic** - Don't define "hub" in routing groups, it's created automatically
2. **Keep it simple** - Only define routing groups you actually need
3. **Consistent across regions** - Use the same routing groups in primary and secondary regions
4. **allowedGroups** - List other routing groups this group can communicate with (hub access is automatic)

## Adding More Routing Groups

When you need additional environments (dev, test, staging), add them to the `routingGroups` object:

```json
{
  "routingGroups": {
    "production": {
      "allowedGroups": []
    },
    "development": {
      "description": "Development environment",
      "allowedGroups": ["test"],
      "tags": { "Environment": "Development" }
    },
    "test": {
      "description": "Test environment",
      "allowedGroups": ["development"],
      "tags": { "Environment": "Test" }
    }
  }
}
```

Then assign workload VPCs to routing groups:

```json
{
  "type": "spoke-vpc",
  "config": {
    "cidrBlock": "10.5.0.0/16",
    "routingGroup": "development"
  }
}
```

## Disabling Routing Groups

To use a simple flat network (all VPCs can communicate):

```json
{
  "type": "transit-gateway",
  "config": {
    "enableRouteTableIsolation": false
  }
}
```

## Deployment

```bash
# Deploy all stacks
npm run deploy

# Deploy specific stack
npm run automation deploy -- --stack shared-services-primary

# Validate configuration
npm run automation validate
```

## Best Practices

1. **Start simple** - Begin with just production, add more routing groups as needed
2. **Document allowedGroups** - Use descriptions to explain why groups can communicate
3. **Consistent naming** - Use the same routing group names across all regions
4. **Test isolation** - Verify that blocked paths are actually blocked after deployment

## Example: Current Configuration

Your current setup:
- **Routing groups enabled**: Yes
- **Routing groups defined**: `production` only
- **Hub**: Automatic (accessible by all)
- **Production**: Isolated (can only access hub)

This provides network segmentation while keeping the configuration simple and maintainable.
