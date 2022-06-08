package main

import (
	"testing"

	"github.com/pulumi/pulumi/sdk/v3/go/common/resource"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/stretchr/testify/assert"
)

type mocks int

func (mocks) NewResource(args pulumi.MockResourceArgs) (string, resource.PropertyMap, error) {
	return args.Name + "_id", args.Inputs, nil
}

func (mocks) Call(args pulumi.MockCallArgs) (resource.PropertyMap, error) {
	return args.Args, nil
}

// Tests
func TestSetupNetwork(t *testing.T) {
	err := pulumi.RunErr(func(ctx *pulumi.Context) error {

		_, err := setupNetwork(ctx, &networkData{"test-vpc", []subnetConfig{subnetConfig{"public", "192.168.0.0/24"}}, []subnetConfig{subnetConfig{"private", "192.168.1.1/24"}}})
		assert.NoError(t, err)

		/*
			var wg sync.WaitGroup
			wg.Add(3)

			// TODO(check 1): VPC has name
			// TODO(check 2): One public subnet with CIDR
			// TODO(check 3): One private subnet with CIDR

			wg.Wait()
		*/
		return nil
	}, pulumi.WithMocks("project", "stack", mocks(0)))
	assert.NoError(t, err)
}
