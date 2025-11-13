# Routing Groups Architecture Diagrams

## 1. Traditional Flat Network (Not Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│                    Transit Gateway                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         Single Default Route Table                    │ │
│  │  • All VPCs can reach all other VPCs                 │ │
│  │  • No isolation between environments                 │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
    │  Hub   │    │  Prod  │    │  Dev   │    │  Test  │
    │  VPC   │    │  VPC   │    │  VPC   │    │  VPC   │
    └────────┘    └────────┘    └────────┘    └────────┘
    10.0.0.0/16   10.1.0.0/16   10.2.0.0/16   10.3.0.0/16

❌ Problem: Dev can access Prod, Test can access Prod, etc.
```

## 2. Routing Groups Architecture (Enterprise-Ready)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Transit Gateway                                  │
│                    (Route Table Isolation Enabled)                       │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Hub RT    │  │   Prod RT   │  │   Dev RT    │  │   Test RT   │  │
│  │             │  │             │  │             │  │             │  │
│  │ Routes to:  │  │ Routes to:  │  │ Routes to:  │  │ Routes to:  │  │
│  │ • All VPCs  │  │ • Hub only  │  │ • Hub       │  │ • Hub       │  │
│  │             │  │             │  │ • Test      │  │ • Dev       │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
         │                │                │                │
         ▼                ▼                ▼                ▼
    ┌────────┐      ┌────────┐      ┌────────┐      ┌────────┐
    │  Hub   │      │  Prod  │      │  Dev   │      │  Test  │
    │  VPC   │      │  VPC   │      │  VPC   │      │  VPC   │
    └────────┘      └────────┘      └────────┘      └────────┘
    10.0.0.0/16     10.1.0.0/16     10.2.0.0/16     10.3.0.0/16

✅ Benefit: Prod isolated from Dev/Test, Dev/Test can collaborate
```

## 3. Detailed Communication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                         Hub VPC (10.0.0.0/16)                      │
│                    Shared Services & Monitoring                     │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   Grafana    │  │  Prometheus  │  │     Loki     │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
         │ ✅ Allowed         │ ✅ Allowed         │ ✅ Allowed
         │                    │                    │
    ┌────┴────┐          ┌────┴────┐          ┌────┴────┐
    │         │          │         │          │         │
┌───▼─────────▼───┐  ┌───▼─────────▼───┐  ┌───▼─────────▼───┐
│  Production VPC │  │ Development VPC │  │    Test VPC     │
│  10.1.0.0/16    │  │  10.2.0.0/16    │  │  10.3.0.0/16    │
│                 │  │                 │  │                 │
│  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
│  │ Workloads │  │  │  │ Dev Apps  │  │  │  │ Test Apps │  │
│  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         │                    │ ✅ Allowed         │
         │                    ├────────────────────┤
         │                    │                    │
         │ ❌ Blocked         │ ❌ Blocked         │
         └────────────────────┴────────────────────┘
```

## 4. Route Table Details

### Hub Route Table
```
Destination         Target              Source
─────────────────────────────────────────────────
10.0.0.0/16        Local               Local
10.1.0.0/16        TGW Attachment      Propagated from Prod
10.2.0.0/16        TGW Attachment      Propagated from Dev
10.3.0.0/16        TGW Attachment      Propagated from Test
10.4.0.0/16        TGW Attachment      Propagated from DMZ
```

### Production Route Table
```
Destination         Target              Source
─────────────────────────────────────────────────
10.1.0.0/16        Local               Local
10.0.0.0/16        TGW Attachment      Propagated from Hub
```
**Note**: No routes to Dev (10.2.0.0/16) or Test (10.3.0.0/16)

### Development Route Table
```
Destination         Target              Source
─────────────────────────────────────────────────
10.2.0.0/16        Local               Local
10.0.0.0/16        TGW Attachment      Propagated from Hub
10.3.0.0/16        TGW Attachment      Propagated from Test
```
**Note**: No route to Prod (10.1.0.0/16)

### Test Route Table
```
Destination         Target              Source
─────────────────────────────────────────────────
10.3.0.0/16        Local               Local
10.0.0.0/16        TGW Attachment      Propagated from Hub
10.2.0.0/16        TGW Attachment      Propagated from Dev
```
**Note**: No route to Prod (10.1.0.0/16)

## 5. Multi-Region with Routing Groups

```
┌─────────────────────────────────────────────────────────────────────┐
│                          us-east-1                                  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  Transit Gateway (ASN 64512)                 │ │
│  │                                                              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │ │
│  │  │  Hub RT  │  │ Prod RT  │  │  Dev RT  │  │ Test RT  │   │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│         │              │              │              │            │
│         ▼              ▼              ▼              ▼            │
│    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐        │
│    │  Hub   │    │  Prod  │    │  Dev   │    │  Test  │        │
│    │  VPC   │    │  VPC   │    │  VPC   │    │  VPC   │        │
│    └────────┘    └────────┘    └────────┘    └────────┘        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ TGW Peering
                                  │ (Cross-Region)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          us-west-2                                  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  Transit Gateway (ASN 64513)                 │ │
│  │                                                              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │ │
│  │  │  Hub RT  │  │ Prod RT  │  │  Dev RT  │  │ Test RT  │   │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│         │              │              │              │            │
│         ▼              ▼              ▼              ▼            │
│    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐        │
│    │  Hub   │    │  Prod  │    │  Dev   │    │  Test  │        │
│    │  VPC   │    │  VPC   │    │  VPC   │    │  VPC   │        │
│    └────────┘    └────────┘    └────────┘    └────────┘        │
└─────────────────────────────────────────────────────────────────────┘

Note: Same routing group policies apply in both regions
```

## 6. DMZ Pattern (Public-Facing Services)

```
                         Internet
                            │
                            ▼
                    ┌───────────────┐
                    │  Internet GW  │
                    └───────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      DMZ VPC (10.4.0.0/16)                  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  ALB/NLB     │  │  WAF         │  │  API Gateway │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ ✅ Only Hub Access
                            │    (for logging)
                            ▼
                    ┌───────────────┐
                    │  Transit GW   │
                    │   (DMZ RT)    │
                    └───────────────┘
                            │
                            │ ✅ Allowed
                            ▼
                    ┌───────────────┐
                    │   Hub VPC     │
                    │  (Monitoring) │
                    └───────────────┘
                            
                    ❌ No access to Prod/Dev/Test
```

## 7. Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      Defense in Depth                           │
│                                                                 │
│  Layer 1: Transit Gateway Route Tables (Network Isolation)     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ • Routing groups prevent traffic at network level         │ │
│  │ • No route = no communication possible                    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│  Layer 2: Network ACLs (Subnet-level Firewall)                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ • Stateless firewall rules                                │ │
│  │ • Allow/deny based on IP and port                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│  Layer 3: Security Groups (Instance-level Firewall)           │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ • Stateful firewall rules                                 │ │
│  │ • Allow specific CIDR blocks and ports                    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│  Layer 4: Application-level Authentication                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ • IAM roles and policies                                  │ │
│  │ • Application authentication (OAuth, SAML)                │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 8. Configuration Flow

```
Step 1: Define Routing Groups
┌─────────────────────────────────────┐
│ routingGroups: [                    │
│   { name: "hub", ... },             │
│   { name: "production", ... },      │
│   { name: "development", ... }      │
│ ]                                   │
└─────────────────────────────────────┘
              │
              ▼
Step 2: Create Route Tables
┌─────────────────────────────────────┐
│ TGW creates one route table per     │
│ routing group automatically          │
└─────────────────────────────────────┘
              │
              ▼
Step 3: Attach VPCs
┌─────────────────────────────────────┐
│ tgw.attachVpc("prod-vpc", {         │
│   vpcId: prodVpc.vpcId,             │
│   routingGroup: "production"        │
│ })                                  │
└─────────────────────────────────────┘
              │
              ▼
Step 4: Configure Route Propagation
┌─────────────────────────────────────┐
│ • VPC routes propagate to own RT    │
│ • VPC routes propagate to hub RT    │
│ • VPC routes propagate to allowed   │
│   group RTs                          │
└─────────────────────────────────────┘
              │
              ▼
Step 5: Verify Isolation
┌─────────────────────────────────────┐
│ • Test connectivity between groups  │
│ • Verify blocked paths fail         │
│ • Monitor CloudWatch metrics        │
└─────────────────────────────────────┘
```

## Summary

Routing groups provide:
- ✅ **Network-level isolation** between environments
- ✅ **Controlled hub access** for shared services
- ✅ **Flexible policies** for inter-group communication
- ✅ **Defense in depth** with multiple security layers
- ✅ **Compliance-ready** architecture
- ✅ **Zero additional cost** (included with Transit Gateway)

This is the recommended architecture for enterprise deployments requiring environment isolation.
