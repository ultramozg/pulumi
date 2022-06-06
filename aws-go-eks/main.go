package main

import (
	"fmt"

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

type eksConfig struct {
	NodeGroup struct {
		CapacityType string
		NodeType     string
		Scaling      struct {
			Desire int
			Min    int
			Max    int
		}
	}
	Sg struct {
		Ingress []struct {
			Protocol string
			FromPort int
			ToPort   int
			Cidr     string
		}
		Egress []struct {
			Protocol string
			FromPort int
			ToPort   int
			Cidr     string
		}
	}
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		var networkConfig networkData
		var eksConfig eksConfig

		conf := config.New(ctx, "")
		conf.RequireObject("network", &networkConfig)
		conf.RequireObject("eks", &eksConfig)
		fmt.Println(eksConfig)

		netResources, err := setupNetwork(ctx, &networkConfig)
		if err != nil {
			return err
		}

		eksResources, err := setupEKS(ctx, netResources, &eksConfig)
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
