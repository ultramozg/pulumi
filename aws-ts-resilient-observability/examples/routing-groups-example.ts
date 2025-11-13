/**
 * Example: Transit Gateway with Routing Groups for Network Segmentation
 * 
 * This example demonstrates how to implement enterprise-grade network segmentation
 * using Transit Gateway routing groups. Each routing group has its own route table,
 * providing isolation between different environments while allowing controlled
 * communication with the hub VPC.
 * 
 * Architecture:
 * - Hub VPC: Shared services (monitoring, logging, etc.) - accessible by all groups
 * - Production VPC: Production workloads - isolated from dev/test
 * - Development VPC: Development workloads - can talk to test, not production
 * - Test VPC: Test workloads - can talk to dev, not production
 * - DMZ VPC: Public-facing services - isolated from all except hub
 */

import * as pulumi from "@pulumi/pulumi";
import { TransitGateway } from "../components/aws/transit-gateway";
import { VPCComponent } from "../components/aws/vpc";

// ============================================================================
// STEP 1: Create Transit Gateway with Routing Groups
// ============================================================================

const transitGateway = new TransitGateway("enterprise-tgw", {
    description: "Enterprise Transit Gateway with routing isolation",
    amazonSideAsn: 64512,
    enableRouteTableIsolation: true,
    routingGroups: {
        // Note: 'hub' routing group is automatically created and accessible by all
        
        production: {
            description: "Production workloads - isolated from non-prod",
            allowedGroups: [], // Only hub access (hub is implicit)
            tags: {
                Environment: "Production",
                Criticality: "Critical"
            }
        },
        development: {
            description: "Development workloads - can communicate with test",
            allowedGroups: ["test"], // Hub + test access
            tags: {
                Environment: "Development",
                Criticality: "Low"
            }
        },
        test: {
            description: "Test workloads - can communicate with dev",
            allowedGroups: ["development"], // Hub + dev access
            tags: {
                Environment: "Test",
                Criticality: "Low"
            }
        },
        dmz: {
            description: "DMZ for public-facing services - highly isolated",
            allowedGroups: [], // Only hub access
            tags: {
                Purpose: "PublicFacing",
                Criticality: "High"
            }
        }
    },
    tags: {
        Name: "enterprise-tgw",
        ManagedBy: "Pulumi"
    }
});

// ============================================================================
// STEP 2: Create VPCs for Each Routing Group
// ============================================================================

// Hub VPC - Shared Services
const hubVpc = new VPCComponent("hub-vpc", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        },
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        }
    },
    tags: {
        Name: "hub-vpc",
        RoutingGroup: "hub"
    }
});

// Production VPC
const productionVpc = new VPCComponent("production-vpc", {
    region: "us-east-1",
    cidrBlock: "10.1.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        },
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        }
    },
    tags: {
        Name: "production-vpc",
        RoutingGroup: "production",
        Environment: "Production"
    }
});

// Development VPC
const developmentVpc = new VPCComponent("development-vpc", {
    region: "us-east-1",
    cidrBlock: "10.2.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        },
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        }
    },
    tags: {
        Name: "development-vpc",
        RoutingGroup: "development",
        Environment: "Development"
    }
});

// Test VPC
const testVpc = new VPCComponent("test-vpc", {
    region: "us-east-1",
    cidrBlock: "10.3.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        },
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        }
    },
    tags: {
        Name: "test-vpc",
        RoutingGroup: "test",
        Environment: "Test"
    }
});

// DMZ VPC
const dmzVpc = new VPCComponent("dmz-vpc", {
    region: "us-east-1",
    cidrBlock: "10.4.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        },
        private: {
            type: "private",
            subnetPrefix: 24,
            availabilityZones: ["0", "1", "2"]
        }
    },
    tags: {
        Name: "dmz-vpc",
        RoutingGroup: "dmz",
        Purpose: "PublicFacing"
    }
});

// ============================================================================
// STEP 3: Attach VPCs to Transit Gateway with Routing Groups
// ============================================================================

const hubAttachment = transitGateway.attachVpc("hub-vpc-attachment", {
    vpcId: hubVpc.vpcId,
    subnetIds: hubVpc.getSubnetIdsByType("private"),
    routingGroup: "hub",
    tags: {
        Name: "hub-vpc-attachment"
    }
});

const productionAttachment = transitGateway.attachVpc("production-vpc-attachment", {
    vpcId: productionVpc.vpcId,
    subnetIds: productionVpc.getSubnetIdsByType("private"),
    routingGroup: "production",
    tags: {
        Name: "production-vpc-attachment",
        Environment: "Production"
    }
});

const developmentAttachment = transitGateway.attachVpc("development-vpc-attachment", {
    vpcId: developmentVpc.vpcId,
    subnetIds: developmentVpc.getSubnetIdsByType("private"),
    routingGroup: "development",
    tags: {
        Name: "development-vpc-attachment",
        Environment: "Development"
    }
});

const testAttachment = transitGateway.attachVpc("test-vpc-attachment", {
    vpcId: testVpc.vpcId,
    subnetIds: testVpc.getSubnetIdsByType("private"),
    routingGroup: "test",
    tags: {
        Name: "test-vpc-attachment",
        Environment: "Test"
    }
});

const dmzAttachment = transitGateway.attachVpc("dmz-vpc-attachment", {
    vpcId: dmzVpc.vpcId,
    subnetIds: dmzVpc.getSubnetIdsByType("private"),
    routingGroup: "dmz",
    tags: {
        Name: "dmz-vpc-attachment",
        Purpose: "PublicFacing"
    }
});

// ============================================================================
// EXPORTS
// ============================================================================

export const transitGatewayId = transitGateway.transitGateway.id;
export const routingGroups = transitGateway.getRoutingGroups();

export const hubVpcId = hubVpc.vpcId;
export const productionVpcId = productionVpc.vpcId;
export const developmentVpcId = developmentVpc.vpcId;
export const testVpcId = testVpc.vpcId;
export const dmzVpcId = dmzVpc.vpcId;

// ============================================================================
// ROUTING MATRIX
// ============================================================================
/**
 * Communication Matrix:
 * 
 *                  Hub    Production    Development    Test    DMZ
 * Hub              ✓      ✓             ✓              ✓       ✓
 * Production       ✓      ✓             ✗              ✗       ✗
 * Development      ✓      ✗             ✓              ✓       ✗
 * Test             ✓      ✗             ✓              ✓       ✗
 * DMZ              ✓      ✗             ✗              ✗       ✓
 * 
 * Legend:
 * ✓ = Can communicate
 * ✗ = Cannot communicate (isolated)
 * 
 * Security Benefits:
 * 1. Production is completely isolated from dev/test environments
 * 2. DMZ is isolated from all internal networks except hub
 * 3. Dev and Test can collaborate but can't access production
 * 4. All environments can access hub for shared services (monitoring, DNS, etc.)
 * 5. Each routing group has its own route table for fine-grained control
 */
