
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VPCComponent } from "../../components/vpc";

// Create Transit Gateway first
const transitGateway = new aws.ec2transitgateway.TransitGateway("test-tgw", {
    description: "Test Transit Gateway for integration testing",
    amazonSideAsn: 64512,
    autoAcceptSharedAttachments: "enable",
    defaultRouteTableAssociation: "enable",
    defaultRouteTablePropagation: "enable",
    tags: {
        Name: "test-tgw",
        TestType: "integration",
        Component: "transit-gateway"
    }
});

// Create VPC with Transit Gateway attachment
const vpc = new VPCComponent("test-vpc", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    transitGatewayArn: transitGateway.arn,
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
        },
        transit: {
            type: "transit-gateway",
            subnetPrefix: 28,
            availabilityZones: [0, 1]
        }
    },
    tags: {
        TestType: "integration",
        Component: "vpc"
    }
});

// Export outputs for validation
export const transitGatewayId = transitGateway.id;
export const transitGatewayArn = transitGateway.arn;
export const vpcId = vpc.vpcId;
export const vpcCidr = vpc.cidrBlock;
export const transitGatewayAttachmentId = vpc.transitGatewayAttachmentId;
export const transitGatewaySubnetIds = vpc.getSubnetIdsByType("transit-gateway");
