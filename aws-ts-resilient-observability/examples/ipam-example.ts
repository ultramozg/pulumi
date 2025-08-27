import * as pulumi from "@pulumi/pulumi";
import { IPAMComponent } from "../components/ipam";

/**
 * Example: Creating an IPAM component for centralized IP management
 * 
 * This example demonstrates how to create an IPAM component that:
 * - Manages IP address allocation across multiple regions
 * - Shares resources within an AWS organization
 * - Provides centralized CIDR block management
 */

// Basic IPAM setup for development environment
const devIPAM = new IPAMComponent("dev-ipam", {
    cidrBlocks: ["10.0.0.0/16"],
    shareWithOrganization: false,
    operatingRegions: ["us-east-1"],
    tags: {
        Environment: "development",
        Team: "platform",
        Purpose: "dev-networking"
    }
});

// Production IPAM setup with multi-region support and organization sharing
const prodIPAM = new IPAMComponent("prod-ipam", {
    cidrBlocks: [
        "10.0.0.0/8",      // Large private network space
        "172.16.0.0/12",   // Additional private space
        "192.168.0.0/16"   // Traditional private space
    ],
    shareWithOrganization: true,
    operatingRegions: [
        "us-east-1",      // Primary region
        "us-west-2",      // Secondary region
        "eu-west-1",      // European region
        "ap-southeast-1"  // Asia Pacific region
    ],
    tags: {
        Environment: "production",
        Team: "platform",
        Purpose: "global-networking",
        CostCenter: "infrastructure",
        Compliance: "required"
    }
});

// Export IPAM outputs for use by other stacks
export const devIPAMOutputs = {
    ipamId: devIPAM.ipamId,
    ipamArn: devIPAM.ipamArn,
    poolIds: devIPAM.poolIds,
    scopeId: devIPAM.scopeId
};

export const prodIPAMOutputs = {
    ipamId: prodIPAM.ipamId,
    ipamArn: prodIPAM.ipamArn,
    poolIds: prodIPAM.poolIds,
    poolArns: prodIPAM.poolArns,
    scopeId: prodIPAM.scopeId,
    availableRegions: prodIPAM.getAvailableRegions()
};

// Example of using helper methods
export const usEast1PoolId = prodIPAM.getPoolId("us-east-1");
export const usWest2PoolArn = prodIPAM.getPoolArn("us-west-2");

// Example of checking region support
export const supportsEuWest1 = prodIPAM.supportsRegion("eu-west-1");
export const supportsApSouth1 = prodIPAM.supportsRegion("ap-south-1");

// Log some information about the IPAM setup
pulumi.log.info(`Development IPAM created with ID: ${devIPAM.ipamId}`);
pulumi.log.info(`Production IPAM supports regions: ${prodIPAM.getAvailableRegions().join(", ")}`);