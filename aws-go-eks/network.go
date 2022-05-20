package main

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/ec2"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type networkResources struct {
	vpc         *ec2.Vpc
	pubSubnets  []*ec2.Subnet
	privSubnets []*ec2.Subnet
}

func setupNetwork(ctx *pulumi.Context) (*networkResources, error) {
	prefix := "pulumi-eks-go"
	resourceTags := make(map[string]string)

	resourceTags["CreatedBy"] = "pulumi-eks-go"
	resourceTags["GitOrg"] = "gsweene2"
	resourceTags["GitRepo"] = "pulumi"

	// VPC CIDR
	cidrBlock := "10.0.0.0/16"

	// VPC Args
	resourceTags["Name"] = prefix + "-vpc"
	vpcArgs := &ec2.VpcArgs{
		CidrBlock:          pulumi.String(cidrBlock),
		EnableDnsHostnames: pulumi.Bool(true),
		InstanceTenancy:    pulumi.String("default"),
		Tags:               pulumi.ToStringMap(resourceTags),
	}

	// VPC
	vpc, err := ec2.NewVpc(ctx, prefix+"-vpc", vpcArgs)
	if err != nil {
		fmt.Println(err.Error())
		return &networkResources{}, err
	}

	// Resource: Subnets
	// Purpose: A subnet is a range of IP addresses in your VPC.
	// Docs: https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html

	availabilityZones := []string{"eu-west-1a", "eu-west-1b", "eu-west-1c"}

	privSubnets := []*ec2.Subnet{}
	// 3 Private Subnets
	for i := 1; i <= 3; i++ {
		resourceTags["Name"] = fmt.Sprintf("%s-%s-%d", prefix, "priv-sub", i)
		sub, err := ec2.NewSubnet(ctx, fmt.Sprintf("%s-%s-%d", prefix, "priv-sub", i), &ec2.SubnetArgs{
			VpcId:            vpc.ID(),
			CidrBlock:        pulumi.String(fmt.Sprintf("10.0.%d.0/24", i)),
			AvailabilityZone: pulumi.String(availabilityZones[i%3]),
			Tags:             pulumi.ToStringMap(resourceTags),
		})
		if err != nil {
			return &networkResources{}, err
		}
		privSubnets = append(privSubnets, sub)
	}

	// 3 Public Subnets
	pubSubnets := []*ec2.Subnet{}
	// 3 Private Subnets
	for i := 4; i <= 6; i++ {
		resourceTags["Name"] = fmt.Sprintf("%s-%s-%d", prefix, "pub-sub", i)
		sub, err := ec2.NewSubnet(ctx, fmt.Sprintf("%s-%s-%d", prefix, "pub-sub", i), &ec2.SubnetArgs{
			VpcId:            vpc.ID(),
			CidrBlock:        pulumi.String(fmt.Sprintf("10.0.%d.0/24", i)),
			AvailabilityZone: pulumi.String(availabilityZones[i%3]),
			Tags:             pulumi.ToStringMap(resourceTags),
		})
		if err != nil {
			return &networkResources{}, err
		}
		pubSubnets = append(pubSubnets, sub)
	}

	// Resource: Elastic IP
	// Purpose: An Elastic IP address is a static IPv4 address designed for dynamic cloud computing.
	// Docs: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html

	// EIP for NAT GW
	eip1, err := ec2.NewEip(ctx, prefix+"-eip1", &ec2.EipArgs{
		Vpc: pulumi.Bool(true),
	})
	if err != nil {
		return &networkResources{}, err
	}

	// Resource: NAT Gateway
	// Purpose: A NAT gateway is a Network Address Translation (NAT) service.
	// Docs: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html

	// NAT Gateway with EIP
	// this is the cheaper solution, because it's using only one AZ
	resourceTags["Name"] = prefix + "-nat-gw-1"
	natGw1, err := ec2.NewNatGateway(ctx, prefix+"-nat-gw-1", &ec2.NatGatewayArgs{
		AllocationId: eip1.ID(),
		// NAT must reside in public subnet for private instance internet access
		SubnetId: pubSubnets[0].ID(),
		Tags:     pulumi.ToStringMap(resourceTags),
	})
	if err != nil {
		return &networkResources{}, err
	}

	// Resource: Internet Gateway
	// Purpose: An internet gateway is a horizontally scaled, redundant, and highly available VPC component that allows communication between your VPC and the internet.
	// Docs: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html

	// IGW for the Public Subnets
	resourceTags["Name"] = prefix + "-gw"
	igw1, err := ec2.NewInternetGateway(ctx, prefix+"-gw", &ec2.InternetGatewayArgs{
		VpcId: vpc.ID(),
		Tags:  pulumi.ToStringMap(resourceTags),
	})
	if err != nil {
		return &networkResources{}, err
	}

	// Resource: Route Tables
	// Purpose: A route table contains a set of rules, called routes, that determine where network traffic from your subnet or gateway is directed.
	// Docs: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html

	// Private Route Table for Private Subnets
	resourceTags["Name"] = prefix + "-rtb-private-1"
	privateRouteTable, err := ec2.NewRouteTable(ctx, prefix+"-rtb-private-1", &ec2.RouteTableArgs{
		VpcId: vpc.ID(),
		Routes: ec2.RouteTableRouteArray{
			&ec2.RouteTableRouteArgs{
				// To Internet via NAT
				CidrBlock: pulumi.String("0.0.0.0/0"),
				GatewayId: natGw1.ID(),
			},
		},
		Tags: pulumi.ToStringMap(resourceTags),
	})
	if err != nil {
		return &networkResources{}, err
	}

	// Public Route Table for Public Subnets
	resourceTags["Name"] = prefix + "-rtb-public-1"
	publicRouteTable, err := ec2.NewRouteTable(ctx, prefix+"-rtb-public-1", &ec2.RouteTableArgs{
		VpcId: vpc.ID(),
		Routes: ec2.RouteTableRouteArray{
			// To Internet via IGW
			&ec2.RouteTableRouteArgs{
				CidrBlock: pulumi.String("0.0.0.0/0"),
				GatewayId: igw1.ID(),
			},
		},
		Tags: pulumi.ToStringMap(resourceTags),
	})
	if err != nil {
		return &networkResources{}, err
	}

	// Associate Private Subs with Private Route Tables
	for i, v := range privSubnets {
		_, err = ec2.NewRouteTableAssociation(ctx, fmt.Sprintf("%s-rtb-priv-%d", prefix, i), &ec2.RouteTableAssociationArgs{
			SubnetId:     v.ID(),
			RouteTableId: privateRouteTable.ID(),
		})
		if err != nil {
			return &networkResources{}, err
		}
	}

	// Associate Public Subs with Public Route Tables
	for i, v := range pubSubnets {
		_, err = ec2.NewRouteTableAssociation(ctx, fmt.Sprintf("%s-rtb-pub-%d", prefix, i), &ec2.RouteTableAssociationArgs{
			SubnetId:     v.ID(),
			RouteTableId: publicRouteTable.ID(),
		})
		if err != nil {
			return &networkResources{}, err
		}
	}
	return &networkResources{privSubnets: privSubnets, pubSubnets: pubSubnets, vpc: vpc}, nil
}
