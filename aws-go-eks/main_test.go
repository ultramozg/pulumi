package main

import (
	"strings"
	"sync"
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

		networkConfigInput := networkData{"test-vpc", []subnetConfig{{"public", "192.168.0.0/24"}}, []subnetConfig{{"private", "192.168.1.0/24"}}}

		network, err := setupNetwork(ctx, &networkConfigInput)
		assert.NoError(t, err)

		var wg sync.WaitGroup
		wg.Add(3)

		// TODO(check 1): VPC has name
		network.vpc.Tags.ApplyT(func(tags map[string]string) error {
			if v, ok := tags["Name"]; ok {
				assert.Equal(t, strings.HasPrefix(v, "pulumi-eks-go"), true, "The Name should start with the prefix")
			} else {
				t.Fail()
				t.Log("The VPC doesn't have a name")
			}

			wg.Done()
			return nil
		})

		// TODO(check 2): One public subnet with CIDR
		assert.Equal(t, len(network.pubSubnets), 1, "Public subnets should have only one subnet")
		network.pubSubnets[0].CidrBlock.ApplyT(func(cidrPtr *string) error {
			cidr := *cidrPtr
			assert.Equal(t, cidr, networkConfigInput.PublicSubnets[0].Cidr, "The public subnet should have the following cidr block")
			wg.Done()
			return nil
		})

		// TODO(check 3): One private subnet with CIDR
		assert.Equal(t, len(network.privSubnets), 1, "Private subnets should have only one subnet")
		network.privSubnets[0].CidrBlock.ApplyT(func(cidrPtr *string) error {
			cidr := *cidrPtr
			assert.Equal(t, cidr, networkConfigInput.PrivateSubnets[0].Cidr, "The public subnet should have the following cidr block")
			wg.Done()
			return nil
		})

		wg.Wait()
		return nil
	}, pulumi.WithMocks("project", "stack", mocks(0)))
	assert.NoError(t, err)
}

func TestSetupEks(t *testing.T) {
	err := pulumi.RunErr(func(ctx *pulumi.Context) error {

		networkConfigInput := networkData{"test-vpc", []subnetConfig{{"public", "192.168.0.0/24"}}, []subnetConfig{{"private", "192.168.1.0/24"}}}

		network, err := setupNetwork(ctx, &networkConfigInput)
		assert.NoError(t, err)

		eksConfigInput := eksConfig{
			Addons: []string{"metricsServer"},
			NodeGroup: NodeGroup{
				CapacityType: "SPOT",
				NodeType:     "t3.medium",
				Scaling: Scaling{
					Desire: 1,
					Min:    1,
					Max:    1},
			},
			Sg: Sg{
				Ingress: []FirewallRule{
					{
						Protocol: "tcp",
						FromPort: 80,
						ToPort:   80,
						Cidr:     "0.0.0.0/0",
					},
				},
				Egress: []FirewallRule{
					{
						Protocol: "-1",
						FromPort: 0,
						ToPort:   0,
						Cidr:     "0.0.0.0/0",
					},
				},
			},
		}
		_, err = setupEKS(ctx, network, &eksConfigInput)

		var wg sync.WaitGroup
		wg.Add(1)

		/*
			// The tag name should be exist for the EKS
			eksInfo.eksCluster.Tags.ApplyT(func(tags map[string]string) error {
				if v, ok := tags["Name"]; ok {
					assert.Equal(t, strings.HasPrefix(v, "pulumi-eks-go"), true, "The Name should start with the prefix")
				} else {
					t.Fail()
					t.Log("The EKS doesn't have a Name tag assigned")
				}

				wg.Done()
				return nil
			})
		*/
		wg.Done()

		wg.Wait()
		return nil
	}, pulumi.WithMocks("project", "stack", mocks(0)))
	assert.NoError(t, err)
}
