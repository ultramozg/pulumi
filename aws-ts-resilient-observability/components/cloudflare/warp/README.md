# Cloudflare Tunnel (cloudflared) Component

Deploys **cloudflared** into a Kubernetes cluster to create secure tunnels for accessing private services via Cloudflare WARP client.

## Overview

This component provides **zero-trust private access** to your Kubernetes services without exposing them to the internet.

```
Your Laptop (WARP Client) → Cloudflare Zero Trust → Tunnel → EKS Services

✅ No public IPs
✅ No internet exposure
✅ Device + user authentication
✅ Multi-region failover
```

## Quick Start

### 1. Create Cloudflare Tunnel

1. Go to [Cloudflare Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Zero Trust → Networks → Tunnels**
3. Click **Create a tunnel**
4. Choose **Cloudflared** connector
5. Name your tunnel (e.g., `eks-private-tunnel`)
6. Click **Save tunnel**
7. Copy the tunnel token (you'll need this for deployment)

### 2. Configure Deployment

See [warp-private-example.yaml](warp-private-example.yaml) for full example.

```yaml
shared-services:
  enableCloudflareTunnel: true
  cloudflareTunnelToken: "${cloudflare.tunnelToken}"  # From Pulumi ESC
  cloudflareTunnelReplicas: 2
```

### 3. Deploy

```bash
pulumi up -s shared-services-primary    # Creates tunnel
pulumi up -s shared-services-secondary  # Reuses tunnel (optional)
```

### 4. Install WARP Client

```bash
# macOS
brew install --cask cloudflare-warp

# Windows
# Download from https://cloudflarewarp.com/

# Linux
sudo apt install cloudflare-warp
```

### 5. Configure Zero Trust

1. Go to https://one.dash.cloudflare.com/
2. Networks → Tunnels → Your tunnel → Configure
3. Private Network tab → Add your VPC CIDRs:
   - `10.0.0.0/8`
   - `172.16.0.0/12`

### 6. Enroll Device & Connect

1. Open WARP app
2. Settings → Account → Login to Zero Trust
3. Toggle WARP ON
4. Access: `http://grafana.monitoring.svc.cluster.local:3000`

## Configuration Options

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `enableCloudflareTunnel` | Yes | `false` | Enable tunnel deployment |
| `cloudflareTunnelToken` | Yes | - | Tunnel token from Cloudflare Dashboard |
| `cloudflareTunnelReplicas` | No | `2` | Pods per region |
| `cloudflaredImage` | No | `cloudflare/cloudflared:latest` | Cloudflared Docker image |

## Multi-Region Deployment

The component automatically supports multi-region with load balancing:

- **Same tunnel token**: Both regions use the same token
- **Traffic**: Automatically balanced across all cloudflared pods
- **Failover**: Automatic (< 1 second)

Example with 2 regions × 2 replicas = 4 total cloudflared pods connecting to the same tunnel.

## Security Features

✅ **Zero Internet Exposure** - Services never exposed publicly
✅ **Device Authentication** - Only enrolled devices can access
✅ **User Authentication** - Cloudflare Zero Trust login required
✅ **Encrypted Tunnel** - All traffic encrypted via Cloudflare
✅ **Audit Logging** - Track all access in Cloudflare dashboard
✅ **Device Posture** - Optional: Require disk encryption, OS version, etc.

## Cost

- Cloudflare Zero Trust: **FREE** (up to 50 users)
- Cloudflare Tunnel: **FREE** (unlimited traffic)
- Kubernetes pods: **$20-40/month** (2 regions × 2 replicas)

**Total: $20-40/month**

## Troubleshooting

### Cannot reach services

```bash
# Check WARP status
warp-cli status

# Check pods
kubectl get pods -n cloudflare-tunnel

# Check logs
kubectl logs -n cloudflare-tunnel -l app=cloudflared
```

### Connection timeout

1. Verify VPC CIDRs in Cloudflare Zero Trust → Networks → Tunnels
2. Check cloudflared pods are running
3. Verify private network configuration

### Access denied

1. Check enrollment rules in Cloudflare Dashboard
2. Re-enroll device: WARP → Settings → Account → Logout → Login
3. Verify you're connected to correct Zero Trust organization

## Component API

```typescript
import { CloudflareWarpComponent } from "../components/cloudflare/warp";

const tunnel = new CloudflareWarpComponent("my-tunnel", {
    tunnelToken: config.requireSecret("cloudflareTunnelToken"),
    kubernetesProvider: k8sProvider,
    namespace: "cloudflare-tunnel",
    replicas: 2,
    tags: {
        Environment: "production"
    }
});

// Outputs
tunnel.getDeploymentName();     // Kubernetes deployment name
tunnel.getNamespace();          // Kubernetes namespace
```

## Related Resources

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [WARP Client](https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/)
- [Private Networks](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/private-net/)
