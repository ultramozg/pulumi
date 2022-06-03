package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

type networkData struct {
	Vpc           string
	PublicSubnets []struct {
		Name string
		Cidr string
	}
	PrivateSubnets []struct {
		Name string
		Cidr string
	}
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		var networkConfig networkData

		conf := config.New(ctx, "")
		conf.RequireObject("network", &networkConfig)

		netResources, err := setupNetwork(ctx, &networkConfig)
		if err != nil {
			return err
		}

		eksResources, err := setupEKS(ctx, netResources)
		if err != nil {
			return err
		}

		err = setupDeployments(ctx, eksResources)
		if err != nil {
			return err
		}

		return nil
	})
}
