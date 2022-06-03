package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		netResources, err := setupNetwork(ctx)
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
