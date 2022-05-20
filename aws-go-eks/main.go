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
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/helm/v3"
	metav1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/meta/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/providers"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		resourceTags := make(map[string]string)

		resourceTags["CreatedBy"] = "pulumi-eks-go"
		resourceTags["GitOrg"] = "gsweene2"
		resourceTags["GitRepo"] = "pulumi"

		netResources, err := setupNetwork(ctx)

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
			VpcId: netResources.vpc.ID(),
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
		for _, v := range netResources.privSubnets {
			privSubnetsIDs = append(privSubnetsIDs, v.ID())
		}

		pubSubnetsIDs := pulumi.StringArray{}
		for _, v := range netResources.pubSubnets {
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
			res, err := getThumbprint(url)
			if err != nil {
				fmt.Println("ERROR: ", err)
			}
			return res
		}).(pulumi.StringOutput)

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

		/* DEPLOYMENTS */
		chart, err := helm.NewChart(ctx, "metrics-server", helm.ChartArgs{
			Chart:     pulumi.String("metrics-server"),
			Version:   pulumi.String("3.8.2"),
			Namespace: pulumi.String("kube-system"),
			FetchArgs: helm.FetchArgs{
				Repo: pulumi.String("https://kubernetes-sigs.github.io/metrics-server/"),
			},
		}, pulumi.Provider(k8sProvider))
		if err != nil {
			return err
		}
		fmt.Println(chart)

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
		/* END */

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
