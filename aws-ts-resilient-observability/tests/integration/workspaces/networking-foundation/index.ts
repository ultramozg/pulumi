
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { IPAMComponent } from "../../../components/ipam";

// Create IPAM component
const ipam = new IPAMComponent("central-ipam", {
    cidrBlocks: ["10.0.0.0/8"],
    shareWithOrganization: false,
    operatingRegions: ["us-east-1", "us-west-2"],
    tags: {
        TestType: "integration",
        Layer: "networking",
        Component: "ipam"
    }
});

// Create Transit Gateway
const transitGateway = new aws.ec2transitgateway.TransitGateway("central-tgw", {
    description: "Central Transit Gateway for integration testing",
    amazonSideAsn: 64512,
    autoAcceptSharedAttachments: "enable",
    defaultRouteTableAssociation: "enable",
    defaultRouteTablePropagation: "enable",
    tags: {
        Name: "central-tgw",
        TestType: "integration",
        Layer: "networking",
        Component: "transit-gateway"
    }
});

// Export outputs for other stacks to use
export const ipamId = ipam.ipamId;
export const ipamArn = ipam.ipamArn;
export const ipamPoolIdEast = ipam.getPoolId("us-east-1");
export const ipamPoolIdWest = ipam.getPoolId("us-west-2");
export const transitGatewayId = transitGateway.id;
export const transitGatewayArn = transitGateway.arn;
