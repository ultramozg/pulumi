package network

import (
	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/ec2"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type Opt struct {
	vpc     interface{}
	subnet  interface{}
	subnet2 interface{}
	err     interface{}
}

func createVpc(ctx *pulumi.Context) (*Opt, error) {
	vpc, err := ec2.NewVpc(ctx, "app-dev-vpc", &ec2.VpcArgs{
		CidrBlock: pulumi.String("10.0.0.0/16"),
		Tags: pulumi.StringMap{
			"Name": pulumi.String("app-dev-vpc1"),
		},
	})
	if err != nil {
		return nil, err
	}

	gateway, err := ec2.NewInternetGateway(ctx, "app-dev-gw", &ec2.InternetGatewayArgs{
		VpcId: vpc.ID(),
		Tags: pulumi.StringMap{
			"Name": pulumi.String("app-dev-gw1"),
		},
	})
	if err != nil {
		return nil, err
	}

	_, err = ec2.NewRouteTable(ctx, "app-dev-rt", &ec2.RouteTableArgs{
		VpcId: vpc.ID(),
		Tags: pulumi.StringMap{
			"Name": pulumi.String("app-dev-rt1"),
		},
		Routes: ec2.RouteTableRouteArray{
			&ec2.RouteTableRouteArgs{
				CidrBlock: pulumi.String("0.0.0.0/0"),
				GatewayId: gateway.ID(),
			},
		},
	})
	if err != nil {
		return nil, err
	}

	subnet, err := ec2.NewSubnet(ctx, "app-dev-subnet1", &ec2.SubnetArgs{
		VpcId:            vpc.ID(),
		CidrBlock:        pulumi.String("10.0.2.0/24"),
		AvailabilityZone: pulumi.String("ap-northeast-1b"),
		Tags: pulumi.StringMap{
			"Name": pulumi.String("app-dev-subnet1"),
		},
	})
	if err != nil {
		return nil, err
	}

	subnet2, err := ec2.NewSubnet(ctx, "app-dev-subnet2", &ec2.SubnetArgs{
		VpcId:            vpc.ID(),
		CidrBlock:        pulumi.String("10.0.3.0/24"),
		AvailabilityZone: pulumi.String("ap-northeast-1c"),
		Tags: pulumi.StringMap{
			"Name": pulumi.String("app-dev-subnet2"),
		},
	})
	if err != nil {
		return nil, err
	}

	opt := new(Opt)
	opt.vpc = vpc
	opt.subnet = subnet
	opt.subnet2 = subnet2
	opt.err = err

	return opt, nil
}
