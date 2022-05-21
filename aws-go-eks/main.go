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

		k8sProvider, err := setupEKS(ctx, netResources)
		if err != nil {
			return err
		}

		err = setupDeployments(ctx, k8sProvider)
		if err != nil {
			return err
		}

		return nil
	})
}
