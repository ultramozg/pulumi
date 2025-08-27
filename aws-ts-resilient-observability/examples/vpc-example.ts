import * as pulumi from "@pulumi/pulumi";
import { VPCComponent, IPAMComponent, TransitGateway } from "../components";

// Example 1: Basic VPC with manual CIDR
const basicVpc = new VPCComponent("basic-vpc", {
    region: "us-east-1",
    cidrBlock: "10.0.0.0/16",
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 2,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8, // /24 subnets
            availabilityZones: ["us-east-1a", "us-east-1b"]
        },
        private: {
            type: 'private',
            cidrPrefix: 8, // /24 subnets
            availabilityZones: ["us-east-1a", "us-east-1b"]
        }
    },
    tags: {
        Environment: "development",
        Project: "vpc-example"
    }
});

// Example 2: VPC with IPAM integration
const ipam = new IPAMComponent("example-ipam", {
    cidrBlocks: ["10.0.0.0/8"],
    shareWithOrganization: true,
    operatingRegions: ["us-east-1", "us-west-2"],
    tags: {
        Environment: "production",
        Project: "vpc-example"
    }
});

const ipamVpc = new VPCComponent("ipam-vpc", {
    region: "us-east-1",
    ipamPoolArn: ipam.getPoolArn("us-east-1"),
    internetGatewayEnabled: true,
    natGatewayEnabled: false,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8,
            availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"]
        },
        private: {
            type: 'private',
            cidrPrefix: 8,
            availabilityZones: ["us-east-1a", "us-east-1b", "us-east-1c"]
        }
    },
    tags: {
        Environment: "production",
        Project: "vpc-example"
    }
});

// Example 3: VPC with Transit Gateway integration
const transitGateway = new TransitGateway("example-tgw", {
    description: "Example Transit Gateway for VPC connectivity",
    tags: {
        Environment: "production",
        Project: "vpc-example"
    }
});

const transitVpc = new VPCComponent("transit-vpc", {
    region: "us-east-1",
    cidrBlock: "172.16.0.0/16",
    transitGatewayArn: transitGateway.transitGateway.arn,
    internetGatewayEnabled: false,
    natGatewayEnabled: false,
    availabilityZoneCount: 2,
    subnets: {
        private: {
            type: 'private',
            cidrPrefix: 8,
            availabilityZones: ["us-east-1a", "us-east-1b"]
        },
        transit: {
            type: 'transit-gateway',
            cidrPrefix: 8,
            availabilityZones: ["us-east-1a", "us-east-1b"]
        }
    },
    tags: {
        Environment: "production",
        Project: "vpc-example"
    }
});

// Example 4: Full-featured VPC with all components
const fullVpc = new VPCComponent("full-vpc", {
    region: "us-west-2",
    cidrBlock: "192.168.0.0/16",
    transitGatewayArn: transitGateway.transitGateway.arn,
    internetGatewayEnabled: true,
    natGatewayEnabled: true,
    availabilityZoneCount: 3,
    subnets: {
        public: {
            type: 'public',
            cidrPrefix: 8, // Creates /24 subnets
            availabilityZones: ["us-west-2a", "us-west-2b", "us-west-2c"]
        },
        private: {
            type: 'private',
            cidrPrefix: 8, // Creates /24 subnets
            availabilityZones: ["us-west-2a", "us-west-2b", "us-west-2c"]
        },
        transit: {
            type: 'transit-gateway',
            cidrPrefix: 8, // Creates /24 subnets
            availabilityZones: ["us-west-2a", "us-west-2b"]
        }
    },
    tags: {
        Environment: "production",
        Project: "vpc-example",
        Owner: "platform-team"
    }
});

// Export outputs for use in other stacks
export const basicVpcOutputs = {
    vpcId: basicVpc.vpcId,
    publicSubnets: basicVpc.getSubnetIdsByType('public'),
    privateSubnets: basicVpc.getSubnetIdsByType('private')
};

export const ipamVpcOutputs = {
    vpcId: ipamVpc.vpcId,
    cidrBlock: ipamVpc.cidrBlock,
    publicSubnets: ipamVpc.getSubnetIdsByType('public'),
    privateSubnets: ipamVpc.getSubnetIdsByType('private')
};

export const transitVpcOutputs = {
    vpcId: transitVpc.vpcId,
    transitGatewayAttachmentId: transitVpc.transitGatewayAttachmentId,
    privateSubnets: transitVpc.getSubnetIdsByType('private'),
    transitSubnets: transitVpc.getSubnetIdsByType('transit-gateway')
};

export const fullVpcOutputs = {
    vpcId: fullVpc.vpcId,
    internetGatewayId: fullVpc.internetGatewayId,
    natGatewayIds: fullVpc.natGatewayIds,
    transitGatewayAttachmentId: fullVpc.transitGatewayAttachmentId,
    publicSubnets: fullVpc.getSubnetIdsByType('public'),
    privateSubnets: fullVpc.getSubnetIdsByType('private'),
    transitSubnets: fullVpc.getSubnetIdsByType('transit-gateway'),
    availabilityZones: fullVpc.availabilityZones
};

// Example of using helper methods
export const subnetExamples = {
    // Get specific subnet by name and AZ index
    firstPublicSubnet: basicVpc.getSubnetId('public', 0),
    
    // Get all subnets for a specific name
    allPublicSubnets: basicVpc.getSubnetIdsByName('public'),
    
    // Get subnets by type
    allPrivateSubnets: basicVpc.getSubnetIdsByType('private')
};