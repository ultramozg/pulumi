
import * as pulumi from "@pulumi/pulumi";
import { IPAMComponent } from "../../../components/ipam";

const ipam = new IPAMComponent("central-ipam", {
    cidrBlocks: ["10.0.0.0/8"],
    shareWithOrganization: false,
    operatingRegions: ["us-east-1", "us-west-2"],
    tags: {
        TestType: "integration",
        Layer: "networking"
    }
});

export const ipamId = ipam.ipamId;
export const ipamArn = ipam.ipamArn;
export const ipamPoolIdEast = ipam.getPoolId("us-east-1");
export const ipamPoolIdWest = ipam.getPoolId("us-west-2");
