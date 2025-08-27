
import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../../../components/vpc";

const vpc = new VPCComponent("production-vpc-east", {
    region: "us-east-1",
    cidrBlock: "10.1.0.0/16",
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
        Layer: "networking",
        Region: "us-east-1"
    }
});

export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const publicSubnetIds = vpc.getSubnetIdsByType("public");
export const privateSubnetIds = vpc.getSubnetIdsByType("private");
