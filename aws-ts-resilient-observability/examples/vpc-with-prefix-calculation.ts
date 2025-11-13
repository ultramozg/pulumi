import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../components/vpc";

/**
 * Example: VPC with prefix-based subnet calculation
 * 
 * This example demonstrates how to create a VPC using the new prefix-based
 * subnet calculation approach with a base subnet.
 */

// Configuration
const config = new pulumi.Config();
const region = config.get("region") || "us-west-2";
const environment = config.get("environment") || "dev";

// Create VPC with base subnet and prefix-based calculation
const vpc = new VPCComponent("example-vpc", {
    region: region,
    environment: environment,
    
    // Use base subnet for VPC CIDR
    baseSubnet: "10.0.0.0/16",
    
    // Enable gateways
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    
    // Use 3 availability zones
    availabilityZoneCount: 3,
    
    // Define subnets with prefix-based calculation
    subnets: {
        // Public subnets with /24 prefix (256 IPs each)
        "public": {
            type: "public",
            subnetPrefix: 24,  // /24 = 256 IPs per subnet
            availabilityZones: 3  // Create 3 subnets (one per AZ)
        },
        
        // Private subnets with /24 prefix (256 IPs each)
        "private": {
            type: "private", 
            subnetPrefix: 24,  // /24 = 256 IPs per subnet
            availabilityZones: 3  // Create 3 subnets (one per AZ)
        },
        
        // Database subnets with /26 prefix (64 IPs each)
        "database": {
            type: "private",
            subnetPrefix: 26,  // /26 = 64 IPs per subnet
            availabilityZones: 3  // Create 3 subnets (one per AZ)
        }
    },
    
    tags: {
        Project: "ExampleVPC",
        Environment: environment
    }
});

// Export VPC outputs
export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const publicSubnetIds = vpc.getSubnetIdsByType("public");
export const privateSubnetIds = vpc.getSubnetIdsByType("private");

// Export specific subnet IDs by name
export const publicSubnet0 = vpc.getSubnetId("public", 0);  // First public subnet
export const privateSubnet0 = vpc.getSubnetId("private", 0); // First private subnet
export const databaseSubnetIds = vpc.getSubnetIdsByName("database"); // All database subnets

// Example subnet CIDR calculations with base subnet 10.0.0.0/16:
// - public-0: 10.0.0.0/24   (10.0.0.1 - 10.0.0.254)
// - public-1: 10.0.1.0/24   (10.0.1.1 - 10.0.1.254) 
// - public-2: 10.0.2.0/24   (10.0.2.1 - 10.0.2.254)
// - private-0: 10.0.3.0/24  (10.0.3.1 - 10.0.3.254)
// - private-1: 10.0.4.0/24  (10.0.4.1 - 10.0.4.254)
// - private-2: 10.0.5.0/24  (10.0.5.1 - 10.0.5.254)
// - database-0: 10.0.6.0/26 (10.0.6.1 - 10.0.6.62)
// - database-1: 10.0.6.64/26 (10.0.6.65 - 10.0.6.126)
// - database-2: 10.0.6.128/26 (10.0.6.129 - 10.0.6.190)