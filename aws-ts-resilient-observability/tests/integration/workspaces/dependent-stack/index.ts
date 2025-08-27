
import * as pulumi from "@pulumi/pulumi";
import { VPCComponent } from "../../../components/vpc";

const vpc = new VPCComponent("dependent-vpc", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 1,
    subnets: {
        public: {
            type: "public",
            subnetPrefix: 24,
            availabilityZones: [0]
        }
    },
    tags: {
        TestType: "integration"
    }
});

export const vpcId = vpc.vpcId;
