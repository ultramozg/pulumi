package main

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/eks"
	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/iam"
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/providers"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type eksResources struct {
	k8sProvider *providers.Provider
	oidcUrl     pulumi.StringOutput
	eksCluster  *eks.Cluster
}

func setupEKS(ctx *pulumi.Context, netResources *networkResources, eksConfig *eksConfig) (*eksResources, error) {
	prefix := "pulumi-eks-go"
	resourceTags := make(map[string]string)

	resourceTags["CreatedBy"] = "pulumi-eks-go"
	resourceTags["GitOrg"] = "gsweene2"
	resourceTags["GitRepo"] = "pulumi"

	// VPC Args
	resourceTags["Name"] = prefix + "-eks"

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
		return nil, err
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
			return nil, err
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
		return nil, err
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
			return nil, err
		}
	}
	// Create a Security Group that we can use to actually connect to our cluster
	ingressRules := ec2.SecurityGroupIngressArray{}
	for _, v := range eksConfig.Sg.Ingress {
		ingressRules = append(ingressRules,
			ec2.SecurityGroupIngressArgs{
				Protocol:   pulumi.String(v.Protocol),
				FromPort:   pulumi.Int(v.FromPort),
				ToPort:     pulumi.Int(v.ToPort),
				CidrBlocks: pulumi.StringArray{pulumi.String(v.Cidr)},
			},
		)
	}
	egressRules := ec2.SecurityGroupEgressArray{}
	for _, v := range eksConfig.Sg.Egress {
		egressRules = append(egressRules,
			ec2.SecurityGroupEgressArgs{
				Protocol:   pulumi.String(v.Protocol),
				FromPort:   pulumi.Int(v.FromPort),
				ToPort:     pulumi.Int(v.ToPort),
				CidrBlocks: pulumi.StringArray{pulumi.String(v.Cidr)},
			},
		)
	}
	clusterSg, err := ec2.NewSecurityGroup(ctx, "cluster-sg", &ec2.SecurityGroupArgs{
		VpcId:   netResources.vpc.ID(),
		Ingress: ingressRules,
		Egress:  egressRules,
	})
	if err != nil {
		return nil, err
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
		Tags: pulumi.ToStringMap(resourceTags),
	})
	if err != nil {
		return nil, err
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
		return nil, err
	}
	_, err = iam.NewOpenIdConnectProvider(ctx, "eks-oidc", &iam.OpenIdConnectProviderArgs{
		ClientIdLists:   pulumi.StringArray{pulumi.String("sts.amazonaws.com")},
		ThumbprintLists: pulumi.StringArray{pulumi.StringInput(thumbprint)},
		Url:             oidc_url,
	})
	if err != nil {
		return nil, err
	}
	// END

	nodeGroup, err := eks.NewNodeGroup(ctx, "node-group-2", &eks.NodeGroupArgs{
		ClusterName:   eksCluster.Name,
		NodeGroupName: pulumi.String("demo-eks-nodegroup-2"),
		NodeRoleArn:   pulumi.StringInput(nodeGroupRole.Arn),
		InstanceTypes: pulumi.StringArray{pulumi.String(eksConfig.NodeGroup.NodeType)},
		CapacityType:  pulumi.String(eksConfig.NodeGroup.CapacityType),
		SubnetIds:     privSubnetsIDs,
		ScalingConfig: &eks.NodeGroupScalingConfigArgs{
			DesiredSize: pulumi.Int(eksConfig.NodeGroup.Scaling.Desire),
			MaxSize:     pulumi.Int(eksConfig.NodeGroup.Scaling.Max),
			MinSize:     pulumi.Int(eksConfig.NodeGroup.Scaling.Min),
		},
		Tags: pulumi.StringMap{
			fmt.Sprintf("k8s.io/cluster-autoscaler/%s", pulumi.StringInput(eksCluster.Name)): pulumi.String("owned"),
			"k8s.io/cluster-autoscaler/enabled":                                              pulumi.String("true"),
		},
	})
	if err != nil {
		return nil, err
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
		return nil, err
	}

	return &eksResources{k8sProvider, oidc_url, eksCluster}, nil
}
