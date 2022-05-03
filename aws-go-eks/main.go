package main

import (
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net/url"

	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/eks"
	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/iam"
	appsv1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/apps/v1"
	corev1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/core/v1"
	metav1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/meta/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/providers"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		prefix := "pulumi-eks-go"

		resourceTags := make(map[string]string)

		resourceTags["CreatedBy"] = "pulumi-eks-go"
		resourceTags["GitOrg"] = "gsweene2"
		resourceTags["GitRepo"] = "pulumi"

		// Resource: VPC
		// Purpose: Amazon Virtual Private Cloud (Amazon VPC) enables you to launch AWS resources into a virtual network that you've defined.
		// Docs: https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html

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
			return err
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
				return err
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
				return err
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
			return err
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
			return err
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
			return err
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
			return err
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
			return err
		}

		// Associate Private Subs with Private Route Tables
		for i, v := range privSubnets {
			_, err = ec2.NewRouteTableAssociation(ctx, fmt.Sprintf("%s-rtb-priv-%d", prefix, i), &ec2.RouteTableAssociationArgs{
				SubnetId:     v.ID(),
				RouteTableId: privateRouteTable.ID(),
			})
			if err != nil {
				return err
			}
		}

		// Associate Public Subs with Public Route Tables
		for i, v := range pubSubnets {
			_, err = ec2.NewRouteTableAssociation(ctx, fmt.Sprintf("%s-rtb-pub-%d", prefix, i), &ec2.RouteTableAssociationArgs{
				SubnetId:     v.ID(),
				RouteTableId: publicRouteTable.ID(),
			})
			if err != nil {
				return err
			}
		}

		// Resource: IAM Role
		// Purpose: An IAM role is an IAM identity that you can create in your account that has specific permissions.
		// Docs: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html

		eksRole, err := iam.NewRole(ctx, "eks-iam-eksRole", &iam.RoleArgs{
			AssumeRolePolicy: pulumi.String(`{
			    "Version": "2008-10-17",
			    "Statement": [{
			        "Sid": "",
			        "Effect": "Allow",
			        "Principal": {
			            "Service": "eks.amazonaws.com"
			        },
			        "Action": "sts:AssumeRole"
			    }]
			}`),
		})
		if err != nil {
			return err
		}
		eksPolicies := []string{
			"arn:aws:iam::aws:policy/AmazonEKSServicePolicy",
			"arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
		}
		for i, eksPolicy := range eksPolicies {
			_, err := iam.NewRolePolicyAttachment(ctx, fmt.Sprintf("rpa-%d", i), &iam.RolePolicyAttachmentArgs{
				PolicyArn: pulumi.String(eksPolicy),
				Role:      eksRole.Name,
			})
			if err != nil {
				return err
			}
		}
		// Create the EC2 NodeGroup Role
		nodeGroupRole, err := iam.NewRole(ctx, "nodegroup-iam-role", &iam.RoleArgs{
			AssumeRolePolicy: pulumi.String(`{
		    "Version": "2012-10-17",
		    "Statement": [{
		        "Sid": "",
		        "Effect": "Allow",
		        "Principal": {
		            "Service": "ec2.amazonaws.com"
		        },
		        "Action": "sts:AssumeRole"
		    }]
		}`),
		})
		if err != nil {
			return err
		}
		nodeGroupPolicies := []string{
			"arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
			"arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
			"arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
		}
		for i, nodeGroupPolicy := range nodeGroupPolicies {
			_, err := iam.NewRolePolicyAttachment(ctx, fmt.Sprintf("ngpa-%d", i), &iam.RolePolicyAttachmentArgs{
				Role:      nodeGroupRole.Name,
				PolicyArn: pulumi.String(nodeGroupPolicy),
			})
			if err != nil {
				return err
			}
		}
		// Create a Security Group that we can use to actually connect to our cluster
		clusterSg, err := ec2.NewSecurityGroup(ctx, "cluster-sg", &ec2.SecurityGroupArgs{
			VpcId: vpc.ID(),
			Egress: ec2.SecurityGroupEgressArray{
				ec2.SecurityGroupEgressArgs{
					Protocol:   pulumi.String("-1"),
					FromPort:   pulumi.Int(0),
					ToPort:     pulumi.Int(0),
					CidrBlocks: pulumi.StringArray{pulumi.String("0.0.0.0/0")},
				},
			},
			Ingress: ec2.SecurityGroupIngressArray{
				ec2.SecurityGroupIngressArgs{
					Protocol:   pulumi.String("tcp"),
					FromPort:   pulumi.Int(80),
					ToPort:     pulumi.Int(80),
					CidrBlocks: pulumi.StringArray{pulumi.String("0.0.0.0/0")},
				},
			},
		})
		if err != nil {
			return err
		}

		privSubnetsIDs := pulumi.StringArray{}
		for _, v := range privSubnets {
			privSubnetsIDs = append(privSubnetsIDs, v.ID())
		}

		pubSubnetsIDs := pulumi.StringArray{}
		for _, v := range pubSubnets {
			pubSubnetsIDs = append(pubSubnetsIDs, v.ID())
		}

		// Create EKS Cluster
		eksCluster, err := eks.NewCluster(ctx, "eks-cluster", &eks.ClusterArgs{
			RoleArn: pulumi.StringInput(eksRole.Arn),
			VpcConfig: &eks.ClusterVpcConfigArgs{
				PublicAccessCidrs: pulumi.StringArray{
					pulumi.String("0.0.0.0/0"),
				},
				SecurityGroupIds: pulumi.StringArray{
					clusterSg.ID().ToStringOutput(),
				},
				SubnetIds: append(privSubnetsIDs, pubSubnetsIDs...),
			},
		})
		if err != nil {
			return err
		}

		oidc_url := eksCluster.Identities.Index(pulumi.Int(0)).Oidcs().Index(pulumi.Int(0)).Issuer().Elem().ToStringOutput()
		thumbprint := oidc_url.ApplyT(func(url string) string {
			res, err := getThumbprint(oidc_url.ToStringOutput().ElementType().String())
			if err != nil {
				fmt.Println("ERROR: ", err)
			}
			return res
		}).(pulumi.StringOutput)
		fmt.Println(thumbprint.ToStringOutput().ElementType().String())

		if err != nil {
			return err
		}
		oidcProvider, err := iam.NewOpenIdConnectProvider(ctx, "eks-oidc", &iam.OpenIdConnectProviderArgs{
			ClientIdLists:   pulumi.StringArray{pulumi.String("sts.amazonaws.com")},
			ThumbprintLists: pulumi.StringArray{pulumi.StringInput(thumbprint)},
			Url:             oidc_url,
		})
		if err != nil {
			return err
		}
		fmt.Println(oidcProvider)
		// END

		nodeGroup, err := eks.NewNodeGroup(ctx, "node-group-2", &eks.NodeGroupArgs{
			ClusterName:   eksCluster.Name,
			NodeGroupName: pulumi.String("demo-eks-nodegroup-2"),
			NodeRoleArn:   pulumi.StringInput(nodeGroupRole.Arn),
			InstanceTypes: pulumi.StringArray{pulumi.String("t3.medium")},
			CapacityType:  pulumi.String("SPOT"),
			SubnetIds:     privSubnetsIDs,
			ScalingConfig: &eks.NodeGroupScalingConfigArgs{
				DesiredSize: pulumi.Int(1),
				MaxSize:     pulumi.Int(2),
				MinSize:     pulumi.Int(1),
			},
		})
		if err != nil {
			return err
		}

		ca := eksCluster.CertificateAuthorities.ApplyT(func(certificateAuthorities []eks.ClusterCertificateAuthority) (string, error) {
			return (*certificateAuthorities[0].Data), nil
		}).(pulumi.StringOutput)

		ctx.Export("kubeconfig", generateKubeconfig(eksCluster.Endpoint,
			ca, eksCluster.Name))

		k8sProvider, err := providers.NewProvider(ctx, "k8sprovider", &providers.ProviderArgs{
			Kubeconfig: generateKubeconfig(eksCluster.Endpoint,
				ca, eksCluster.Name),
		}, pulumi.DependsOn([]pulumi.Resource{nodeGroup}))
		if err != nil {
			return err
		}

		namespace, err := corev1.NewNamespace(ctx, "app", &corev1.NamespaceArgs{
			Metadata: &metav1.ObjectMetaArgs{
				Name: pulumi.String("app"),
			},
		}, pulumi.Provider(k8sProvider))
		if err != nil {
			return err
		}

		appLabels := pulumi.StringMap{
			"app": pulumi.String("nginx"),
		}
		_, err = appsv1.NewDeployment(ctx, "app-dep", &appsv1.DeploymentArgs{
			Metadata: &metav1.ObjectMetaArgs{
				Namespace: namespace.Metadata.Elem().Name(),
			},
			Spec: appsv1.DeploymentSpecArgs{
				Selector: &metav1.LabelSelectorArgs{
					MatchLabels: appLabels,
				},
				Replicas: pulumi.Int(1),
				Template: &corev1.PodTemplateSpecArgs{
					Metadata: &metav1.ObjectMetaArgs{
						Labels: appLabels,
					},
					Spec: &corev1.PodSpecArgs{
						Containers: corev1.ContainerArray{
							corev1.ContainerArgs{
								Name:  pulumi.String("nginx"),
								Image: pulumi.String("nginx"),
							}},
					},
				},
			},
		}, pulumi.Provider(k8sProvider))
		if err != nil {
			return err
		}

		service, err := corev1.NewService(ctx, "app-service", &corev1.ServiceArgs{
			Metadata: &metav1.ObjectMetaArgs{
				Namespace: namespace.Metadata.Elem().Name(),
				Labels:    appLabels,
			},
			Spec: &corev1.ServiceSpecArgs{
				Ports: corev1.ServicePortArray{
					corev1.ServicePortArgs{
						Port:       pulumi.Int(80),
						TargetPort: pulumi.Int(80),
					},
				},
				Selector: appLabels,
				Type:     pulumi.String("LoadBalancer"),
			},
		}, pulumi.Provider(k8sProvider))
		if err != nil {
			return err
		}

		ctx.Export("url", service.Status.ApplyT(func(status *corev1.ServiceStatus) *string {
			ingress := status.LoadBalancer.Ingress[0]
			if ingress.Hostname != nil {
				return ingress.Hostname
			}
			return ingress.Ip
		}))

		return nil
	})
}

//Create the KubeConfig Structure as per https://docs.aws.amazon.com/eks/latest/userguide/create-kubeconfig.html
func generateKubeconfig(clusterEndpoint pulumi.StringOutput, certData pulumi.StringOutput, clusterName pulumi.StringOutput) pulumi.StringOutput {
	return pulumi.Sprintf(`{
        "apiVersion": "v1",
        "clusters": [{
            "cluster": {
                "server": "%s",
                "certificate-authority-data": "%s"
            },
            "name": "kubernetes",
        }],
        "contexts": [{
            "context": {
                "cluster": "kubernetes",
                "user": "aws",
            },
            "name": "aws",
        }],
        "current-context": "aws",
        "kind": "Config",
        "users": [{
            "name": "aws",
            "user": {
                "exec": {
                    "apiVersion": "client.authentication.k8s.io/v1alpha1",
                    "command": "aws",
                    "args": [
						"--region",
						"eu-west-1",
						"--profile",
						"my-admin-account",
						"eks",
						"get-token",
                        "--cluster-name",
                        "%s",
                    ],
                },
            },
        }],
    }`, clusterEndpoint, certData, clusterName)
}

func toPulumiStringArray(a []string) pulumi.StringArrayInput {
	var res []pulumi.StringInput
	for _, s := range a {
		res = append(res, pulumi.String(s))
	}
	return pulumi.StringArray(res)
}

func getThumbprint(oidc_issuer string) (string, error) {
	url, err := url.Parse(oidc_issuer)
	if err != nil {
		return "", err
	}

	conn, err := tls.Dial("tcp", url.Hostname()+":443", &tls.Config{
		InsecureSkipVerify: true,
	})
	if err != nil {
		return "", err
	}
	defer conn.Close()

	cs := conn.ConnectionState()
	numCerts := len(cs.PeerCertificates)
	var root *x509.Certificate
	// Important! Get the last cert in the chain, which is the root CA.
	if numCerts >= 1 {
		root = cs.PeerCertificates[numCerts-1]
	} else {
		return "", errors.New("Error getting cert list from connection \n")
	}
	// print out the fingerprint
	return fmt.Sprintf("%x", sha1.Sum(root.Raw)), nil
}
