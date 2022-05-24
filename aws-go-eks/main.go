package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		resourceTags := make(map[string]string)

		resourceTags["CreatedBy"] = "pulumi-eks-go"
		resourceTags["GitOrg"] = "gsweene2"
		resourceTags["GitRepo"] = "pulumi"

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
