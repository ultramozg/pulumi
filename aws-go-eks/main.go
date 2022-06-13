package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

type subnetConfig struct {
	Name string
	Cidr string
}

type networkData struct {
	Vpc            string
	PublicSubnets  []subnetConfig
	PrivateSubnets []subnetConfig
}

type Scaling struct {
	Desire int
	Min    int
	Max    int
}

type NodeGroup struct {
	CapacityType string
	NodeType     string
	Scaling      Scaling
}

type FirewallRule struct {
	Protocol string
	FromPort int
	ToPort   int
	Cidr     string
}

type Sg struct {
	Ingress []FirewallRule
	Egress  []FirewallRule
}

type eksConfig struct {
	Addons    []string
	NodeGroup NodeGroup
	Sg        Sg
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		var networkConfig networkData
		var eksConfig eksConfig

		conf := config.New(ctx, "")
		conf.RequireObject("network", &networkConfig)
		conf.RequireObject("eks", &eksConfig)

		netResources, err := setupNetwork(ctx, &networkConfig)
		if err != nil {
			return err
		}

		eksResources, err := setupEKS(ctx, netResources, &eksConfig)
		if err != nil {
			return err
		}

		err = setupDeployments(ctx, eksResources, &eksConfig)
		if err != nil {
			return err
		}

		return nil
	})
}
