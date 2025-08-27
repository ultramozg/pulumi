
import * as pulumi from "@pulumi/pulumi";
import { IPAMComponent } from "../../components/ipam";
import { VPCComponent } from "../../components/vpc";

// Create IPAM component
const ipam = new IPAMComponent("test-ipam", {
    cidrBlocks: ["10.0.0.0/16"],
    shareWithOrganization: false,
    operatingRegions: ["us-east-1"],
    tags: {
        TestType: "integration",
        Component: "ipam"
    }
});

// Create VPC component that uses IPAM
const vpc = new VPCComponent("test-vpc", {
    region: "us-east-1",
    ipamPoolArn: ipam.getPoolArn("us-east-1"),
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 2,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: [0, 1]
        },
        private: {
            type: "private", 
            subnetPrefix: 24,
            availabilityZones: [0, 1]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc"
    }
});

// Export outputs for validation
export const ipamId = ipam.ipamId;
export const ipamArn = ipam.ipamArn;
export const poolId = ipam.getPoolId("us-east-1");
export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const subnetIds = vpc.subnetIds;
export const publicSubnetIds = vpc.getSubnetIdsByType("public");
export const privateSubnetIds = vpc.getSubnetIdsByType("private");
