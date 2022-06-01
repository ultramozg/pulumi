package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"strings"

	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws"
	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/iam"
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/helm/v3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func setupDeployments(ctx *pulumi.Context, eksResources *eksResources) error {
	/* DEPLOYMENTS */
	_, err := helm.NewChart(ctx, "metrics-server", helm.ChartArgs{
		Chart:     pulumi.String("metrics-server"),
		Version:   pulumi.String("3.8.2"),
		Namespace: pulumi.String("kube-system"),
		FetchArgs: helm.FetchArgs{
			Repo: pulumi.String("https://kubernetes-sigs.github.io/metrics-server/"),
		},
	}, pulumi.Provider(eksResources.k8sProvider))
	if err != nil {
		return err
	}

	current, err := aws.GetCallerIdentity(ctx, nil, nil)
	if err != nil {
		return err
	}

	// we should get oidc provider & account_id
	// ALB controller
	jsonPolicy := eksResources.oidcUrl.ApplyT(func(url string) string {
		tmpAlbRole, err := json.Marshal(map[string]interface{}{
			"Version": "2012-10-17",
			"Statement": []map[string]interface{}{
				map[string]interface{}{
					"Action": "sts:AssumeRoleWithWebIdentity",
					"Effect": "Allow",
					"Sid":    "",
					"Principal": map[string]interface{}{
						//                                                    /<OIDC provider without https://
						"Federated": "arn:aws:iam::" + current.AccountId + ":oidc-provider/" + strings.TrimPrefix(url, "https://"),
					},
					"Condition": map[string]interface{}{
						"StringEquals": map[string]interface{}{
							// Something like this , should be changed OIDC provider without https://
							strings.TrimPrefix(url, "https://") + ":sub": "system:serviceaccount:kube-system:aws-load-balancer-controller",
						},
					},
				},
			},
		})
		if err != nil {
			return "ERROR: " + err.Error()
		}
		return string(tmpAlbRole)
	}).(pulumi.StringOutput)

	file, _ := ioutil.ReadFile("policies/alb_iam_policy.json")
	clusterLoadBalancerRole, err := iam.NewRole(ctx, "application-load-balancer-role", &iam.RoleArgs{
		AssumeRolePolicy: pulumi.StringInput(jsonPolicy),
		InlinePolicies: iam.RoleInlinePolicyArray{
			&iam.RoleInlinePolicyArgs{
				Name:   pulumi.String("policy_for_loadbalancer_controller"),
				Policy: pulumi.String(file),
			},
		},
		Tags: pulumi.StringMap{
			"tag-key": pulumi.String("tag-value"),
		},
	})

	_, err = helm.NewChart(ctx, "aws-load-balancer-controller", helm.ChartArgs{
		Chart:     pulumi.String("aws-load-balancer-controller"),
		Version:   pulumi.String("1.4.1"),
		Namespace: pulumi.String("kube-system"),
		FetchArgs: helm.FetchArgs{
			Repo: pulumi.String("https://aws.github.io/eks-charts"),
		},
		Values: pulumi.Map{
			"clusterName": eksResources.eksCluster.Name,
			"serviceAccount": pulumi.Map{
				"create":      pulumi.String("true"),
				"name":        pulumi.String("aws-load-balancer-controller"),
				"annotations": pulumi.StringInput(clusterLoadBalancerRole.Arn),
			},
		},
	}, pulumi.Provider(eksResources.k8sProvider))
	if err != nil {
		return err
	}
	// END of ALB controller

	// Start of Cluster autoscaler
	jsonPolicyForAutoscaler := eksResources.oidcUrl.ApplyT(func(url string) string {
		tmpAutoscalingRole, err := json.Marshal(map[string]interface{}{
			"Version": "2012-10-17",
			"Statement": []map[string]interface{}{
				map[string]interface{}{
					"Action": "sts:AssumeRoleWithWebIdentity",
					"Effect": "Allow",
					"Sid":    "",
					"Principal": map[string]interface{}{
						//                                                    /<OIDC provider without https://
						"Federated": "arn:aws:iam::" + current.AccountId + ":oidc-provider/" + strings.TrimPrefix(url, "https://"),
					},
					"Condition": map[string]interface{}{
						"StringEquals": map[string]interface{}{
							// Something like this , should be changed OIDC provider without https://
							strings.TrimPrefix(url, "https://") + ":sub": "system:serviceaccount:kube-system:eks-autoscaler-sa",
						},
					},
				},
			},
		})
		if err != nil {
			return "ERROR: " + err.Error()
		}
		return string(tmpAutoscalingRole)
	}).(pulumi.StringOutput)

	jsonAutoscalingPolicy, _ := json.Marshal(map[string]interface{}{
		"Version": "2012-10-17",
		"Statement": []map[string]interface{}{
			map[string]interface{}{
				"Sid":    "",
				"Effect": "Allow",
				"Action": []string{
					"autoscaling:SetDesiredCapacity",
					"autoscaling:TerminateInstanceInAutoScalingGroup",
				},
				"Resource": "*",
				"Condition": map[string]interface{}{
					"StringEquals": map[string]interface{}{
						fmt.Sprintf("aws:ResourceTag/k8s.io/cluster-autoscaler/%s", pulumi.StringInput(eksResources.eksCluster.Name)): "owned",
					},
				},
			},
			map[string]interface{}{
				"Sid":    "",
				"Effect": "Allow",
				"Action": []string{
					"autoscaling:DescribeAutoScalingInstances",
					"autoscaling:DescribeAutoScalingGroups",
					"ec2:DescribeLaunchTemplateVersions",
					"autoscaling:DescribeTags",
					"autoscaling:DescribeLaunchConfigurations",
				},
				"Resource": "*",
			},
		},
	})

	clusterAutoscalerRole, err := iam.NewRole(ctx, "cluster-autoscaler-role", &iam.RoleArgs{
		AssumeRolePolicy: pulumi.StringInput(jsonPolicyForAutoscaler),
		InlinePolicies: iam.RoleInlinePolicyArray{
			&iam.RoleInlinePolicyArgs{
				Name:   pulumi.String("policy-for-autoscaling"),
				Policy: pulumi.String(jsonAutoscalingPolicy),
			},
		},
		Tags: pulumi.StringMap{
			"tag-key": pulumi.String("tag-value"),
		},
	})

	_, err = helm.NewChart(ctx, "cluster-autoscaler", helm.ChartArgs{
		Chart:     pulumi.String("autoscaler/cluster-autoscaler"),
		Version:   pulumi.String("9.19.0"),
		Namespace: pulumi.String("kube-system"),
		FetchArgs: helm.FetchArgs{
			Repo: pulumi.String("https://kubernetes.github.io/autoscaler"),
		},
		Values: pulumi.Map{
			"autoDiscovery.clusterName": pulumi.StringInput(eksResources.eksCluster.Name),
			"rbac": pulumi.Map{
				"serviceAccount": pulumi.Map{
					"name":        pulumi.String("eks-autoscaler-sa"),
					"annotations": pulumi.StringInput(clusterAutoscalerRole.Arn),
				},
			},
		},
	}, pulumi.Provider(eksResources.k8sProvider))
	if err != nil {
		return err
	}

	// END of Cluster autoscaler

	return nil
}
