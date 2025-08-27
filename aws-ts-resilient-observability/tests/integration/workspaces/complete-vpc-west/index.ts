
import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../../../components/vpc";

const vpc = new VPCComponent("production-vpc-west", {
    region: "us-west-2",
    cidrBlock: "10.2.0.0/16",
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
        Region: "us-west-2"
    }
});

export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const publicSubnetIds = vpc.getSubnetIdsByType("public");
export const privateSubnetIds = vpc.getSubnetIdsByType("private");
