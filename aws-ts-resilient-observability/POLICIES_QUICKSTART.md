# CrossGuard Policies - Quick Reference

## Automatic Enforcement

Policies are **automatically applied** to all automation deployments.

```bash
# Just use your normal commands - policies are automatic!
npm run deploy
npm run preview
npm run automation deploy -- --config deployment-config.json
```

## What You Get

✅ **Security**: Encryption, no public IPs, SSL enforcement  
✅ **Logging**: ELB logging, CloudWatch encryption  
✅ **High Availability**: RDS Multi-AZ  
✅ **Compliance**: Required tags, naming conventions  

## Enforcement Mode

- **Advisory by default**: Warnings shown, deployments proceed
- **Environment-aware**: Stricter in staging/prod
- **Automatic detection**: Based on stack name or NODE_ENV

## Policy Violations

Violations appear in deployment output:

```
Policy Violations (1)
  [advisory] ec2-instance-no-public-ip: EC2 instance should not have a public IP
```

Fix violations in your code and redeploy.

## Customization

- Enforcement levels: `policies/policy-config.ts`
- Custom policies: `policies/custom-policies.ts`
- Full docs: `POLICIES.md` and `policies/README.md`

## No Extra Steps Required

Policies are built into the automation orchestrator. Just deploy as usual!
